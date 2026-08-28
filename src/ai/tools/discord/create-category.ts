import type { Client } from "discord.js";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../types";
import { createActionPlan } from "../executor";
import { storePendingPlan } from "../confirmation-store";
import { recordToolAudit } from "../audit";
import { logger } from "../../../logger";

/* ================================================================
 * HELPER
 * ================================================================ */

function hasManageChannels(member: { permissions: { has: (perm: bigint) => boolean } }): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/* ================================================================
 * create_category — Create a new category in the current guild.
 *
 * MEDIUM risk. Confirmation required. AI_MANAGEMENT scope.
 * ================================================================ */

export function createCreateCategoryTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "create_category",
    description: "Create a new category in the current server.",
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
        description: "Category name (alphanumeric, hyphens, underscores)",
        required: true,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const startTime = Date.now();
      const client = getClient();

      if (!client) {
        return { status: "error", message: "Discord client is not connected." };
      }

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) {
        return {
          status: "denied",
          message: "Could not fetch guild. The bot may not be in this server.",
          denialReason: "GUILD_ONLY",
        };
      }

      // ── Argument validation ──────────────────────────────────────
      const name = String(context.arguments.name || "").trim();

      if (!name || name.length < 1 || name.length > 100) {
        return {
          status: "validation_error",
          message: "Category name must be 1-100 characters.",
        };
      }

      if (!/^[a-z0-9\-_]+$/i.test(name)) {
        return {
          status: "validation_error",
          message: "Category name can only contain letters, numbers, hyphens, and underscores.",
        };
      }

      // ── Requester permission check ───────────────────────────────
      const requesterMember = context.requesterId
        ? await guild.members.fetch(context.requesterId).catch(() => null)
        : null;

      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result: ToolResult = {
          status: "denied",
          message: "❌ You do not have the **ManageChannels** permission required to create categories.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Bot permission check ─────────────────────────────────────
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result: ToolResult = {
          status: "denied",
          message: "❌ The bot does not have the **ManageChannels** permission required to create categories.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Duplicate check ──────────────────────────────────────────
      const existingCategory = guild.channels.cache.find(
        (ch) => ch.type === ChannelType.GuildCategory && ch.name === name,
      );
      if (existingCategory) {
        return {
          status: "validation_error",
          message: `❌ Category **${name}** already exists.`,
          denialReason: "CATEGORY_ALREADY_EXISTS",
        };
      }

      // ── Generate ActionPlan ──────────────────────────────────────
      const plan = createActionPlan(
        context,
        "medium",
        [
          {
            type: "create",
            target: name,
            description: "Create category",
            permissions: "ManageChannels",
          },
        ],
        true,
      );
      (plan as any).toolName = "create_category";

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Create Category`,
        `**Name:** ${name}`,
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
 * ================================================================ */

export async function executeCreateCategory(
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

  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember || !hasManageChannels(requesterMember)) {
    return {
      status: "denied",
      message: "❌ Permission revoked. You no longer have ManageChannels.",
      denialReason: "MISSING_DISCORD_PERMISSION",
    };
  }

  const botMember = await guild.members.me;
  if (!botMember || !hasManageChannels(botMember)) {
    return {
      status: "denied",
      message: "❌ Bot no longer has ManageChannels permission.",
      denialReason: "MISSING_DISCORD_PERMISSION",
    };
  }

  const name = String(plan.arguments.name || "").trim();

  // Re-check duplicate
  const existingCategory = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildCategory && ch.name === name,
  );
  if (existingCategory) {
    return {
      status: "validation_error",
      message: `❌ Category **${name}** already exists.`,
      denialReason: "CATEGORY_ALREADY_EXISTS",
    };
  }

  try {
    const newCategory = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
    });

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Category created**\n` +
        `${newCategory.name}\n` +
        `Action ID: \`${plan.id}\``,
      data: {
        categoryId: newCategory.id,
        name: newCategory.name,
      },
    };

    recordToolAudit(
      { ...plan, arguments: plan.arguments, channelId: plan.channelId, requesterName: "confirmed" } as any,
      "success",
      undefined,
      startTime,
      false,
    );

    return result;
  } catch (error) {
    logger.error(`create_category execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `❌ Category creation failed. The issue has been logged.`,
    };
  }
}
