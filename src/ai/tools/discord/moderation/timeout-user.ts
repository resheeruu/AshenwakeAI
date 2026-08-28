import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { canModerate, canTarget } from "../../../../discord/moderation";
import { logger } from "../../../../logger";

/* ================================================================
 * VALIDATION CONSTANTS
 * ================================================================ */

const MIN_TIMEOUT_MINUTES = 1;
const MAX_TIMEOUT_MINUTES = 40320; // 28 days

/* ================================================================
 * timeout_user — Timeout (mute) a guild member.
 *
 * HIGH risk. Confirmation required. Moderator+ role.
 * ================================================================ */

export function createTimeoutUserTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "timeout_user",
    description: "Temporarily mute a member (timeout) in this server.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: ["ModerateMembers"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      {
        name: "userId",
        type: "string",
        description: "ID of the user to timeout",
        required: true,
      },
      {
        name: "durationMinutes",
        type: "number",
        description: "Duration in minutes (1-40320, i.e. 1 minute to 28 days)",
        required: true,
      },
      {
        name: "reason",
        type: "string",
        description: "Reason for the timeout",
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
      const durationMinutes = Number(context.arguments.durationMinutes);
      const reason = String(context.arguments.reason || "Timeout issued via AI tool").trim();

      if (!userId) {
        return { status: "validation_error", message: "Missing required parameter: userId" };
      }

      if (!Number.isFinite(durationMinutes) || durationMinutes < MIN_TIMEOUT_MINUTES || durationMinutes > MAX_TIMEOUT_MINUTES) {
        return {
          status: "validation_error",
          message: `Duration must be between ${MIN_TIMEOUT_MINUTES} and ${MAX_TIMEOUT_MINUTES} minutes (1 minute to 28 days).`,
        };
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
      if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return { status: "denied", message: "I don't have permission to timeout members.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Requester permission check
      if (!canModerate(requesterMember, PermissionFlagsBits.ModerateMembers)) {
        return { status: "denied", message: "You don't have permission to timeout members.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Target hierarchy check
      const targetCheck = canTarget(requesterMember, target, botMember);
      if (!targetCheck.allowed) {
        return { status: "denied", message: `❌ ${targetCheck.reason}`, denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Create plan
      const plan = createActionPlan(
        context,
        "high",
        [{ type: "modify", target: `@${target.user.tag}`, description: `Timeout user for ${durationMinutes}m: ${reason}` }],
        true,
      );
      (plan as any).toolName = "timeout_user";
      plan.arguments = { ...context.arguments, _targetUserId: userId, _targetTag: target.user.tag, _durationMinutes: durationMinutes };

      storePendingPlan(plan);

      return {
        status: "confirmation_required",
        message: [
          "📋 **ACTION PLAN**",
          "",
          "**Action:** Timeout User",
          `**Target:** ${target} (${target.user.tag})`,
          `**Duration:** ${durationMinutes} minute(s)`,
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
 * EXECUTE CONFIRMED PLAN — timeout_user
 * ================================================================ */

export async function executeTimeoutUserPlan(
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
  const durationMinutes = Number(plan.arguments._durationMinutes || plan.arguments.durationMinutes);
  const reason = String(plan.arguments.reason || "Timeout issued via AI tool").trim();

  if (!userId) {
    return { status: "validation_error", message: "Missing userId in plan." };
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes < MIN_TIMEOUT_MINUTES || durationMinutes > MAX_TIMEOUT_MINUTES) {
    return { status: "validation_error", message: `Invalid duration: ${durationMinutes}.` };
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
  if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return { status: "denied", message: "Bot no longer has ModerateMembers permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Re-check requester permissions
  if (!canModerate(requesterMember, PermissionFlagsBits.ModerateMembers)) {
    return { status: "denied", message: "Permission revoked. You no longer have ModerateMembers.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Re-check target hierarchy
  const targetCheck = canTarget(requesterMember, target, botMember);
  if (!targetCheck.allowed) {
    return { status: "denied", message: `❌ ${targetCheck.reason}`, denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Execute timeout
  try {
    await target.timeout(durationMinutes * 60 * 1000, reason);

    const result: ToolResult = {
      status: "success",
      message:
        `🔇 **Member timed out**\n` +
        `**Member:** ${target}\n` +
        `**Duration:** ${durationMinutes} minute(s)\n` +
        `**Reason:** ${reason}\n` +
        `Action ID: \`${plan.id}\``,
      data: { userId, durationMinutes, reason },
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
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`timeout_user execution failed: ${msg}`);
    return {
      status: "error",
      message: `❌ Discord rejected the timeout. Check my role position and permissions. (${msg})`,
    };
  }
}
