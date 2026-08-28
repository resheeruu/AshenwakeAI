import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { canModerate, canTarget } from "../../../../discord/moderation";
import { logger } from "../../../../logger";

/* ================================================================
 * untimeout_user — Remove timeout from a guild member.
 *
 * MEDIUM risk. Confirmation required. Moderator+ role.
 * ================================================================ */

export function createUntimeoutUserTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "untimeout_user",
    description: "Remove an active timeout (unmute) from a member.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: ["ModerateMembers"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "userId",
        type: "string",
        description: "ID of the user to untimeout",
        required: true,
      },
      {
        name: "reason",
        type: "string",
        description: "Reason for removing the timeout",
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
      const reason = String(context.arguments.reason || "Timeout removed via AI tool").trim();

      if (!userId) {
        return { status: "validation_error", message: "Missing required parameter: userId" };
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
        return { status: "denied", message: "I don't have permission to modify timeouts.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Requester permission check
      if (!canModerate(requesterMember, PermissionFlagsBits.ModerateMembers)) {
        return { status: "denied", message: "You don't have permission to modify timeouts.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Target hierarchy check
      const targetCheck = canTarget(requesterMember, target, botMember);
      if (!targetCheck.allowed) {
        return { status: "denied", message: `❌ ${targetCheck.reason}`, denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Check if target is actually timed out
      if (!target.isCommunicationDisabled()) {
        return { status: "validation_error", message: "This member is not currently timed out." };
      }

      // Create plan
      const plan = createActionPlan(
        context,
        "medium",
        [{ type: "modify", target: `@${target.user.tag}`, description: `Remove timeout: ${reason}` }],
        true,
      );
      (plan as any).toolName = "untimeout_user";
      plan.arguments = { ...context.arguments, _targetUserId: userId, _targetTag: target.user.tag };

      storePendingPlan(plan);

      return {
        status: "confirmation_required",
        message: [
          "📋 **ACTION PLAN**",
          "",
          "**Action:** Remove Timeout",
          `**Target:** ${target} (${target.user.tag})`,
          `**Reason:** ${reason}`,
          "",
          "**Risk:** MEDIUM",
          `**Action ID:** \`${plan.id}\``,
          "**Expires:** 5 minutes",
        ].join("\n"),
        plan,
      };
    },
  };
}

/* ================================================================
 * EXECUTE CONFIRMED PLAN — untimeout_user
 * ================================================================ */

export async function executeUntimeoutUserPlan(
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
  const reason = String(plan.arguments.reason || "Timeout removed via AI tool").trim();

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

  // Re-check if target is actually timed out
  if (!target.isCommunicationDisabled()) {
    return { status: "validation_error", message: "This member is not currently timed out." };
  }

  // Execute untimeout
  try {
    await target.timeout(null, reason);

    const result: ToolResult = {
      status: "success",
      message:
        `🔊 **Timeout removed**\n` +
        `**Member:** ${target}\n` +
        `**Reason:** ${reason}\n` +
        `Action ID: \`${plan.id}\``,
      data: { userId, reason },
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
    logger.error(`untimeout_user execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `❌ Discord rejected the untimeout. Check my role position and permissions. The issue has been logged.`,
    };
  }
}
