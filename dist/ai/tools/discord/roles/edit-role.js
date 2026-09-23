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
var edit_role_exports = {};
__export(edit_role_exports, {
  createEditRoleTool: () => createEditRoleTool,
  executeEditRole: () => executeEditRole
});
module.exports = __toCommonJS(edit_role_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_logger = require("../../../../logger");
function createEditRoleTool(getClient) {
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
        required: true
      },
      {
        name: "name",
        type: "string",
        description: "New role name (optional)",
        required: false
      },
      {
        name: "color",
        type: "string",
        description: "New hex color code (optional)",
        required: false
      },
      {
        name: "hoist",
        type: "boolean",
        description: "Display separately in member list (optional)",
        required: false
      },
      {
        name: "mentionable",
        type: "boolean",
        description: "Allow anyone to mention this role (optional)",
        required: false
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
      if (!roleId) {
        return { status: "validation_error", message: "Missing required parameter: roleId" };
      }
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        return { status: "validation_error", message: `\u274C Role with ID \`${roleId}\` not found.` };
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
          message: "\u274C You do not have the **ManageRoles** permission required to edit roles.",
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
      const changes = [];
      if (context.arguments.name) changes.push(`name \u2192 ${context.arguments.name}`);
      if (context.arguments.color) changes.push(`color \u2192 ${context.arguments.color}`);
      if (context.arguments.hoist !== void 0) changes.push(`hoist \u2192 ${context.arguments.hoist}`);
      if (context.arguments.mentionable !== void 0) changes.push(`mentionable \u2192 ${context.arguments.mentionable}`);
      if (changes.length === 0) {
        return { status: "validation_error", message: "\u274C No changes specified. Provide name, color, hoist, or mentionable." };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [
          {
            type: "update",
            target: `role:${role.name}`,
            description: `Edit role: ${changes.join(", ")}`,
            permissions: "ManageRoles"
          }
        ],
        true
      );
      plan.toolName = "edit_role";
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Edit Role`,
        `**Role:** ${role.name} (${role.id})`,
        `**Changes:** ${changes.join(", ")}`,
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
async function executeEditRole(plan, getClient) {
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
  const updateData = {};
  if (plan.arguments.name) updateData.name = String(plan.arguments.name);
  if (plan.arguments.color) updateData.color = String(plan.arguments.color);
  if (plan.arguments.hoist !== void 0) updateData.hoist = plan.arguments.hoist === true;
  if (plan.arguments.mentionable !== void 0) updateData.mentionable = plan.arguments.mentionable === true;
  try {
    const updatedRole = await role.edit({ ...updateData, reason: `Edited by ${plan.requesterId} via AshenAI` });
    const result = {
      status: "success",
      message: `\u2705 **Role updated**
Name: ${updatedRole.name}
ID: ${updatedRole.id}
Color: ${updatedRole.hexColor}
Action ID: \`${plan.id}\``,
      data: { roleId: updatedRole.id, name: updatedRole.name }
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
    import_logger.logger.error(`edit_role execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: "\u274C Role edit failed. The issue has been logged." };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createEditRoleTool,
  executeEditRole
});
