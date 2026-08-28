import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { canModerate, canTarget } from "../../../../discord/moderation";
import { logger } from "../../../../logger";

/* ================================================================
 * kick_user — Kick a guild member.
 *
 * HIGH risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createKickUserTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "kick_user",
    description: "Remove a member from this server (they can rejoin with an invite).",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["KickMembers"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      {
        name: "userId",
        type: "string",
        description: "ID of the user to kick",
        required: true,
      },
      {
        name: "reason",
        type: "string",
        description: "Reason for the kick",
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
      const reason = String(context.arguments.reason || "Kick issued via AI tool").trim();

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
      if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
        return { status: "denied", message: "I don't have permission to kick members.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }

      // Requester permission check
      if (!canModerate(requesterMember, PermissionFlagsBits.KickMembers)) {
        return { status: "denied", message: "You don't have permission to kick members.", denialReason: "MISSING_DISCORD_PERMISSION" };
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
        [{ type: "delete", target: `@${target.user.tag}`, description: `Kick user: ${reason}` }],
        true,
      );
      (plan as any).toolName = "kick_user";
      plan.arguments = { ...context.arguments, _targetUserId: userId, _targetTag: target.user.tag };

      storePendingPlan(plan);

      return {
        status: "confirmation_required",
        message: [
          "📋 **ACTION PLAN**",
          "",
          "**Action:** Kick User",
          `**Target:** ${target} (${target.user.tag})`,
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
 * EXECUTE CONFIRMED PLAN — kick_user
 * ================================================================ */

export async function executeKickUserPlan(
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
  const reason = String(plan.arguments.reason || "Kick issued via AI tool").trim();

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
  if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
    return { status: "denied", message: "Bot no longer has KickMembers permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Re-check requester permissions
  if (!canModerate(requesterMember, PermissionFlagsBits.KickMembers)) {
    return { status: "denied", message: "Permission revoked. You no longer have KickMembers.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Re-check target hierarchy
  const targetCheck = canTarget(requesterMember, target, botMember);
  if (!targetCheck.allowed) {
    return { status: "denied", message: `❌ ${targetCheck.reason}`, denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  // Execute kick
  try {
    await target.kick(reason);

    const result: ToolResult = {
      status: "success",
      message:
        `👢 **Member kicked**\n` +
        `**Member:** ${target.user.tag}\n` +
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
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`kick_user execution failed: ${msg}`);
    return {
      status: "error",
      message: `❌ Discord rejected the kick. Check my role position and permissions. (${msg})`,
    };
  }
}
