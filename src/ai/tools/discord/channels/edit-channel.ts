import type { Client } from "discord.js";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";
import { isChannelProtected, isProtectedCategory } from "../protection";

/* ================================================================
 * HELPER
 * ================================================================ */

function hasManageChannels(member: { permissions: { has: (perm: bigint) => boolean } }): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/* ================================================================
 * VALID CHANNEL EDIT PROPERTIES
 * ================================================================ */

const VALID_EDIT_FIELDS = ["name", "topic", "nsfw", "rateLimitPerUser", "position", "parentId"];

/* ================================================================
 * edit_channel — Modify safe channel properties.
 *
 * MEDIUM risk. Confirmation required. AI_MANAGEMENT scope.
 * ================================================================ */

export function createEditChannelTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "edit_channel",
    description: "Modify safe properties of an existing channel (name, topic, slowmode, nsfw).",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel to edit",
        required: true,
      },
      {
        name: "name",
        type: "string",
        description: "New channel name",
        required: false,
      },
      {
        name: "topic",
        type: "string",
        description: "New channel topic (max 1024 chars)",
        required: false,
      },
      {
        name: "nsfw",
        type: "boolean",
        description: "Set NSFW flag",
        required: false,
      },
      {
        name: "rateLimitPerUser",
        type: "number",
        description: "Slowmode in seconds (0-21600)",
        required: false,
      },
      {
        name: "parentId",
        type: "string",
        description: "Move to a different category",
        required: false,
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
          message: "Could not fetch guild.",
          denialReason: "GUILD_ONLY",
        };
      }

      // ── Argument validation ──────────────────────────────────────
      const channelId = String(context.arguments.channelId || "").trim();
      if (!channelId) {
        return { status: "validation_error", message: "Missing required parameter: channelId" };
      }

      // Build update payload — only include supplied fields
      const updates: Record<string, unknown> = {};
      const changes: Array<{ type: string; target: string; description: string; before?: string; after?: string }> = [];

      const name = context.arguments.name !== undefined ? String(context.arguments.name).trim() : undefined;
      const topic = context.arguments.topic !== undefined ? String(context.arguments.topic) : undefined;
      const nsfw = context.arguments.nsfw !== undefined ? Boolean(context.arguments.nsfw) : undefined;
      const rateLimitPerUser = context.arguments.rateLimitPerUser !== undefined ? Number(context.arguments.rateLimitPerUser) : undefined;
      const parentId = context.arguments.parentId !== undefined ? String(context.arguments.parentId).trim() : undefined;

      if (name !== undefined) {
        if (!name || name.length < 1 || name.length > 100) {
          return { status: "validation_error", message: "Channel name must be 1-100 characters." };
        }
        if (!/^[a-z0-9\-_]+$/i.test(name)) {
          return { status: "validation_error", message: "Channel name can only contain letters, numbers, hyphens, and underscores." };
        }
        updates.name = name;
      }

      if (topic !== undefined) {
        if (topic.length > 1024) {
          return { status: "validation_error", message: "Channel topic must be 1024 characters or fewer." };
        }
        updates.topic = topic;
      }

      if (nsfw !== undefined) {
        updates.nsfw = nsfw;
      }

      if (rateLimitPerUser !== undefined) {
        if (rateLimitPerUser < 0 || rateLimitPerUser > 21600) {
          return { status: "validation_error", message: "Slowmode must be between 0 and 21600 seconds." };
        }
        updates.rateLimitPerUser = rateLimitPerUser;
      }

      if (parentId !== undefined) {
        if (parentId) {
          const category = guild.channels.cache.get(parentId);
          if (!category || category.type !== ChannelType.GuildCategory) {
            return { status: "validation_error", message: `Category "${parentId}" not found or is not a category.` };
          }
          if (category.guild.id !== guild.id) {
            return { status: "denied", message: "Category belongs to a different guild.", denialReason: "GUILD_ONLY" };
          }
          // Deny moving INTO a protected category via edit
          if (isProtectedCategory(context.guildId, parentId)) {
            return {
              status: "denied",
              message: `❌ Cannot move channel into protected category "${category.name}".`,
              denialReason: "PROTECTED_RESOURCE",
            };
          }
        }
        updates.parentId = parentId || null;
      }

      if (Object.keys(updates).length === 0) {
        return { status: "validation_error", message: "No properties to update. Provide at least one field to edit." };
      }

      // ── Target channel check ─────────────────────────────────────
      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) {
        return {
          status: "denied",
          message: `Channel "${channelId}" not found in this guild.`,
          denialReason: "RESOURCE_NOT_FOUND",
        };
      }

      if (targetChannel.guild.id !== guild.id) {
        return {
          status: "denied",
          message: "Channel belongs to a different guild.",
          denialReason: "GUILD_ONLY",
        };
      }

      // ── Protected channel check (including category inheritance) ──
      if (isChannelProtected(context.guildId, channelId, targetChannel.parentId)) {
        return {
          status: "denied",
          message: `❌ Cannot edit protected channel #${targetChannel.name}.`,
          denialReason: "PROTECTED_RESOURCE",
        };
      }

      // ── Requester permission check ───────────────────────────────
      const requesterMember = context.requesterId
        ? await guild.members.fetch(context.requesterId).catch(() => null)
        : null;

      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result: ToolResult = {
          status: "denied",
          message: "❌ You do not have the **ManageChannels** permission.",
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
          message: "❌ The bot does not have **ManageChannels** permission.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Build ActionPlan ─────────────────────────────────────────
      const oldName = targetChannel.name;
      const changeList: Array<{ type: "create" | "modify" | "delete" | "assign" | "remove"; target: string; description: string; before?: string; after?: string }> = [];

      if (updates.name) changeList.push({ type: "modify", target: `#${oldName}`, description: `Rename to #${updates.name}`, before: oldName, after: String(updates.name) });
      if (updates.topic !== undefined) changeList.push({ type: "modify", target: `#${oldName}`, description: "Update topic", before: "set", after: "updated" });
      if (updates.nsfw !== undefined) changeList.push({ type: "modify", target: `#${oldName}`, description: `Set NSFW to ${updates.nsfw}` });
      if (updates.rateLimitPerUser !== undefined) changeList.push({ type: "modify", target: `#${oldName}`, description: `Set slowmode to ${updates.rateLimitPerUser}s` });
      if (updates.parentId !== undefined) changeList.push({ type: "modify", target: `#${oldName}`, description: "Move category" });

      const plan = createActionPlan(context, "medium", changeList, true);
      (plan as any).toolName = "edit_channel";
      plan.arguments = { ...context.arguments };

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Edit Channel`,
        `**Channel:** #${oldName}`,
        ...changeList.map((c) => `• ${c.description}`),
        "",
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

export async function executeEditChannel(
  plan: ActionPlan,
  getClient: () => Client | null,
): Promise<ToolResult> {
  const startTime = Date.now();
  const client = getClient();
  if (!client) return { status: "error", message: "Discord client is not connected." };

  const guild = await client.guilds.fetch(plan.guildId).catch(() => null);
  if (!guild) return { status: "denied", message: "Guild not found.", denialReason: "GUILD_ONLY" };

  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember || !hasManageChannels(requesterMember)) {
    return { status: "denied", message: "❌ Permission revoked.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  const botMember = await guild.members.me;
  if (!botMember || !hasManageChannels(botMember)) {
    return { status: "denied", message: "❌ Bot lost ManageChannels.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  const channelId = String(plan.arguments.channelId || "").trim();
  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) return { status: "error", message: "Channel no longer exists." };

  // Re-check protected (including category inheritance)
  if (isChannelProtected(plan.guildId, channelId, targetChannel.parentId)) {
    return { status: "denied", message: "❌ Channel is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }

  const updates: Record<string, unknown> = {};
  if (plan.arguments.name !== undefined) updates.name = String(plan.arguments.name).trim();
  if (plan.arguments.topic !== undefined) updates.topic = String(plan.arguments.topic);
  if (plan.arguments.nsfw !== undefined) updates.nsfw = Boolean(plan.arguments.nsfw);
  if (plan.arguments.rateLimitPerUser !== undefined) updates.rateLimitPerUser = Number(plan.arguments.rateLimitPerUser);
  if (plan.arguments.parentId !== undefined) {
    const parentId = String(plan.arguments.parentId).trim();
    // Re-check: deny moving into a protected category
    if (parentId && isProtectedCategory(plan.guildId, parentId)) {
      return { status: "denied", message: "❌ Target category is now protected.", denialReason: "PROTECTED_RESOURCE" };
    }
    updates.parentId = parentId || null;
  }

  try {
    await (targetChannel as any).edit(updates);

    const result: ToolResult = {
      status: "success",
      message: `✅ **Channel updated** #${targetChannel.name}\nAction ID: \`${plan.id}\``,
      data: { channelId: targetChannel.id, name: targetChannel.name },
    };

    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: "confirmed" } as any,
      "success", undefined, startTime, false,
    );
    return result;
  } catch (error) {
    logger.error(`edit_channel execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: `❌ Edit failed. The issue has been logged.` };
  }
}
