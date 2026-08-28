import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { canModerate, canTarget } from "../../../../discord/moderation";
import { logger } from "../../../../logger";

/* ================================================================
 * ban_user — Ban a guild member.
 *
 * CRITICAL risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createBanUserTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "ban_user",
    description: "Permanently ban a member from this server.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["BanMembers"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "critical",
    parameters: [
      {
        name: "userId",
        type: "string",
        description: "ID of the user to ban",
        required: true,
      },
      {
        name: "reason",
        type: "string",
        description: "Reason for the ban",
        required: false,
      },
      {
        name: "deleteMessageDays",
        type: "number",
        description: "Number of days of messages to delete (0-7, default 0)",
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

      const userId = String(context.arguments.userId || "").trim();
      const reason = String(context.arguments.reason || "Ban issued via AI tool").trim();
      const deleteMessageDays = Number(context.arguments.deleteMessageDays || 0);

      if (!userId) {
        return { status: "validation_error", message: "Missing required parameter: userId" };
      }

      if (!Number.isFinite(deleteMessageDays) || deleteMessageDays < 0 || deleteMessageDays > 7) {
        return { status: "validation_error", message: "deleteMessageDays must be between 0 and 7." };
      }

      // Fetch target
      const target = await guild.members.fetch(userId).catch(() => null);
      if (!target) {
        return { status: "validation_error", message: `User "${userId}" not found in this server.` };
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
      if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        return { status: "denied", message: "I don't have permission to ban members.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Requester permission check
      if (!canModerate(requesterMember, PermissionFlagsBits.BanMembers)) {
        return { status: "denied", message: "You don't have permission to ban members.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Target hierarchy check
      const targetCheck = canTarget(requesterMember, target, botMember);
      if (!targetCheck.allowed) {
        return { status: "denied", message: `❌ ${targetCheck.reason}`, denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Create plan
      const plan = createActionPlan(
        context,
        "critical",
        [{ type: "delete", target: `@${target.user.tag}`, description: `Ban user: ${reason}` }],
        true,
      );
      (plan as any).toolName = "ban_user";
      plan.arguments = { ...context.arguments, _targetUserId: userId, _targetTag: target.user.tag, _deleteMessageDays: deleteMessageDays };

      storePendingPlan(plan);

      return {
        status: "confirmation_required",
        message: [
          "📋 **ACTION PLAN**",
          "",
          "**Action:** Ban User",
          `**Target:** ${target} (${target.user.tag})`,
          `**Reason:** ${reason}`,
          `**Delete Messages:** ${deleteMessageDays} day(s)`,
          "",
          "**Risk:** CRITICAL",
          `**Action ID:** \`${plan.id}\``,
          "**Expires:** 5 minutes",
        ].join("\n"),
        plan,
      };
    },
  };
}

/* ================================================================
 * EXECUTE CONFIRMED PLAN — ban_user
 * ================================================================ */

export async function executeBanUserPlan(
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

  const userId = String(plan.arguments._targetUserId || plan.arguments.userId || "").trim();
  const reason = String(plan.arguments.reason || "Ban issued via AI tool").trim();
  const deleteMessageDays = Number(plan.arguments._deleteMessageDays || plan.arguments.deleteMessageDays || 0);

  if (!userId) {
    return { status: "validation_error", message: "Missing userId in plan." };
  }

  // Re-check guild isolation
  if (plan.guildId !== guild.id) {
    return { status: "denied", message: "Plan guild does not match execution guild.", denialReason: "INVALID_ARGUMENTS" };
  }

  // Fetch target
  const target = await guild.members.fetch(userId).catch(() => null);
  if (!target) {
    return { status: "validation_error", message: `User "${userId}" not found in this server.` };
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
  if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
    return { status: "denied", message: "Bot no longer has BanMembers permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Re-check requester permissions
  if (!canModerate(requesterMember, PermissionFlagsBits.BanMembers)) {
    return { status: "denied", message: "Permission revoked. You no longer have BanMembers.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Re-check target hierarchy
  const targetCheck = canTarget(requesterMember, target, botMember);
  if (!targetCheck.allowed) {
    return { status: "denied", message: `❌ ${targetCheck.reason}`, denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Execute ban
  try {
    await target.ban({ deleteMessageSeconds: deleteMessageDays * 86400, reason });

    const result: ToolResult = {
      status: "success",
      message:
        `🔨 **Member banned**\n` +
        `**Member:** ${target.user.tag}\n` +
        `**Reason:** ${reason}\n` +
        `**Delete Messages:** ${deleteMessageDays} day(s)\n` +
        `Action ID: \`${plan.id}\``,
      data: { userId, reason, deleteMessageDays },
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
    logger.error(`ban_user execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `❌ Discord rejected the ban. Check my role position and permissions. The issue has been logged.`,
    };
  }
}
