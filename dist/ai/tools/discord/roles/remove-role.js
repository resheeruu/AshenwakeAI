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
var remove_role_exports = {};
__export(remove_role_exports, {
  createRemoveRoleTool: () => createRemoveRoleTool,
  executeRemoveRole: () => executeRemoveRole
});
module.exports = __toCommonJS(remove_role_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_logger = require("../../../../logger");
function createRemoveRoleTool(getClient) {
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
        required: true
      },
      {
        name: "roleId",
        type: "string",
        description: "ID of the role to remove",
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
      const userId = String(context.arguments.userId || "").trim();
      const roleId = String(context.arguments.roleId || "").trim();
      if (!userId || !roleId) {
        return { status: "validation_error", message: "Missing required parameters: userId and roleId" };
      }
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        return { status: "validation_error", message: `\u274C Role with ID \`${roleId}\` not found.` };
      }
      const targetMember = await guild.members.fetch(userId).catch(() => null);
      if (!targetMember) {
        return { status: "validation_error", message: `\u274C User with ID \`${userId}\` not found in this server.` };
      }
      if (!targetMember.roles.cache.has(roleId)) {
        return {
          status: "validation_error",
          message: `\u274C ${targetMember.user.tag} does not have the **${role.name}** role.`
        };
      }
      const botMember = await guild.members.me;
      if (!botMember) {
        return { status: "error", message: "Could not fetch bot member." };
      }
      if (role.position >= botMember.roles.highest.position) {
        return {
          status: "denied",
          message: "\u274C I cannot remove that role because it is higher than or equal to my highest role.",
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
          message: "\u274C You cannot remove that role because it is higher than or equal to your highest role.",
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
        "medium",
        [
          {
            type: "update",
            target: `user:${userId}`,
            description: `Remove role "${role.name}" from ${targetMember.user.tag}`,
            permissions: "ManageRoles"
          }
        ],
        true
      );
      plan.toolName = "remove_role";
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Remove Role`,
        `**User:** ${targetMember.user.tag} (${userId})`,
        `**Role:** ${role.name} (${roleId})`,
        `**Risk:** MEDIUM`,
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
async function executeRemoveRole(plan, getClient) {
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
    return { status: "error", message: "\u274C Role no longer exists." };
  }
  const targetMember = await guild.members.fetch(userId).catch(() => null);
  if (!targetMember) {
    return { status: "error", message: "\u274C User no longer in server." };
  }
  const botMember = await guild.members.me;
  if (!botMember || role.position >= botMember.roles.highest.position) {
    return { status: "denied", message: "\u274C Cannot remove role: hierarchy check failed.", denialReason: "ROLE_HIERARCHY" };
  }
  if (!targetMember.roles.cache.has(roleId)) {
    return { status: "validation_error", message: `\u274C ${targetMember.user.tag} no longer has the **${role.name}** role.` };
  }
  try {
    await targetMember.roles.remove(roleId, `Removed by ${plan.requesterId} via AshenAI`);
    const result = {
      status: "success",
      message: `\u2705 **Role removed**
User: ${targetMember.user.tag}
Role: ${role.name}
Action ID: \`${plan.id}\``,
      data: { userId, roleId, roleName: role.name }
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
    import_logger.logger.error(`remove_role execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: "\u274C Role removal failed. The issue has been logged." };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createRemoveRoleTool,
  executeRemoveRole
});
