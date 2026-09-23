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
var delete_channel_exports = {};
__export(delete_channel_exports, {
  createDeleteChannelTool: () => createDeleteChannelTool,
  executeDeleteChannel: () => executeDeleteChannel
});
module.exports = __toCommonJS(delete_channel_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_logger = require("../../../../logger");
var import_protection = require("../protection");
function hasManageChannels(member) {
  return member.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
}
function createDeleteChannelTool(getClient) {
  return {
    name: "delete_channel",
    description: "Permanently delete a channel. This cannot be undone.",
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
        description: "ID of the channel to delete",
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
      if (!channelId) return { status: "validation_error", message: "Missing required parameter: channelId" };
      const targetChannel = guild.channels.cache.get(channelId);
      if (!targetChannel) return { status: "denied", message: `Channel "${channelId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      if (targetChannel.guild.id !== guild.id) return { status: "denied", message: "Channel belongs to a different guild.", denialReason: "GUILD_ONLY" };
      if ((0, import_protection.isChannelProtected)(context.guildId, channelId, targetChannel.parentId)) {
        return { status: "denied", message: `\u274C Cannot delete protected channel #${targetChannel.name}.`, denialReason: "PROTECTED_RESOURCE" };
      }
      const requesterMember = context.requesterId ? await guild.members.fetch(context.requesterId).catch(() => null) : null;
      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result = { status: "denied", message: "\u274C You do not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result = { status: "denied", message: "\u274C Bot does not have **ManageChannels** permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "high",
        [{
          type: "delete",
          target: `#${targetChannel.name}`,
          description: `Delete ${targetChannel.type === 4 ? "category" : "channel"}`,
          permissions: "ManageChannels"
        }],
        true
      );
      plan.toolName = "delete_channel";
      plan.arguments = { ...context.arguments };
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u26A0\uFE0F **DESTRUCTIVE ACTION**",
        "",
        `**Action:** Delete Channel`,
        `**Channel:** #${targetChannel.name}`,
        `**Guild:** ${guild.name}`,
        "",
        "This cannot be automatically undone.",
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
async function executeDeleteChannel(plan, getClient) {
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
  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) return { status: "error", message: "Channel no longer exists." };
  if ((0, import_protection.isChannelProtected)(plan.guildId, channelId, targetChannel.parentId)) {
    return { status: "denied", message: "\u274C Channel is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }
  const channelName = targetChannel.name;
  try {
    await targetChannel.delete();
    const result = {
      status: "success",
      message: `\u2705 **Channel deleted** #${channelName}
Action ID: \`${plan.id}\``,
      data: { channelId, name: channelName }
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
    import_logger.logger.error(`delete_channel execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: `\u274C Delete failed. The issue has been logged.` };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createDeleteChannelTool,
  executeDeleteChannel
});
