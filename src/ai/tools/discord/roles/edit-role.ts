import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";

/* ================================================================
 * edit_role — Edit an existing role in the current guild.
 *
 * MEDIUM risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createEditRoleTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "edit_role",
    description: "Edit an existing role in the current server.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageRoles"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "roleId",
        type: "string",
        description: "ID of the role to edit",
        required: true,
      },
      {
        name: "name",
        type: "string",
        description: "New role name (optional)",
        required: false,
      },
      {
        name: "color",
        type: "string",
        description: "New hex color code (optional)",
        required: false,
      },
      {
        name: "hoist",
        type: "boolean",
        description: "Display separately in member list (optional)",
        required: false,
      },
      {
        name: "mentionable",
        type: "boolean",
        description: "Allow anyone to mention this role (optional)",
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

      const roleId = String(context.arguments.roleId || "").trim();
      if (!roleId) {
        return { status: "validation_error", message: "Missing required parameter: roleId" };
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        return { status: "validation_error", message: `❌ Role with ID \`${roleId}\` not found.` };
      }

      // Check hierarchy: cannot edit roles above bot's highest role
      const botMember = await guild.members.me;
      if (!botMember) {
        return { status: "error", message: "Could not fetch bot member." };
      }

      if (role.position >= botMember.roles.highest.position) {
        return {
          status: "denied",
          message: "❌ I cannot modify that role because it is higher than or equal to my highest role.",
          denialReason: "ROLE_HIERARCHY",
        };
      }

      // Check requester permissions
      const requesterMember = await guild.members.fetch(context.requesterId).catch(() => null);
      if (!requesterMember || !requesterMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return {
          status: "denied",
          message: "❌ You do not have the **ManageRoles** permission required to edit roles.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
      }

      // Check requester hierarchy: cannot edit roles above their highest role
      if (role.position >= requesterMember.roles.highest.position) {
        return {
          status: "denied",
          message: "❌ You cannot modify that role because it is higher than or equal to your highest role.",
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

      // Build plan
      const changes: string[] = [];
      if (context.arguments.name) changes.push(`name → ${context.arguments.name}`);
      if (context.arguments.color) changes.push(`color → ${context.arguments.color}`);
      if (context.arguments.hoist !== undefined) changes.push(`hoist → ${context.arguments.hoist}`);
      if (context.arguments.mentionable !== undefined) changes.push(`mentionable → ${context.arguments.mentionable}`);

      if (changes.length === 0) {
        return { status: "validation_error", message: "❌ No changes specified. Provide name, color, hoist, or mentionable." };
      }

      const plan = createActionPlan(
        context,
        "medium",
        [
          {
            type: "update",
            target: `role:${role.name}`,
            description: `Edit role: ${changes.join(", ")}`,
            permissions: "ManageRoles",
          },
        ],
        true,
      );
      (plan as any).toolName = "edit_role";

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Edit Role`,
        `**Role:** ${role.name} (${role.id})`,
        `**Changes:** ${changes.join(", ")}`,
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

export async function executeEditRole(
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

  // Re-check hierarchy
  const botMember = await guild.members.me;
  if (!botMember || role.position >= botMember.roles.highest.position) {
    return { status: "denied", message: "❌ Cannot modify role: hierarchy check failed.", denialReason: "ROLE_HIERARCHY" };
  }

  const updateData: Record<string, unknown> = {};
  if (plan.arguments.name) updateData.name = String(plan.arguments.name);
  if (plan.arguments.color) updateData.color = String(plan.arguments.color);
  if (plan.arguments.hoist !== undefined) updateData.hoist = plan.arguments.hoist === true;
  if (plan.arguments.mentionable !== undefined) updateData.mentionable = plan.arguments.mentionable === true;

  try {
    const updatedRole = await role.edit({ ...updateData, reason: `Edited by ${plan.requesterId} via AshenAI` });

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Role updated**\n` +
        `Name: ${updatedRole.name}\n` +
        `ID: ${updatedRole.id}\n` +
        `Color: ${updatedRole.hexColor}\n` +
        `Action ID: \`${plan.id}\``,
      data: { roleId: updatedRole.id, name: updatedRole.name },
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
    logger.error(`edit_role execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: "❌ Role edit failed. The issue has been logged." };
  }
}
