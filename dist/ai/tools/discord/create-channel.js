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
var create_channel_exports = {};
__export(create_channel_exports, {
  createCreateChannelTool: () => createCreateChannelTool,
  executeCreateChannel: () => executeCreateChannel
});
module.exports = __toCommonJS(create_channel_exports);
var import_discord = require("discord.js");
var import_executor = require("../executor");
var import_confirmation_store = require("../confirmation-store");
var import_audit = require("../audit");
var import_logger = require("../../../logger");
const TYPE_MAP = {
  text: import_discord.ChannelType.GuildText,
  voice: import_discord.ChannelType.GuildVoice,
  announcement: import_discord.ChannelType.GuildAnnouncement,
  forum: import_discord.ChannelType.GuildForum
};
const TYPE_NAMES = {
  [import_discord.ChannelType.GuildText]: "Text",
  [import_discord.ChannelType.GuildVoice]: "Voice",
  [import_discord.ChannelType.GuildAnnouncement]: "Announcement",
  [import_discord.ChannelType.GuildForum]: "Forum"
};
const VALID_TYPES = ["text", "voice", "announcement", "forum"];
function hasManageChannels(member) {
  return member.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
}
function createCreateChannelTool(getClient) {
  return {
    name: "create_channel",
    description: "Create a new channel in the current server.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "Channel name (alphanumeric, hyphens, underscores)",
        required: true
      },
      {
        name: "type",
        type: "string",
        description: "Channel type",
        required: true,
        allowedValues: VALID_TYPES
      },
      {
        name: "categoryId",
        type: "string",
        description: "Category ID to place the channel in (optional)",
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
        return {
          status: "denied",
          message: "Could not fetch guild. The bot may not be in this server.",
          denialReason: "GUILD_ONLY"
        };
      }
      const name = String(context.arguments.name || "").trim();
      const type = String(context.arguments.type || "").toLowerCase();
      const categoryId = context.arguments.categoryId;
      if (!name || name.length < 1 || name.length > 100) {
        return {
          status: "validation_error",
          message: "Channel name must be 1-100 characters."
        };
      }
      if (!/^[a-z0-9\-_]+$/i.test(name)) {
        return {
          status: "validation_error",
          message: "Channel name can only contain letters, numbers, hyphens, and underscores."
        };
      }
      if (!TYPE_MAP[type]) {
        return {
          status: "validation_error",
          message: `Invalid channel type "${type}". Allowed: ${VALID_TYPES.join(", ")}`
        };
      }
      const requesterMember = context.requesterId ? await guild.members.fetch(context.requesterId).catch(() => null) : null;
      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result = {
          status: "denied",
          message: "\u274C You do not have the **ManageChannels** permission required to create channels.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result = {
          status: "denied",
          message: "\u274C The bot does not have the **ManageChannels** permission required to create channels.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      if (categoryId) {
        const category = guild.channels.cache.get(categoryId);
        if (!category || category.type !== import_discord.ChannelType.GuildCategory) {
          return {
            status: "validation_error",
            message: `Category "${categoryId}" not found or is not a category.`
          };
        }
        if (category.guild.id !== guild.id) {
          return {
            status: "denied",
            message: "Category belongs to a different guild.",
            denialReason: "GUILD_ONLY"
          };
        }
      }
      const existingChannel = guild.channels.cache.find(
        (ch) => ch.name === name && ch.parentId === (categoryId || null)
      );
      if (existingChannel) {
        return {
          status: "validation_error",
          message: `\u274C Channel **#${name}** already exists in this category.`,
          denialReason: "CHANNEL_ALREADY_EXISTS"
        };
      }
      const discordType = TYPE_MAP[type];
      const categoryName = categoryId ? guild.channels.cache.get(categoryId)?.name || "Unknown" : "None";
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [
          {
            type: "create",
            target: `#${name}`,
            description: `Create ${TYPE_NAMES[discordType] || type} channel`,
            permissions: "ManageChannels"
          }
        ],
        true
      );
      plan.toolName = "create_channel";
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Create Channel`,
        `**Name:** #${name}`,
        `**Type:** ${TYPE_NAMES[discordType] || type}`,
        `**Category:** ${categoryName}`,
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
async function executeCreateChannel(plan, getClient) {
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
      message: "\u274C Permission revoked. You no longer have ManageChannels.",
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
  const args = plan.arguments;
  const name = String(args.name || "").trim();
  const type = String(args.type || "").toLowerCase();
  const categoryId = args.categoryId;
  const discordType = TYPE_MAP[type];
  if (categoryId) {
    const category = guild.channels.cache.get(categoryId);
    if (!category || category.type !== import_discord.ChannelType.GuildCategory) {
      return { status: "error", message: "Category no longer exists." };
    }
  }
  const existingChannel = guild.channels.cache.find(
    (ch) => ch.name === name && ch.parentId === (categoryId || null)
  );
  if (existingChannel) {
    return {
      status: "validation_error",
      message: `\u274C Channel **#${name}** already exists.`,
      denialReason: "CHANNEL_ALREADY_EXISTS"
    };
  }
  try {
    const newChannel = await guild.channels.create({
      name,
      type: discordType,
      parent: categoryId || void 0
    });
    const categoryName = newChannel.parent?.name || "None";
    const typeName = TYPE_NAMES[newChannel.type] || type;
    const result = {
      status: "success",
      message: `\u2705 **Channel created**
#${newChannel.name}
Type: ${typeName}
Category: ${categoryName}
Action ID: \`${plan.id}\``,
      data: {
        channelId: newChannel.id,
        name: newChannel.name,
        type: typeName,
        category: categoryName
      }
    };
    (0, import_audit.recordToolAudit)(
      {
        ...plan,
        arguments: plan.arguments,
        channelId: plan.channelId,
        requesterName: "confirmed"
      },
      "success",
      void 0,
      startTime,
      false
    );
    return result;
  } catch (error) {
    import_logger.logger.error(`create_channel execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `\u274C Channel creation failed. The issue has been logged.`
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createCreateChannelTool,
  executeCreateChannel
});
