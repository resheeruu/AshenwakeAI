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
var rename_channel_exports = {};
__export(rename_channel_exports, {
  createRenameChannelTool: () => createRenameChannelTool,
  executeRenameChannel: () => executeRenameChannel
});
module.exports = __toCommonJS(rename_channel_exports);
var import_discord = require("discord.js");
var import_executor = require("../executor");
var import_confirmation_store = require("../confirmation-store");
var import_audit = require("../audit");
var import_logger = require("../../../logger");
var import_protection = require("./protection");
function hasManageChannels(member) {
  return member.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
}
function createRenameChannelTool(getClient) {
  return {
    name: "rename_channel",
    description: "Rename an existing channel in the current server.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel to rename",
        required: true
      },
      {
        name: "newName",
        type: "string",
        description: "New channel name",
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
        return {
          status: "denied",
          message: "Could not fetch guild.",
          denialReason: "GUILD_ONLY"
        };
      }
      const channelId = String(context.arguments.channelId || "").trim();
      const newName = String(context.arguments.newName || "").trim();
      if (!channelId) {
        return { status: "validation_error", message: "Missing required parameter: channelId" };
      }
      if (!newName || newName.length < 1 || newName.length > 100) {
        return { status: "validation_error", message: "New name must be 1-100 characters." };
      }
      if (!/^[a-z0-9\-_]+$/i.test(newName)) {
        return {
          status: "validation_error",
          message: "Channel name can only contain letters, numbers, hyphens, and underscores."
        };
      }
      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) {
        return {
          status: "denied",
          message: `Channel "${channelId}" not found in this guild.`,
          denialReason: "RESOURCE_NOT_FOUND"
        };
      }
      if (targetChannel.guild.id !== guild.id) {
        return {
          status: "denied",
          message: "Channel belongs to a different guild.",
          denialReason: "GUILD_ONLY"
        };
      }
      if ((0, import_protection.isChannelProtected)(context.guildId, channelId, targetChannel.parentId)) {
        return {
          status: "denied",
          message: `\u274C Cannot rename protected channel #${targetChannel.name}.`,
          denialReason: "PROTECTED_RESOURCE"
        };
      }
      const requesterMember = context.requesterId ? await guild.members.fetch(context.requesterId).catch(() => null) : null;
      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result = {
          status: "denied",
          message: "\u274C You do not have the **ManageChannels** permission required to rename channels.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result = {
          status: "denied",
          message: "\u274C The bot does not have the **ManageChannels** permission required to rename channels.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const conflict = guild.channels.cache.find(
        (ch) => ch.name === newName && ch.parentId === targetChannel.parentId && ch.id !== channelId
      );
      if (conflict) {
        return {
          status: "validation_error",
          message: `\u274C A channel named **#${newName}** already exists in the same category.`,
          denialReason: "CHANNEL_ALREADY_EXISTS"
        };
      }
      const oldName = targetChannel.name;
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [
          {
            type: "modify",
            target: `#${oldName}`,
            description: `Rename to #${newName}`,
            before: oldName,
            after: newName,
            permissions: "ManageChannels"
          }
        ],
        true
      );
      plan.toolName = "rename_channel";
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Rename Channel`,
        `**From:** #${oldName}`,
        `**To:** #${newName}`,
        `**Risk:** MEDIUM`,
        `**Required:** ManageChannels`,
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
async function executeRenameChannel(plan, getClient) {
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
  if (!requesterMember || !hasManageChannels(requesterMember)) {
    return {
      status: "denied",
      message: "\u274C Permission revoked.",
      denialReason: "MISSING_DISCORD_PERMISSION"
    };
  }
  const botMember = await guild.members.me;
  if (!botMember || !hasManageChannels(botMember)) {
    return {
      status: "denied",
      message: "\u274C Bot no longer has ManageChannels permission.",
      denialReason: "MISSING_DISCORD_PERMISSION"
    };
  }
  const channelId = String(plan.arguments.channelId || "").trim();
  const newName = String(plan.arguments.newName || "").trim();
  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) {
    return { status: "error", message: "Channel no longer exists." };
  }
  if ((0, import_protection.isChannelProtected)(plan.guildId, channelId, targetChannel.parentId)) {
    return { status: "denied", message: "\u274C Channel is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }
  const conflict = guild.channels.cache.find(
    (ch) => ch.name === newName && ch.parentId === targetChannel.parentId && ch.id !== channelId
  );
  if (conflict) {
    return {
      status: "validation_error",
      message: `\u274C A channel named **#${newName}** already exists.`,
      denialReason: "CHANNEL_ALREADY_EXISTS"
    };
  }
  const oldName = targetChannel.name;
  try {
    await targetChannel.setName(newName);
    const result = {
      status: "success",
      message: `\u2705 **Channel renamed**
#${oldName} \u2192 #${newName}
Action ID: \`${plan.id}\``,
      data: {
        channelId: targetChannel.id,
        oldName,
        newName
      }
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
    import_logger.logger.error(`rename_channel execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `\u274C Rename failed. The issue has been logged.`
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createRenameChannelTool,
  executeRenameChannel
});
