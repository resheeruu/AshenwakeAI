import type { Client } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";

/* ================================================================
 * create_role — Create a new role in the current guild.
 *
 * MEDIUM risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createCreateRoleTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "create_role",
    description: "Create a new role in the current server.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageRoles"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "Role name",
        required: true,
      },
      {
        name: "color",
        type: "string",
        description: "Hex color code (e.g. #ff0000)",
        required: false,
      },
      {
        name: "hoist",
        type: "boolean",
        description: "Display separately in member list",
        required: false,
        defaultValue: false,
      },
      {
        name: "mentionable",
        type: "boolean",
        description: "Allow anyone to mention this role",
        required: false,
        defaultValue: false,
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

      const name = String(context.arguments.name || "").trim();
      const color = context.arguments.color ? String(context.arguments.color).trim() : undefined;
      const hoist = context.arguments.hoist === true;
      const mentionable = context.arguments.mentionable === true;

      if (!name || name.length < 1 || name.length > 100) {
        return { status: "validation_error", message: "Role name must be 1-100 characters." };
      }

      // Check requester permissions
      const requesterMember = await guild.members.fetch(context.requesterId).catch(() => null);
      if (!requesterMember || !requesterMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return {
          status: "denied",
          message: "❌ You do not have the **ManageRoles** permission required to create roles.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
      }

      // Check bot permissions
      const botMember = await guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return {
          status: "denied",
          message: "❌ The bot does not have the **ManageRoles** permission required to create roles.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
      }

      // Duplicate check
      const existingRole = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (existingRole) {
        return {
          status: "validation_error",
          message: `❌ Role **${name}** already exists.`,
          denialReason: "ROLE_ALREADY_EXISTS",
        };
      }

      // Generate ActionPlan
      const plan = createActionPlan(
        context,
        "medium",
        [
          {
            type: "create",
            target: `role:${name}`,
            description: `Create role "${name}"`,
            permissions: "ManageRoles",
          },
        ],
        true,
      );
      (plan as any).toolName = "create_role";

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Create Role`,
        `**Name:** ${name}`,
        `**Color:** ${color || "Default"}`,
        `**Hoist:** ${hoist ? "Yes" : "No"}`,
        `**Mentionable:** ${mentionable ? "Yes" : "No"}`,
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

export async function executeCreateRole(
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

  // Re-check permissions
  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember || !requesterMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { status: "denied", message: "❌ Permission revoked. You no longer have ManageRoles.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  const botMember = await guild.members.me;
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { status: "denied", message: "❌ Bot no longer has ManageRoles permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }

  const args = plan.arguments;
  const name = String(args.name || "").trim();
  const color = args.color ? String(args.color).trim() : undefined;
  const hoist = args.hoist === true;
  const mentionable = args.mentionable === true;

  // Re-check duplicate
  const existingRole = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (existingRole) {
    return { status: "validation_error", message: `❌ Role **${name}** already exists.` };
  }

  try {
    const newRole = await guild.roles.create({
      name,
      color: color as any,
      hoist,
      mentionable,
      reason: `Created by ${plan.requesterId} via AshenAI`,
    });

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Role created**\n` +
        `Name: ${newRole.name}\n` +
        `ID: ${newRole.id}\n` +
        `Color: ${newRole.hexColor}\n` +
        `Action ID: \`${plan.id}\``,
      data: { roleId: newRole.id, name: newRole.name },
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
    logger.error(`create_role execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: "❌ Role creation failed. The issue has been logged." };
  }
}
