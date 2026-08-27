import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";
import { isChannelProtected } from "../protection";

function hasManageChannels(member: { permissions: { has: (perm: bigint) => boolean } }): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/* ================================================================
 * delete_channel — Delete an existing channel.
 *
 * HIGH risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createDeleteChannelTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "delete_channel",
    description: "Permanently delete a channel. This cannot be undone.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel to delete",
        required: true,
      },
    ],
    execute: async (context: ToolContext): Promise<ToolResult> => {
      const startTime = Date.now();
      const client = getClient();

      if (!client) return { status: "error", message: "Discord client is not connected." };

      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };

      const channelId = String(context.arguments.channelId || "").trim();
      if (!channelId) return { status: "validation_error", message: "Missing required parameter: channelId" };

      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) return { status: "denied", message: `Channel "${channelId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      if (targetChannel.guild.id !== guild.id) return { status: "denied", message: "Channel belongs to a different guild.", denialReason: "GUILD_ONLY" };

      // ── Protected channel check (including category inheritance) ──
      if (isChannelProtected(context.guildId, channelId, targetChannel.parentId)) {
        return { status: "denied", message: `❌ Cannot delete protected channel #${targetChannel.name}.`, denialReason: "PROTECTED_RESOURCE" };
      }

      // ── Requester permission check ───────────────────────────────
      const requesterMember = context.requesterId
        ? await guild.members.fetch(context.requesterId).catch(() => null)
        : null;

      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result: ToolResult = { status: "denied", message: "❌ You do not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Bot permission check ─────────────────────────────────────
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result: ToolResult = { status: "denied", message: "❌ Bot does not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        recordToolAudit(context, result.status, result.denialReason, startTime, false);
        return result;
      }

      // ── Build ActionPlan ─────────────────────────────────────────
      const plan = createActionPlan(
        context,
        "high",
        [{
          type: "delete",
          target: `#${targetChannel.name}`,
          description: `Delete ${targetChannel.type === 4 ? "category" : "channel"}`,
          permissions: "ManageChannels",
        }],
        true,
      );
      (plan as any).toolName = "delete_channel";
      plan.arguments = { ...context.arguments };

      storePendingPlan(plan);

      const lines = [
        "⚠️ **DESTRUCTIVE ACTION**",
        "",
        `**Action:** Delete Channel`,
        `**Channel:** #${targetChannel.name}`,
        `**Guild:** ${guild.name}`,
        "",
        "This cannot be automatically undone.",
        "",
        `**Risk:** HIGH`,
        `**Required:** ManageChannels`,
        `**Requested by:** <@${context.requesterId}>`,
        "",
        `**Action ID:** \`${plan.id}\``,
        `**Expires:** 5 minutes`,
      ];

      return { status: "confirmation_required", message: lines.join("\n"), plan };
    },
  };
}

export async function executeDeleteChannel(
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

  const channelName = targetChannel.name;

  try {
    await targetChannel.delete();

    const result: ToolResult = {
      status: "success",
      message: `✅ **Channel deleted** #${channelName}\nAction ID: \`${plan.id}\``,
      data: { channelId, name: channelName },
    };

    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: "confirmed" } as any,
      "success", undefined, startTime, false,
    );
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`delete_channel execution failed: ${msg}`);
    return { status: "error", message: `❌ Delete failed: ${msg}` };
  }
}
