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
var purge_messages_exports = {};
__export(purge_messages_exports, {
  createPurgeMessagesTool: () => createPurgeMessagesTool,
  executePurgeMessagesPlan: () => executePurgeMessagesPlan
});
module.exports = __toCommonJS(purge_messages_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_protection = require("../protection");
var import_logger = require("../../../../logger");
const MIN_PURGE_COUNT = 1;
const MAX_PURGE_COUNT = 100;
function createPurgeMessagesTool(getClient) {
  return {
    name: "purge_messages",
    description: "Bulk delete recent messages from a channel.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: ["ManageMessages"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel to purge messages from",
        required: true
      },
      {
        name: "count",
        type: "number",
        description: "Number of messages to delete (1-100)",
        required: true
      },
      {
        name: "reason",
        type: "string",
        description: "Reason for the purge",
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
      const channelId = String(context.arguments.channelId || "").trim();
      const count = Number(context.arguments.count);
      const reason = String(context.arguments.reason || "Purge via AI tool").trim();
      if (!channelId) {
        return { status: "validation_error", message: "Missing required parameter: channelId" };
      }
      if (!Number.isFinite(count) || count < MIN_PURGE_COUNT || count > MAX_PURGE_COUNT) {
        return {
          status: "validation_error",
          message: `Count must be between ${MIN_PURGE_COUNT} and ${MAX_PURGE_COUNT}.`
        };
      }
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return { status: "validation_error", message: `Channel "${channelId}" not found.` };
      }
      if (channel.type !== import_discord.ChannelType.GuildText) {
        return { status: "validation_error", message: "Purge is only available in text channels." };
      }
      if ((0, import_protection.isChannelProtected)(context.guildId, channelId)) {
        return {
          status: "denied",
          message: "\u274C This channel is protected. Messages cannot be purged from protected channels.",
          denialReason: "PROTECTED_RESOURCE"
        };
      }
      const requesterMember = await guild.members.fetch(context.requesterId).catch(() => null);
      if (!requesterMember) {
        return { status: "denied", message: "You are not a member of this server.", denialReason: "GUILD_ONLY" };
      }
      const botMember = await guild.members.me;
      if (!botMember) {
        return { status: "error", message: "Could not fetch bot member." };
      }
      if (!botMember.permissions.has(import_discord.PermissionFlagsBits.ManageMessages)) {
        return { status: "denied", message: "I don't have permission to delete messages.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }
      if (!requesterMember.permissions.has(import_discord.PermissionFlagsBits.ManageMessages)) {
        return { status: "denied", message: "You don't have permission to delete messages.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "high",
        [{ type: "delete", target: `${count} messages in #${channel.name}`, description: `Purge ${count} messages: ${reason}` }],
        true
      );
      plan.toolName = "purge_messages";
      plan.arguments = { ...context.arguments, _channelName: channel.name, _count: count };
      (0, import_confirmation_store.storePendingPlan)(plan);
      return {
        status: "confirmation_required",
        message: [
          "\u{1F4CB} **ACTION PLAN**",
          "",
          "**Action:** Purge Messages",
          `**Channel:** <#${channelId}> (${channel.name})`,
          `**Count:** ${count} message(s)`,
          `**Reason:** ${reason}`,
          "",
          "**Risk:** HIGH",
          `**Action ID:** \`${plan.id}\``,
          "**Expires:** 5 minutes"
        ].join("\n"),
        plan
      };
    }
  };
}
async function executePurgeMessagesPlan(plan, getClient) {
  const startTime = Date.now();
  const client = getClient();
  if (!client) {
    return { status: "error", message: "Discord client is not connected." };
  }
  const guild = await client.guilds.fetch(plan.guildId).catch(() => null);
  if (!guild) {
    return { status: "denied", message: "Guild not found.", denialReason: "GUILD_ONLY" };
  }
  const channelId = String(plan.arguments.channelId || "").trim();
  const count = Number(plan.arguments._count || plan.arguments.count);
  const reason = String(plan.arguments.reason || "Purge via AI tool").trim();
  if (!channelId) {
    return { status: "validation_error", message: "Missing channelId in plan." };
  }
  if (!Number.isFinite(count) || count < MIN_PURGE_COUNT || count > MAX_PURGE_COUNT) {
    return { status: "validation_error", message: `Invalid count: ${count}.` };
  }
  if (plan.guildId !== guild.id) {
    return { status: "denied", message: "Plan guild does not match execution guild.", denialReason: "INVALID_ARGUMENTS" };
  }
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return { status: "validation_error", message: `Channel "${channelId}" not found.` };
  }
  if (channel.type !== import_discord.ChannelType.GuildText) {
    return { status: "validation_error", message: "Purge is only available in text channels." };
  }
  if ((0, import_protection.isChannelProtected)(plan.guildId, channelId)) {
    return {
      status: "denied",
      message: "\u274C This channel is now protected. Protection was added after this plan was created.",
      denialReason: "PROTECTED_RESOURCE"
    };
  }
  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember) {
    return { status: "denied", message: "Requester is not a member of this server.", denialReason: "GUILD_ONLY" };
  }
  const botMember = await guild.members.me;
  if (!botMember) {
    return { status: "error", message: "Could not fetch bot member." };
  }
  if (!botMember.permissions.has(import_discord.PermissionFlagsBits.ManageMessages)) {
    return { status: "denied", message: "Bot no longer has ManageMessages permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  if (!requesterMember.permissions.has(import_discord.PermissionFlagsBits.ManageMessages)) {
    return { status: "denied", message: "Permission revoked. You no longer have ManageMessages.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  try {
    const textChannel = channel;
    const deleted = await textChannel.bulkDelete(count, true);
    const result = {
      status: "success",
      message: `\u{1F5D1}\uFE0F **Messages purged**
**Channel:** <#${channelId}> (${channel.name})
**Deleted:** ${deleted.size} message(s)
**Reason:** ${reason}
Action ID: \`${plan.id}\``,
      data: { channelId, deleted: deleted.size, reason }
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
    import_logger.logger.error(`purge_messages execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `\u274C Discord rejected the purge. Messages may be too old (14+ days) or I lack permissions. The issue has been logged.`
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createPurgeMessagesTool,
  executePurgeMessagesPlan
});
