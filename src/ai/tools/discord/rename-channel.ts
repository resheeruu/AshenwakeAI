import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../types";
import { createActionPlan } from "../executor";
import { storePendingPlan } from "../confirmation-store";
import { recordToolAudit } from "../audit";
import { logger } from "../../../logger";
import { isChannelProtected } from "./protection";

/* ================================================================
 * HELPER
 * ================================================================ */

function hasManageChannels(member: { permissions: { has: (perm: bigint) => boolean } }): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/* ================================================================
 * rename_channel — Rename an existing channel.
 *
 * MEDIUM risk. Confirmation required. AI_MANAGEMENT scope.
 * ================================================================ */

export function createRenameChannelTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "rename_channel",
    description: "Rename an existing channel in the current server.",
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
        description: "ID of the channel to rename",
        required: true,
      },
      {
        name: "newName",
        type: "string",
        description: "New channel name",
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
          message: "Could not fetch guild.",
          denialReason: "GUILD_ONLY",
        };
      }

      // ── Argument validation ──────────────────────────────────────
      const channelId = String(context.arguments.channelId || "").trim();
      const newName = String(context.arguments.newName || "").trim();

      if (!channelId) {
        return { status: "validation_error", message: "Missing required parameter: channelId" };
      }

      if (!newName || newName.length < 1 || newName.length > 100) {
        return { status: "validation_error", message: "New name must be 1-100 characters." };
      }

      if (!/^[a-z0-9\-_]+$/i.test(newName)) {
        return {
          status: "validation_error",
          message: "Channel name can only contain letters, numbers, hyphens, and underscores.",
        };
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
          message: `❌ Cannot rename protected channel #${targetChannel.name}.`,
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
          message: "❌ You do not have the **ManageChannels** permission required to rename channels.",
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
          message: "❌ The bot does not have the **ManageChannels** permission required to rename channels.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Duplicate check ──────────────────────────────────────────
      const conflict = guild.channels.cache.find(
        (ch) => ch.name === newName && ch.parentId === targetChannel.parentId && ch.id !== channelId,
      );
      if (conflict) {
        return {
          status: "validation_error",
          message: `❌ A channel named **#${newName}** already exists in the same category.`,
          denialReason: "CHANNEL_ALREADY_EXISTS",
        };
      }

      // ── Generate ActionPlan ──────────────────────────────────────
      const oldName = targetChannel.name;
      const plan = createActionPlan(
        context,
        "medium",
        [
          {
            type: "modify",
            target: `#${oldName}`,
            description: `Rename to #${newName}`,
            before: oldName,
            after: newName,
            permissions: "ManageChannels",
          },
        ],
        true,
      );
      (plan as any).toolName = "rename_channel";

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Rename Channel`,
        `**From:** #${oldName}`,
        `**To:** #${newName}`,
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

export async function executeRenameChannel(
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
      message: "❌ Permission revoked.",
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

  const channelId = String(plan.arguments.channelId || "").trim();
  const newName = String(plan.arguments.newName || "").trim();

  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) {
    return { status: "error", message: "Channel no longer exists." };
  }

    // Re-check protected (including category inheritance)
    if (isChannelProtected(plan.guildId, channelId, targetChannel.parentId)) {
      return { status: "denied", message: "❌ Channel is now protected.", denialReason: "PROTECTED_RESOURCE" };
    }

  // Re-check duplicate
  const conflict = guild.channels.cache.find(
    (ch) => ch.name === newName && ch.parentId === targetChannel.parentId && ch.id !== channelId,
  );
  if (conflict) {
    return {
      status: "validation_error",
      message: `❌ A channel named **#${newName}** already exists.`,
      denialReason: "CHANNEL_ALREADY_EXISTS",
    };
  }

  const oldName = targetChannel.name;

  try {
    await targetChannel.setName(newName);

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Channel renamed**\n` +
        `#${oldName} → #${newName}\n` +
        `Action ID: \`${plan.id}\``,
      data: {
        channelId: targetChannel.id,
        oldName,
        newName,
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
    logger.error(`rename_channel execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `❌ Rename failed. The issue has been logged.`,
    };
  }
}
