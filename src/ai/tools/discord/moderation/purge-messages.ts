import type { Client, TextChannel } from "discord.js";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { isChannelProtected } from "../protection";
import { logger } from "../../../../logger";

/* ================================================================
 * VALIDATION CONSTANTS
 * ================================================================ */

const MIN_PURGE_COUNT = 1;
const MAX_PURGE_COUNT = 100;

/* ================================================================
 * purge_messages — Bulk delete messages from a channel.
 *
 * HIGH risk. Confirmation required. Moderator+ role.
 * ================================================================ */

export function createPurgeMessagesTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "purge_messages",
    description: "Bulk delete recent messages from a channel.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: ["ManageMessages"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel to purge messages from",
        required: true,
      },
      {
        name: "count",
        type: "number",
        description: "Number of messages to delete (1-100)",
        required: true,
      },
      {
        name: "reason",
        type: "string",
        description: "Reason for the purge",
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
        return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      }

      const channelId = String(context.arguments.channelId || "").trim();
      const count = Number(context.arguments.count);
      const reason = String(context.arguments.reason || "Purge via AI tool").trim();

      if (!channelId) {
        return { status: "validation_error", message: "Missing required parameter: channelId" };
      }

      if (!Number.isFinite(count) || count < MIN_PURGE_COUNT || count > MAX_PURGE_COUNT) {
        return {
          status: "validation_error",
          message: `Count must be between ${MIN_PURGE_COUNT} and ${MAX_PURGE_COUNT}.`,
        };
      }

      // Fetch channel
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return { status: "validation_error", message: `Channel "${channelId}" not found.` };
      }

      if (channel.type !== ChannelType.GuildText) {
        return { status: "validation_error", message: "Purge is only available in text channels." };
      }

      // Protected channel check
      if (isChannelProtected(context.guildId, channelId)) {
        return {
          status: "denied",
          message: "❌ This channel is protected. Messages cannot be purged from protected channels.",
          denialReason: "PROTECTED_RESOURCE",
        };
      }

      // Fetch requester
      const requesterMember = await guild.members.fetch(context.requesterId).catch(() => null);
      if (!requesterMember) {
        return { status: "denied", message: "You are not a member of this server.", denialReason: "GUILD_ONLY" };
      }

      // Fetch bot
      const botMember = await guild.members.me;
      if (!botMember) {
        return { status: "error", message: "Could not fetch bot member." };
      }

      // Bot permission check
      if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return { status: "denied", message: "I don't have permission to delete messages.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Requester permission check
      if (!requesterMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return { status: "denied", message: "You don't have permission to delete messages.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Create plan
      const plan = createActionPlan(
        context,
        "high",
        [{ type: "delete", target: `${count} messages in #${channel.name}`, description: `Purge ${count} messages: ${reason}` }],
        true,
      );
      (plan as any).toolName = "purge_messages";
      plan.arguments = { ...context.arguments, _channelName: channel.name, _count: count };

      storePendingPlan(plan);

      return {
        status: "confirmation_required",
        message: [
          "📋 **ACTION PLAN**",
          "",
          "**Action:** Purge Messages",
          `**Channel:** <#${channelId}> (${channel.name})`,
          `**Count:** ${count} message(s)`,
          `**Reason:** ${reason}`,
          "",
          "**Risk:** HIGH",
          `**Action ID:** \`${plan.id}\``,
          "**Expires:** 5 minutes",
        ].join("\n"),
        plan,
      };
    },
  };
}

/* ================================================================
 * EXECUTE CONFIRMED PLAN — purge_messages
 * ================================================================ */

export async function executePurgeMessagesPlan(
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

  const channelId = String(plan.arguments.channelId || "").trim();
  const count = Number(plan.arguments._count || plan.arguments.count);
  const reason = String(plan.arguments.reason || "Purge via AI tool").trim();

  if (!channelId) {
    return { status: "validation_error", message: "Missing channelId in plan." };
  }

  if (!Number.isFinite(count) || count < MIN_PURGE_COUNT || count > MAX_PURGE_COUNT) {
    return { status: "validation_error", message: `Invalid count: ${count}.` };
  }

  // Re-check guild isolation
  if (plan.guildId !== guild.id) {
    return { status: "denied", message: "Plan guild does not match execution guild.", denialReason: "INVALID_ARGUMENTS" };
  }

  // Fetch channel
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return { status: "validation_error", message: `Channel "${channelId}" not found.` };
  }

  if (channel.type !== ChannelType.GuildText) {
    return { status: "validation_error", message: "Purge is only available in text channels." };
  }

  // Re-check protected channel
  if (isChannelProtected(plan.guildId, channelId)) {
    return {
      status: "denied",
      message: "❌ This channel is now protected. Protection was added after this plan was created.",
      denialReason: "PROTECTED_RESOURCE",
    };
  }

  // Fetch requester
  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember) {
    return { status: "denied", message: "Requester is not a member of this server.", denialReason: "GUILD_ONLY" };
  }

  // Fetch bot
  const botMember = await guild.members.me;
  if (!botMember) {
    return { status: "error", message: "Could not fetch bot member." };
  }

  // Re-check bot permissions
  if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return { status: "denied", message: "Bot no longer has ManageMessages permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Re-check requester permissions
  if (!requesterMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return { status: "denied", message: "Permission revoked. You no longer have ManageMessages.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Execute purge
  try {
    const textChannel = channel as TextChannel;
    const deleted = await textChannel.bulkDelete(count, true);

    const result: ToolResult = {
      status: "success",
      message:
        `🗑️ **Messages purged**\n` +
        `**Channel:** <#${channelId}> (${channel.name})\n` +
        `**Deleted:** ${deleted.size} message(s)\n` +
        `**Reason:** ${reason}\n` +
        `Action ID: \`${plan.id}\``,
      data: { channelId, deleted: deleted.size, reason },
    };

    recordToolAudit(
      { ...plan, channelId: plan.channelId, requesterName: "confirmed" } as any,
      "success",
      undefined,
      startTime,
      false,
    );

    return result;
  } catch (error) {
    logger.error(`purge_messages execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `❌ Discord rejected the purge. Messages may be too old (14+ days) or I lack permissions. The issue has been logged.`,
    };
  }
}
