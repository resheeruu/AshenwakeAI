"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var configure_role_permissions_exports = {};
__export(configure_role_permissions_exports, {
  createConfigureRolePermissionsTool: () => createConfigureRolePermissionsTool,
  executeConfigureRolePermissions: () => executeConfigureRolePermissions
});
module.exports = __toCommonJS(configure_role_permissions_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_logger = require("../../../../logger");
const PERMISSION_MAP = {
  ManageChannels: import_discord.PermissionFlagsBits.ManageChannels,
  ManageGuild: import_discord.PermissionFlagsBits.ManageGuild,
  ManageRoles: import_discord.PermissionFlagsBits.ManageRoles,
  ManageMessages: import_discord.PermissionFlagsBits.ManageMessages,
  ModerateMembers: import_discord.PermissionFlagsBits.ModerateMembers,
  KickMembers: import_discord.PermissionFlagsBits.KickMembers,
  BanMembers: import_discord.PermissionFlagsBits.BanMembers,
  Administrator: import_discord.PermissionFlagsBits.Administrator,
  ViewChannel: import_discord.PermissionFlagsBits.ViewChannel,
  SendMessages: import_discord.PermissionFlagsBits.SendMessages,
  EmbedLinks: import_discord.PermissionFlagsBits.EmbedLinks,
  AttachFiles: import_discord.PermissionFlagsBits.AttachFiles,
  AddReactions: import_discord.PermissionFlagsBits.AddReactions,
  UseExternalEmojis: import_discord.PermissionFlagsBits.UseExternalEmojis,
  ReadMessageHistory: import_discord.PermissionFlagsBits.ReadMessageHistory,
  Connect: import_discord.PermissionFlagsBits.Connect,
  Speak: import_discord.PermissionFlagsBits.Speak,
  MuteMembers: import_discord.PermissionFlagsBits.MuteMembers,
  DeafenMembers: import_discord.PermissionFlagsBits.DeafenMembers,
  MoveMembers: import_discord.PermissionFlagsBits.MoveMembers,
  ManageWebhooks: import_discord.PermissionFlagsBits.ManageWebhooks,
  ManageEmojisAndStickers: import_discord.PermissionFlagsBits.ManageEmojisAndStickers
};
function createConfigureRolePermissionsTool(getClient) {
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
        required: true
      },
      {
        name: "permissions",
        type: "string",
        description: "Comma-separated list of permission names to grant (e.g. ManageMessages,ModerateMembers)",
        required: true
      }
    ],
    execute: async (context) => {
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
        return { status: "validation_error", message: `\u274C Role with ID \`${roleId}\` not found.` };
      }
      const permNames = permString.split(",").map((p) => p.trim()).filter(Boolean);
      const validPerms = [];
      const invalidPerms = [];
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
          message: `\u274C Unknown permissions: ${invalidPerms.join(", ")}

Valid permissions: ${Object.keys(PERMISSION_MAP).join(", ")}`
        };
      }
      if (validPerms.length === 0) {
        return { status: "validation_error", message: "\u274C No valid permissions specified." };
      }
      const botMember = await guild.members.me;
      if (!botMember) {
        return { status: "error", message: "Could not fetch bot member." };
      }
      if (role.position >= botMember.roles.highest.position) {
        return {
          status: "denied",
          message: "\u274C I cannot modify that role because it is higher than or equal to my highest role.",
          denialReason: "ROLE_HIERARCHY"
        };
      }
      const requesterMember = await guild.members.fetch(context.requesterId).catch(() => null);
      if (!requesterMember || !requesterMember.permissions.has(import_discord.PermissionFlagsBits.ManageRoles)) {
        return {
          status: "denied",
          message: "\u274C You do not have the **ManageRoles** permission.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
      }
      if (role.position >= requesterMember.roles.highest.position) {
        return {
          status: "denied",
          message: "\u274C You cannot modify that role because it is higher than or equal to your highest role.",
          denialReason: "ROLE_HIERARCHY"
        };
      }
      if (!botMember.permissions.has(import_discord.PermissionFlagsBits.ManageRoles)) {
        return {
          status: "denied",
          message: "\u274C The bot does not have the **ManageRoles** permission.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "high",
        [
          {
            type: "update",
            target: `role:${role.name}`,
            description: `Grant permissions: ${validPerms.join(", ")}`,
            permissions: "ManageRoles"
          }
        ],
        true
      );
      plan.toolName = "configure_role_permissions";
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Configure Role Permissions`,
        `**Role:** ${role.name} (${roleId})`,
        `**Permissions to grant:** ${validPerms.join(", ")}`,
        `**Risk:** HIGH`,
        `**Required:** ManageRoles`,
        `**Requested by:** <@${context.requesterId}>`,
        "",
        `**Action ID:** \`${plan.id}\``,
        `**Expires:** 5 minutes`
      ];
      return {
        status: "confirmation_required",
        message: lines.join("\n"),
        plan
      };
    }
  };
}
async function executeConfigureRolePermissions(plan, getClient) {
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
    return { status: "error", message: "\u274C Role no longer exists." };
  }
  const botMember = await guild.members.me;
  if (!botMember || role.position >= botMember.roles.highest.position) {
    return { status: "denied", message: "\u274C Cannot modify role: hierarchy check failed.", denialReason: "ROLE_HIERARCHY" };
  }
  const permString = String(plan.arguments.permissions || "").trim();
  const permNames = permString.split(",").map((p) => p.trim()).filter(Boolean);
  let newPermissions = role.permissions;
  for (const name of permNames) {
    const flag = PERMISSION_MAP[name];
    if (flag) {
      newPermissions = newPermissions.add(flag);
    }
  }
  try {
    const updatedRole = await role.edit(
      { permissions: newPermissions, reason: `Permissions updated by ${plan.requesterId} via AshenAI` }
    );
    const result = {
      status: "success",
      message: `\u2705 **Role permissions updated**
Role: ${updatedRole.name}
Granted: ${permNames.join(", ")}
Action ID: \`${plan.id}\``,
      data: { roleId: updatedRole.id, name: updatedRole.name, permissions: permNames }
    };
    (0, import_audit.recordToolAudit)(
      { ...plan, arguments: plan.arguments, channelId: plan.channelId, requesterName: "confirmed" },
      "success",
      void 0,
      startTime,
      false
    );
    return result;
  } catch (error) {
    import_logger.logger.error(`configure_role_permissions execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: "\u274C Permission update failed. The issue has been logged." };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createConfigureRolePermissionsTool,
  executeConfigureRolePermissions
});
