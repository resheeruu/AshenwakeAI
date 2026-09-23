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
var permissions_exports = {};
__export(permissions_exports, {
  createManageChannelPermissionsTool: () => createManageChannelPermissionsTool,
  executeManageChannelPermissions: () => executeManageChannelPermissions
});
module.exports = __toCommonJS(permissions_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_logger = require("../../../../logger");
var import_protection = require("../protection");
const PROHIBITED_PERMISSIONS = [
  "Administrator",
  "ManageGuild",
  "ManageRoles",
  "ManageChannels"
];
const PROHIBITED_FLAGS = [
  import_discord.PermissionFlagsBits.Administrator,
  import_discord.PermissionFlagsBits.ManageGuild,
  import_discord.PermissionFlagsBits.ManageRoles,
  import_discord.PermissionFlagsBits.ManageChannels
];
const VALID_FLAGS = {
  ViewChannel: import_discord.PermissionFlagsBits.ViewChannel,
  SendMessages: import_discord.PermissionFlagsBits.SendMessages,
  SendMessagesInThreads: import_discord.PermissionFlagsBits.SendMessagesInThreads,
  ReadMessageHistory: import_discord.PermissionFlagsBits.ReadMessageHistory,
  EmbedLinks: import_discord.PermissionFlagsBits.EmbedLinks,
  AttachFiles: import_discord.PermissionFlagsBits.AttachFiles,
  AddReactions: import_discord.PermissionFlagsBits.AddReactions,
  UseExternalEmojis: import_discord.PermissionFlagsBits.UseExternalEmojis,
  Connect: import_discord.PermissionFlagsBits.Connect,
  Speak: import_discord.PermissionFlagsBits.Speak,
  UseVAD: import_discord.PermissionFlagsBits.UseVAD
};
function hasManageChannels(member) {
  return member.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
}
function createManageChannelPermissionsTool(getClient) {
  return {
    name: "manage_channel_permissions",
    description: "Allow or deny a role's permissions on a channel.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel",
        required: true
      },
      {
        name: "roleId",
        type: "string",
        description: "ID of the role",
        required: true
      },
      {
        name: "permission",
        type: "string",
        description: "Permission flag name",
        required: true,
        allowedValues: Object.keys(VALID_FLAGS)
      },
      {
        name: "allow",
        type: "boolean",
        description: "true = allow, false = deny",
        required: true
      }
    ],
    execute: async (context) => {
      const startTime = Date.now();
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      const channelId = String(context.arguments.channelId || "").trim();
      const roleId = String(context.arguments.roleId || "").trim();
      const permission = String(context.arguments.permission || "").trim();
      const allow = Boolean(context.arguments.allow);
      if (!channelId) return { status: "validation_error", message: "Missing required parameter: channelId" };
      if (!roleId) return { status: "validation_error", message: "Missing required parameter: roleId" };
      if (!permission) return { status: "validation_error", message: "Missing required parameter: permission" };
      const flag = VALID_FLAGS[permission];
      if (!flag) {
        return { status: "validation_error", message: `Invalid permission "${permission}". Allowed: ${Object.keys(VALID_FLAGS).join(", ")}` };
      }
      if (PROHIBITED_FLAGS.includes(flag)) {
        return {
          status: "denied",
          message: `\u274C Cannot modify **${permission}** via AI tools. This is a prohibited permission.`,
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
      }
      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) return { status: "denied", message: `Channel "${channelId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      if (targetChannel.guild.id !== guild.id) return { status: "denied", message: "Channel belongs to a different guild.", denialReason: "GUILD_ONLY" };
      if ((0, import_protection.isChannelProtected)(context.guildId, channelId, targetChannel.parentId)) {
        return { status: "denied", message: `\u274C Cannot modify permissions on protected channel #${targetChannel.name}.`, denialReason: "PROTECTED_RESOURCE" };
      }
      const targetRole = guild.roles.cache.get(roleId);
      if (!targetRole) return { status: "denied", message: `Role "${roleId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      const botMember = await guild.members.me;
      if (!botMember) return { status: "error", message: "Bot member not found." };
      if (targetRole.position >= botMember.roles.highest.position) {
        return {
          status: "denied",
          message: "\u274C Cannot modify a role equal to or higher than the bot's highest role.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
      }
      const requesterMember = context.requesterId ? await guild.members.fetch(context.requesterId).catch(() => null) : null;
      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result = { status: "denied", message: "\u274C You do not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      if (!botMember.permissions.has(import_discord.PermissionFlagsBits.ManageChannels)) {
        const result = { status: "denied", message: "\u274C Bot does not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "high",
        [{
          type: "modify",
          target: `#${targetChannel.name}`,
          description: `${allow ? "Allow" : "Deny"} ${permission} for @${targetRole.name}`,
          permissions: "ManageChannels"
        }],
        true
      );
      plan.toolName = "manage_channel_permissions";
      plan.arguments = { ...context.arguments };
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Channel Permissions`,
        `**Channel:** #${targetChannel.name}`,
        `**Target Role:** @${targetRole.name}`,
        `**Permission:** ${permission}`,
        `**Effect:** ${allow ? "\u2705 Allow" : "\u274C Deny"}`,
        "",
        `**Risk:** HIGH`,
        `**Required:** ManageChannels`,
        `**Requested by:** <@${context.requesterId}>`,
        "",
        `**Action ID:** \`${plan.id}\``,
        `**Expires:** 5 minutes`
      ];
      return { status: "confirmation_required", message: lines.join("\n"), plan };
    }
  };
}
async function executeManageChannelPermissions(plan, getClient) {
  const startTime = Date.now();
  const client = getClient();
  if (!client) return { status: "error", message: "Discord client is not connected." };
  const guild = await client.guilds.fetch(plan.guildId).catch(() => null);
  if (!guild) return { status: "denied", message: "Guild not found.", denialReason: "GUILD_ONLY" };
  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember || !hasManageChannels(requesterMember)) {
    return { status: "denied", message: "\u274C Permission revoked.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  const botMember = await guild.members.me;
  if (!botMember || !hasManageChannels(botMember)) {
    return { status: "denied", message: "\u274C Bot lost ManageChannels.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  const channelId = String(plan.arguments.channelId || "").trim();
  const roleId = String(plan.arguments.roleId || "").trim();
  const permission = String(plan.arguments.permission || "").trim();
  const allow = Boolean(plan.arguments.allow);
  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) return { status: "error", message: "Channel no longer exists." };
  if ((0, import_protection.isChannelProtected)(plan.guildId, channelId, targetChannel.parentId)) {
    return { status: "denied", message: "\u274C Channel is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }
  const targetRole = guild.roles.cache.get(roleId);
  if (!targetRole) return { status: "error", message: "Role no longer exists." };
  const flag = VALID_FLAGS[permission];
  if (!flag) return { status: "error", message: `Invalid permission: ${permission}` };
  if (PROHIBITED_FLAGS.includes(flag)) {
    return { status: "denied", message: `\u274C Cannot modify ${permission}.`, denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  if (targetRole.position >= botMember.roles.highest.position) {
    return { status: "denied", message: "\u274C Role hierarchy conflict.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  try {
    const ch = targetChannel;
    const currentOverwrite = ch.permissionOverwrites?.cache?.get(roleId);
    const currentAllowed = currentOverwrite?.allow?.bitfield ?? 0n;
    const currentDenied = currentOverwrite?.deny?.bitfield ?? 0n;
    const newAllowed = new import_discord.PermissionsBitField(currentAllowed);
    const newDenied = new import_discord.PermissionsBitField(currentDenied);
    if (allow) {
      newAllowed.add(flag);
      newDenied.remove(flag);
    } else {
      newDenied.add(flag);
      newAllowed.remove(flag);
    }
    await ch.permissionOverwrites?.edit(roleId, {
      allow: newAllowed,
      deny: newDenied
    });
    const result = {
      status: "success",
      message: `\u2705 **Permission updated**
Channel: #${targetChannel.name}
Role: @${targetRole.name}
${permission}: ${allow ? "Allowed" : "Denied"}
Action ID: \`${plan.id}\``,
      data: { channelId, roleId, permission, allow }
    };
    (0, import_audit.recordToolAudit)(
      { ...plan, channelId: plan.channelId, requesterName: "confirmed" },
      "success",
      void 0,
      startTime,
      false
    );
    return result;
  } catch (error) {
    import_logger.logger.error(`manage_channel_permissions execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: `\u274C Permission update failed. The issue has been logged.` };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createManageChannelPermissionsTool,
  executeManageChannelPermissions
});
