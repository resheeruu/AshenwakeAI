import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";

/* ================================================================
 * remove_role — Remove a role from a member.
 *
 * MEDIUM risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createRemoveRoleTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "remove_role",
    description: "Remove a role from a member in the current server.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageRoles"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "userId",
        type: "string",
        description: "ID of the user to remove the role from",
        required: true,
      },
      {
        name: "roleId",
        type: "string",
        description: "ID of the role to remove",
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
        return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      }

      const userId = String(context.arguments.userId || "").trim();
      const roleId = String(context.arguments.roleId || "").trim();

      if (!userId || !roleId) {
        return { status: "validation_error", message: "Missing required parameters: userId and roleId" };
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        return { status: "validation_error", message: `❌ Role with ID \`${roleId}\` not found.` };
      }

      const targetMember = await guild.members.fetch(userId).catch(() => null);
      if (!targetMember) {
        return { status: "validation_error", message: `❌ User with ID \`${userId}\` not found in this server.` };
      }

      // Check if target has the role
      if (!targetMember.roles.cache.has(roleId)) {
        return {
          status: "validation_error",
          message: `❌ ${targetMember.user.tag} does not have the **${role.name}** role.`,
        };
      }

      // Check hierarchy
      const botMember = await guild.members.me;
      if (!botMember) {
        return { status: "error", message: "Could not fetch bot member." };
      }

      if (role.position >= botMember.roles.highest.position) {
        return {
          status: "denied",
          message: "❌ I cannot remove that role because it is higher than or equal to my highest role.",
          denialReason: "ROLE_HIERARCHY",
        };
      }

      // Check requester permissions
      const requesterMember = await guild.members.fetch(context.requesterId).catch(() => null);
      if (!requesterMember || !requesterMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return {
          status: "denied",
          message: "❌ You do not have the **ManageRoles** permission.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
      }

      // Check requester hierarchy
      if (role.position >= requesterMember.roles.highest.position) {
        return {
          status: "denied",
          message: "❌ You cannot remove that role because it is higher than or equal to your highest role.",
          denialReason: "ROLE_HIERARCHY",
        };
      }

      // Check bot permissions
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return {
          status: "denied",
          message: "❌ The bot does not have the **ManageRoles** permission.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
      }

      const plan = createActionPlan(
        context,
        "medium",
        [
          {
            type: "update",
            target: `user:${userId}`,
            description: `Remove role "${role.name}" from ${targetMember.user.tag}`,
            permissions: "ManageRoles",
          },
        ],
        true,
      );
      (plan as any).toolName = "remove_role";

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Remove Role`,
        `**User:** ${targetMember.user.tag} (${userId})`,
        `**Role:** ${role.name} (${roleId})`,
        `**Risk:** MEDIUM`,
        `**Required:** ManageRoles`,
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

export async function executeRemoveRole(
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

  const userId = String(plan.arguments.userId || "").trim();
  const roleId = String(plan.arguments.roleId || "").trim();

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    return { status: "error", message: "❌ Role no longer exists." };
  }

  const targetMember = await guild.members.fetch(userId).catch(() => null);
  if (!targetMember) {
    return { status: "error", message: "❌ User no longer in server." };
  }

  // Re-check hierarchy
  const botMember = await guild.members.me;
  if (!botMember || role.position >= botMember.roles.highest.position) {
    return { status: "denied", message: "❌ Cannot remove role: hierarchy check failed.", denialReason: "ROLE_HIERARCHY" };
  }

  // Re-check if target has the role
  if (!targetMember.roles.cache.has(roleId)) {
    return { status: "validation_error", message: `❌ ${targetMember.user.tag} no longer has the **${role.name}** role.` };
  }

  try {
    await targetMember.roles.remove(roleId, `Removed by ${plan.requesterId} via AshenAI`);

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Role removed**\n` +
        `User: ${targetMember.user.tag}\n` +
        `Role: ${role.name}\n` +
        `Action ID: \`${plan.id}\``,
      data: { userId, roleId, roleName: role.name },
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
    logger.error(`remove_role execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: "❌ Role removal failed. The issue has been logged." };
  }
}
