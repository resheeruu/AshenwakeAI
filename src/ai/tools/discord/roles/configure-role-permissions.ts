import type { Client } from "discord.js";
import { PermissionFlagsBits, type PermissionResolvable } from "discord.js";
import type { ToolDefinition, ToolContext, ToolResult, ActionPlan } from "../../types";
import { createActionPlan } from "../../executor";
import { storePendingPlan } from "../../confirmation-store";
import { recordToolAudit } from "../../audit";
import { logger } from "../../../../logger";

/* ================================================================
 * PERMISSION NAME MAP
 * ================================================================ */

const PERMISSION_MAP: Record<string, bigint> = {
  ManageChannels: PermissionFlagsBits.ManageChannels,
  ManageGuild: PermissionFlagsBits.ManageGuild,
  ManageRoles: PermissionFlagsBits.ManageRoles,
  ManageMessages: PermissionFlagsBits.ManageMessages,
  ModerateMembers: PermissionFlagsBits.ModerateMembers,
  KickMembers: PermissionFlagsBits.KickMembers,
  BanMembers: PermissionFlagsBits.BanMembers,
  Administrator: PermissionFlagsBits.Administrator,
  ViewChannel: PermissionFlagsBits.ViewChannel,
  SendMessages: PermissionFlagsBits.SendMessages,
  EmbedLinks: PermissionFlagsBits.EmbedLinks,
  AttachFiles: PermissionFlagsBits.AttachFiles,
  AddReactions: PermissionFlagsBits.AddReactions,
  UseExternalEmojis: PermissionFlagsBits.UseExternalEmojis,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
  Connect: PermissionFlagsBits.Connect,
  Speak: PermissionFlagsBits.Speak,
  MuteMembers: PermissionFlagsBits.MuteMembers,
  DeafenMembers: PermissionFlagsBits.DeafenMembers,
  MoveMembers: PermissionFlagsBits.MoveMembers,
  ManageWebhooks: PermissionFlagsBits.ManageWebhooks,
  ManageEmojisAndStickers: PermissionFlagsBits.ManageEmojisAndStickers,
};

/* ================================================================
 * configure_role_permissions — Set permissions on a role.
 *
 * HIGH risk. Confirmation required. Admin+ role.
 * ================================================================ */

export function createConfigureRolePermissionsTool(getClient: () => Client | null): ToolDefinition {
  return {
    name: "configure_role_permissions",
    description: "Set permissions on a role in the current server.",
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
        description: "ID of the role to configure",
        required: true,
      },
      {
        name: "permissions",
        type: "string",
        description: "Comma-separated list of permission names to grant (e.g. ManageMessages,ModerateMembers)",
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
      const permString = String(context.arguments.permissions || "").trim();

      if (!roleId || !permString) {
        return { status: "validation_error", message: "Missing required parameters: roleId and permissions" };
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        return { status: "validation_error", message: `❌ Role with ID \`${roleId}\` not found.` };
      }

      // Parse permissions
      const permNames = permString.split(",").map((p) => p.trim()).filter(Boolean);
      const validPerms: string[] = [];
      const invalidPerms: string[] = [];

      for (const name of permNames) {
        if (PERMISSION_MAP[name]) {
          validPerms.push(name);
        } else {
          invalidPerms.push(name);
        }
      }

      if (invalidPerms.length > 0) {
        return {
          status: "validation_error",
          message: `❌ Unknown permissions: ${invalidPerms.join(", ")}\n\nValid permissions: ${Object.keys(PERMISSION_MAP).join(", ")}`,
        };
      }

      if (validPerms.length === 0) {
        return { status: "validation_error", message: "❌ No valid permissions specified." };
      }

      // Check hierarchy
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
          message: "❌ You do not have the **ManageRoles** permission.",
          denialReason: "MISSING_DISCORD_PERMISSION",
        };
      }

      // Check requester hierarchy
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

      const plan = createActionPlan(
        context,
        "high",
        [
          {
            type: "update",
            target: `role:${role.name}`,
            description: `Grant permissions: ${validPerms.join(", ")}`,
            permissions: "ManageRoles",
          },
        ],
        true,
      );
      (plan as any).toolName = "configure_role_permissions";

      storePendingPlan(plan);

      const lines = [
        "📋 **ACTION PLAN**",
        "",
        `**Action:** Configure Role Permissions`,
        `**Role:** ${role.name} (${roleId})`,
        `**Permissions to grant:** ${validPerms.join(", ")}`,
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

export async function executeConfigureRolePermissions(
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

  const permString = String(plan.arguments.permissions || "").trim();
  const permNames = permString.split(",").map((p) => p.trim()).filter(Boolean);

  // Build new permissions: start with current, add new ones
  let newPermissions = role.permissions;
  for (const name of permNames) {
    const flag = PERMISSION_MAP[name];
    if (flag) {
      newPermissions = newPermissions.add(flag);
    }
  }

  try {
    const updatedRole = await role.edit(
      { permissions: newPermissions, reason: `Permissions updated by ${plan.requesterId} via AshenAI` },
    );

    const result: ToolResult = {
      status: "success",
      message:
        `✅ **Role permissions updated**\n` +
        `Role: ${updatedRole.name}\n` +
        `Granted: ${permNames.join(", ")}\n` +
        `Action ID: \`${plan.id}\``,
      data: { roleId: updatedRole.id, name: updatedRole.name, permissions: permNames },
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
    logger.error(`configure_role_permissions execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: "❌ Permission update failed. The issue has been logged." };
  }
}
