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
var create_role_exports = {};
__export(create_role_exports, {
  createCreateRoleTool: () => createCreateRoleTool,
  executeCreateRole: () => executeCreateRole
});
module.exports = __toCommonJS(create_role_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_logger = require("../../../../logger");
function createCreateRoleTool(getClient) {
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
        required: true
      },
      {
        name: "color",
        type: "string",
        description: "Hex color code (e.g. #ff0000)",
        required: false
      },
      {
        name: "hoist",
        type: "boolean",
        description: "Display separately in member list",
        required: false,
        defaultValue: false
      },
      {
        name: "mentionable",
        type: "boolean",
        description: "Allow anyone to mention this role",
        required: false,
        defaultValue: false
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
      const name = String(context.arguments.name || "").trim();
      const color = context.arguments.color ? String(context.arguments.color).trim() : void 0;
      const hoist = context.arguments.hoist === true;
      const mentionable = context.arguments.mentionable === true;
      if (!name || name.length < 1 || name.length > 100) {
        return { status: "validation_error", message: "Role name must be 1-100 characters." };
      }
      const requesterMember = await guild.members.fetch(context.requesterId).catch(() => null);
      if (!requesterMember || !requesterMember.permissions.has(import_discord.PermissionFlagsBits.ManageRoles)) {
        return {
          status: "denied",
          message: "\u274C You do not have the **ManageRoles** permission required to create roles.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
      }
      const botMember = await guild.members.me;
      if (!botMember || !botMember.permissions.has(import_discord.PermissionFlagsBits.ManageRoles)) {
        return {
          status: "denied",
          message: "\u274C The bot does not have the **ManageRoles** permission required to create roles.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
      }
      const existingRole = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (existingRole) {
        return {
          status: "validation_error",
          message: `\u274C Role **${name}** already exists.`,
          denialReason: "ROLE_ALREADY_EXISTS"
        };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [
          {
            type: "create",
            target: `role:${name}`,
            description: `Create role "${name}"`,
            permissions: "ManageRoles"
          }
        ],
        true
      );
      plan.toolName = "create_role";
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
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
async function executeCreateRole(plan, getClient) {
  const startTime = Date.now();
  const client = getClient();
  if (!client) {
    return { status: "error", message: "Discord client is not connected." };
  }
  const guild = await client.guilds.fetch(plan.guildId).catch(() => null);
  if (!guild) {
    return { status: "denied", message: "Guild not found.", denialReason: "GUILD_ONLY" };
  }
  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember || !requesterMember.permissions.has(import_discord.PermissionFlagsBits.ManageRoles)) {
    return { status: "denied", message: "\u274C Permission revoked. You no longer have ManageRoles.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  const botMember = await guild.members.me;
  if (!botMember || !botMember.permissions.has(import_discord.PermissionFlagsBits.ManageRoles)) {
    return { status: "denied", message: "\u274C Bot no longer has ManageRoles permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  const args = plan.arguments;
  const name = String(args.name || "").trim();
  const color = args.color ? String(args.color).trim() : void 0;
  const hoist = args.hoist === true;
  const mentionable = args.mentionable === true;
  const existingRole = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (existingRole) {
    return { status: "validation_error", message: `\u274C Role **${name}** already exists.` };
  }
  try {
    const newRole = await guild.roles.create({
      name,
      color,
      hoist,
      mentionable,
      reason: `Created by ${plan.requesterId} via AshenAI`
    });
    const result = {
      status: "success",
      message: `\u2705 **Role created**
Name: ${newRole.name}
ID: ${newRole.id}
Color: ${newRole.hexColor}
Action ID: \`${plan.id}\``,
      data: { roleId: newRole.id, name: newRole.name }
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
    import_logger.logger.error(`create_role execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: "\u274C Role creation failed. The issue has been logged." };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createCreateRoleTool,
  executeCreateRole
});
