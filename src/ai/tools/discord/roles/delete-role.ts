import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";

/* ================================================================
 * delete_role — Delete a role from the current guild.
 *
 * HIGH risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createDeleteRoleTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "delete_role",
    description: "Delete a role from the current server.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageRoles"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      {
        name: "roleId",
        type: "string",
        description: "ID of the role to delete",
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

      const roleId = String(context.arguments.roleId || "").trim();
      if (!roleId) {
        return { status: "validation_error", message: "Missing required parameter: roleId" };
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        return { status: "validation_error", message: `❌ Role with ID \`${roleId}\` not found.` };
      }

      // Cannot delete @everyone
      if (role.id === guild.id) {
        return { status: "validation_error", message: "❌ Cannot delete the @everyone role." };
      }

      // Check hierarchy
      const botMember = await guild.members.me;
      if (!botMember) {
        return { status: "error", message: "Could not fetch bot member." };
      }

      if (role.position >= botMember.roles.highest.position) {
        return {
          status: "denied",
          message: "❌ I cannot delete that role because it is higher than or equal to my highest role.",
          denialReason: "ROLE_HIERARCHY",
        };
      }

      // Check requester permissions
      const requesterMember = await guild.members.fetch(context.requesterId).catch(() => null);
      if (!requesterMember || !requesterMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return {
          status: "denied",
          message: "❌ You do not have the **ManageRoles** permission required to delete roles.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
      }

      // Check requester hierarchy
      if (role.position >= requesterMember.roles.highest.position) {
        return {
          status: "denied",
          message: "❌ You cannot delete that role because it is higher than or equal to your highest role.",
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

      const memberCount = role.members.size;

      const plan = createActionPlan(
        context,
        "high",
        [
          {
            type: "delete",
            target: `role:${role.name}`,
            description: `Delete role "${role.name}" (${memberCount} members)`,
            permissions: "ManageRoles",
          },
        ],
        true,
      );
      (plan as any).toolName = "delete_role";

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Delete Role`,
        `**Role:** ${role.name} (${role.id})`,
        `**Members with this role:** ${memberCount}`,
        `**Color:** ${role.hexColor}`,
        `**Risk:** HIGH`,
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

export async function executeDeleteRole(
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

  const roleId = String(plan.arguments.roleId || "").trim();
  const role = guild.roles.cache.get(roleId);
  if (!role) {
    return { status: "error", message: "❌ Role no longer exists." };
  }

  if (role.id === guild.id) {
    return { status: "validation_error", message: "❌ Cannot delete the @everyone role." };
  }

  // Re-check hierarchy
  const botMember = await guild.members.me;
  if (!botMember || role.position >= botMember.roles.highest.position) {
    return { status: "denied", message: "❌ Cannot delete role: hierarchy check failed.", denialReason: "ROLE_HIERARCHY" };
  }

  try {
    const roleName = role.name;
    await role.delete(`Deleted by ${plan.requesterId} via AshenAI`);

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Role deleted**\n` +
        `Name: ${roleName}\n` +
        `ID: ${roleId}\n` +
        `Action ID: \`${plan.id}\``,
      data: { roleId, name: roleName },
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
    logger.error(`delete_role execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: "❌ Role deletion failed. The issue has been logged." };
  }
}
