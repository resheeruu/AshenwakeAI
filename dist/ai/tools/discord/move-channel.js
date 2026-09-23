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
var move_channel_exports = {};
__export(move_channel_exports, {
  createMoveChannelTool: () => createMoveChannelTool,
  executeMoveChannel: () => executeMoveChannel
});
module.exports = __toCommonJS(move_channel_exports);
var import_discord = require("discord.js");
var import_executor = require("../executor");
var import_confirmation_store = require("../confirmation-store");
var import_audit = require("../audit");
var import_logger = require("../../../logger");
var import_protection = require("./protection");
function hasManageChannels(member) {
  return member.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
}
function createMoveChannelTool(getClient) {
  return {
    name: "move_channel",
    description: "Move a channel to a different category (or uncategorize it).",
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
        description: "ID of the channel to move",
        required: true
      },
      {
        name: "categoryId",
        type: "string",
        description: "Target category ID (empty string to uncategorize)",
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
      const categoryId = String(context.arguments.categoryId || "").trim();
      if (!channelId) {
        return { status: "validation_error", message: "Missing required parameter: channelId" };
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
          message: `\u274C Cannot move protected channel #${targetChannel.name}.`,
          denialReason: "PROTECTED_RESOURCE"
        };
      }
      if (categoryId) {
        const targetCategory = guild.channels.cache.get(categoryId);
        if (!targetCategory || targetCategory.type !== import_discord.ChannelType.GuildCategory) {
          return {
            status: "validation_error",
            message: `Category "${categoryId}" not found or is not a category.`
          };
        }
        if (targetCategory.guild.id !== guild.id) {
          return {
            status: "denied",
            message: "Category belongs to a different guild.",
            denialReason: "GUILD_ONLY"
          };
        }
        if ((0, import_protection.isProtectedCategory)(context.guildId, categoryId)) {
          return {
            status: "denied",
            message: `\u274C Cannot move channel into protected category "${targetCategory.name}".`,
            denialReason: "PROTECTED_RESOURCE"
          };
        }
      }
      const requesterMember = context.requesterId ? await guild.members.fetch(context.requesterId).catch(() => null) : null;
      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result = {
          status: "denied",
          message: "\u274C You do not have the **ManageChannels** permission required to move channels.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result = {
          status: "denied",
          message: "\u274C The bot does not have the **ManageChannels** permission required to move channels.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      if (targetChannel.parentId === (categoryId || null)) {
        return {
          status: "validation_error",
          message: `Channel **#${targetChannel.name}** is already in the target category.`
        };
      }
      const currentCategoryName = targetChannel.parent?.name || "Uncategorized";
      const newCategoryName = categoryId ? guild.channels.cache.get(categoryId)?.name || "Unknown" : "Uncategorized";
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [
          {
            type: "modify",
            target: `#${targetChannel.name}`,
            description: `Move from ${currentCategoryName} to ${newCategoryName}`,
            before: currentCategoryName,
            after: newCategoryName,
            permissions: "ManageChannels"
          }
        ],
        true
      );
      plan.toolName = "move_channel";
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Move Channel`,
        `**Channel:** #${targetChannel.name}`,
        `**From:** ${currentCategoryName}`,
        `**To:** ${newCategoryName}`,
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
async function executeMoveChannel(plan, getClient) {
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
  const categoryId = String(plan.arguments.categoryId || "").trim();
  const targetChannel = guild.channels.cache.get(channelId);
  if (!targetChannel) {
    return { status: "error", message: "Channel no longer exists." };
  }
  if ((0, import_protection.isChannelProtected)(plan.guildId, channelId, targetChannel.parentId)) {
    return { status: "denied", message: "\u274C Channel is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }
  if (categoryId) {
    const targetCategory = guild.channels.cache.get(categoryId);
    if (!targetCategory || targetCategory.type !== import_discord.ChannelType.GuildCategory) {
      return { status: "error", message: "Target category no longer exists." };
    }
    if ((0, import_protection.isProtectedCategory)(plan.guildId, categoryId)) {
      return { status: "denied", message: "\u274C Target category is now protected.", denialReason: "PROTECTED_RESOURCE" };
    }
  }
  if (targetChannel.parentId === (categoryId || null)) {
    return {
      status: "validation_error",
      message: `Channel is already in the target category.`
    };
  }
  const oldCategoryName = targetChannel.parent?.name || "Uncategorized";
  try {
    await targetChannel.setParent(categoryId || void 0);
    const newCategoryName = targetChannel.parent?.name || "Uncategorized";
    const result = {
      status: "success",
      message: `\u2705 **Channel moved**
#${targetChannel.name}
From: ${oldCategoryName}
To: ${newCategoryName}
Action ID: \`${plan.id}\``,
      data: {
        channelId: targetChannel.id,
        name: targetChannel.name,
        oldCategory: oldCategoryName,
        newCategory: newCategoryName
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
    import_logger.logger.error(`move_channel execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `\u274C Move failed. The issue has been logged.`
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createMoveChannelTool,
  executeMoveChannel
});
