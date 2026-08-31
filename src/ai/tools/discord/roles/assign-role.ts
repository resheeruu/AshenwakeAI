import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";

/* ================================================================
 * assign_role — Assign a role to a member.
 *
 * MEDIUM risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createAssignRoleTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "assign_role",
    description: "Assign a role to a member in the current server.",
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
        description: "ID of the user to assign the role to",
        required: true,
      },
      {
        name: "roleId",
        type: "string",
        description: "ID of the role to assign",
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

      // Check if target already has the role
      if (targetMember.roles.cache.has(roleId)) {
        return {
          status: "validation_error",
          message: `❌ ${targetMember.user.tag} already has the **${role.name}** role.`,
        };
      }

      // Check hierarchy: bot cannot assign roles above its highest
      const botMember = await guild.members.me;
      if (!botMember) {
        return { status: "error", message: "Could not fetch bot member." };
      }

      if (role.position >= botMember.roles.highest.position) {
        return {
          status: "denied",
          message: "❌ I cannot assign that role because it is higher than or equal to my highest role.",
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
          message: "❌ You cannot assign that role because it is higher than or equal to your highest role.",
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
            description: `Assign role "${role.name}" to ${targetMember.user.tag}`,
            permissions: "ManageRoles",
          },
        ],
        true,
      );
      (plan as any).toolName = "assign_role";

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Assign Role`,
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

export async function executeAssignRole(
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
    return { status: "denied", message: "❌ Cannot assign role: hierarchy check failed.", denialReason: "ROLE_HIERARCHY" };
  }

  // Re-check if already assigned
  if (targetMember.roles.cache.has(roleId)) {
    return { status: "validation_error", message: `❌ ${targetMember.user.tag} already has the **${role.name}** role.` };
  }

  try {
    await targetMember.roles.add(roleId, `Assigned by ${plan.requesterId} via AshenAI`);

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Role assigned**\n` +
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
    logger.error(`assign_role execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: "❌ Role assignment failed. The issue has been logged." };
  }
}
