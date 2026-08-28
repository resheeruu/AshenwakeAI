import type { Client, GuildChannel, ChannelType as DiscordChannelType } from "discord.js";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../types";
import { createActionPlan } from "../executor";
import { storePendingPlan } from "../confirmation-store";
import { recordToolAudit } from "../audit";
import { loadGuildAIConfig } from "../channel-scope";
import { validateToolRequest } from "../validator";
import { logger } from "../../../logger";

/* ================================================================
 * DISCORD CHANNEL TYPE MAP
 * ================================================================ */

const TYPE_MAP: Record<string, DiscordChannelType> = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
};

const TYPE_NAMES: Record<number, string> = {
  [ChannelType.GuildText]: "Text",
  [ChannelType.GuildVoice]: "Voice",
  [ChannelType.GuildAnnouncement]: "Announcement",
  [ChannelType.GuildForum]: "Forum",
};

const VALID_TYPES = ["text", "voice", "announcement", "forum"];

/* ================================================================
 * HELPER: CHECK DISCORD PERMISSIONS
 * ================================================================ */

function hasManageChannels(member: { permissions: { has: (perm: bigint) => boolean } }): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/* ================================================================
 * create_channel — Create a new channel in the current guild.
 *
 * MEDIUM risk. Confirmation required. AI_MANAGEMENT scope.
 * ================================================================ */

export function createCreateChannelTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "create_channel",
    description: "Create a new channel in the current server.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "Channel name (alphanumeric, hyphens, underscores)",
        required: true,
      },
      {
        name: "type",
        type: "string",
        description: "Channel type",
        required: true,
        allowedValues: VALID_TYPES,
      },
      {
        name: "categoryId",
        type: "string",
        description: "Category ID to place the channel in (optional)",
        required: false,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const startTime = Date.now();
      const client = getClient();

      // ── 1. Discord client check ──────────────────────────────────
      if (!client) {
        return { status: "error", message: "Discord client is not connected." };
      }

      // ── 2. Guild check ───────────────────────────────────────────
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) {
        return {
          status: "denied",
          message: "Could not fetch guild. The bot may not be in this server.",
          denialReason: "GUILD_ONLY",
        };
      }

      // ── 3. Argument validation ───────────────────────────────────
      const name = String(context.arguments.name || "").trim();
      const type = String(context.arguments.type || "").toLowerCase();
      const categoryId = context.arguments.categoryId as string | undefined;

      if (!name || name.length < 1 || name.length > 100) {
        return {
          status: "validation_error",
          message: "Channel name must be 1-100 characters.",
        };
      }

      if (!/^[a-z0-9\-_]+$/i.test(name)) {
        return {
          status: "validation_error",
          message: "Channel name can only contain letters, numbers, hyphens, and underscores.",
        };
      }

      if (!TYPE_MAP[type]) {
        return {
          status: "validation_error",
          message: `Invalid channel type "${type}". Allowed: ${VALID_TYPES.join(", ")}`,
        };
      }

      // ── 4. Requester Discord permission check ────────────────────
      const requesterMember = context.requesterId
        ? await guild.members.fetch(context.requesterId).catch(() => null)
        : null;

      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result: ToolResult = {
          status: "denied",
          message: "❌ You do not have the **ManageChannels** permission required to create channels.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── 5. Bot Discord permission check ──────────────────────────
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result: ToolResult = {
          status: "denied",
          message: "❌ The bot does not have the **ManageChannels** permission required to create channels.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── 6. Category validation ───────────────────────────────────
      if (categoryId) {
        const category = guild.channels.cache.get(categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
          return {
            status: "validation_error",
            message: `Category "${categoryId}" not found or is not a category.`,
          };
        }
        if (category.guild.id !== guild.id) {
          return {
            status: "denied",
            message: "Category belongs to a different guild.",
            denialReason: "GUILD_ONLY",
          };
        }
      }

      // ── 7. Duplicate check ───────────────────────────────────────
      const existingChannel = guild.channels.cache.find(
        (ch) => ch.name === name && ch.parentId === (categoryId || null),
      );
      if (existingChannel) {
        return {
          status: "validation_error",
          message: `❌ Channel **#${name}** already exists in this category.`,
          denialReason: "CHANNEL_ALREADY_EXISTS",
        };
      }

      // ── 8. Generate ActionPlan ───────────────────────────────────
      const discordType = TYPE_MAP[type];
      const categoryName = categoryId
        ? guild.channels.cache.get(categoryId)?.name || "Unknown"
        : "None";

      const plan = createActionPlan(
        context,
        "medium",
        [
          {
            type: "create",
            target: `#${name}`,
            description: `Create ${TYPE_NAMES[discordType] || type} channel`,
            permissions: "ManageChannels",
          },
        ],
        true,
      );

      // Override plan toolName
      (plan as any).toolName = "create_channel";

      storePendingPlan(plan);

      // ── 9. Return confirmation prompt ────────────────────────────
      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Create Channel`,
        `**Name:** #${name}`,
        `**Type:** ${TYPE_NAMES[discordType] || type}`,
        `**Category:** ${categoryName}`,
        `**Risk:** MEDIUM`,
        `**Required:** ManageChannels`,
        `**Requested by:** <@${context.requesterId}>`,
        "",
        `**Action ID:** \`${plan.id}\``,
        `**Expires:** 5 minutes`,
      ];

      return {
        status: "confirmation_required",
        message: lines.join("\n"),
        plan,
      };
    },
  };
}

/* ================================================================
 * EXECUTE CONFIRMED PLAN
 *
 * Called by the interaction handler after verification.
 * Re-checks all permissions before executing.
 * ================================================================ */

export async function executeCreateChannel(
  plan: ActionPlan,
  getClient: () => Client | null,
): Promise<ToolResult> {
  const startTime = Date.now();
  const client = getClient();
  if (!client) {
    return { status: "error", message: "Discord client is not connected." };
  }

  const guild = await client.guilds.fetch(plan.guildId).catch(() => null);
  if (!guild) {
    return { status: "denied", message: "Guild not found.", denialReason: "GUILD_ONLY" };
  }

  // Re-check requester permissions
  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember || !hasManageChannels(requesterMember)) {
    return {
      status: "denied",
      message: "❌ Permission revoked. You no longer have ManageChannels.",
      denialReason: "MISSING_DISCORD_PERMISSION",
    };
  }

  // Re-check bot permissions
  const botMember = await guild.members.me;
  if (!botMember || !hasManageChannels(botMember)) {
    return {
      status: "denied",
      message: "❌ Bot no longer has ManageChannels permission.",
      denialReason: "MISSING_DISCORD_PERMISSION",
    };
  }

  const args = plan.arguments;
  const name = String(args.name || "").trim();
  const type = String(args.type || "").toLowerCase();
  const categoryId = args.categoryId as string | undefined;
  const discordType = TYPE_MAP[type];

  // Re-check category
  if (categoryId) {
    const category = guild.channels.cache.get(categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return { status: "error", message: "Category no longer exists." };
    }
  }

  // Re-check duplicate
  const existingChannel = guild.channels.cache.find(
    (ch) => ch.name === name && ch.parentId === (categoryId || null),
  );
  if (existingChannel) {
    return {
      status: "validation_error",
      message: `❌ Channel **#${name}** already exists.`,
      denialReason: "CHANNEL_ALREADY_EXISTS",
    };
  }

  // Execute
  try {
    const newChannel = await guild.channels.create({
      name,
      type: discordType as any,
      parent: categoryId || undefined,
    });

    const categoryName = newChannel.parent?.name || "None";
    const typeName = TYPE_NAMES[newChannel.type] || type;

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Channel created**\n` +
        `#${newChannel.name}\n` +
        `Type: ${typeName}\n` +
        `Category: ${categoryName}\n` +
        `Action ID: \`${plan.id}\``,
      data: {
        channelId: newChannel.id,
        name: newChannel.name,
        type: typeName,
        category: categoryName,
      },
    };

    recordToolAudit(
      {
        ...plan,
        arguments: plan.arguments,
        channelId: plan.channelId,
        requesterName: "confirmed",
      } as any,
      "success",
      undefined,
      startTime,
      false,
    );

    return result;
  } catch (error) {
    logger.error(`create_channel execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `❌ Channel creation failed. The issue has been logged.`,
    };
  }
}
