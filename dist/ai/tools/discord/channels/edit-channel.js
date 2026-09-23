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
var edit_channel_exports = {};
__export(edit_channel_exports, {
  createEditChannelTool: () => createEditChannelTool,
  executeEditChannel: () => executeEditChannel
});
module.exports = __toCommonJS(edit_channel_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_logger = require("../../../../logger");
var import_protection = require("../protection");
function hasManageChannels(member) {
  return member.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
}
const VALID_EDIT_FIELDS = ["name", "topic", "nsfw", "rateLimitPerUser", "position", "parentId"];
function createEditChannelTool(getClient) {
  return {
    name: "edit_channel",
    description: "Modify safe properties of an existing channel (name, topic, slowmode, nsfw).",
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
        description: "ID of the channel to edit",
        required: true
      },
      {
        name: "name",
        type: "string",
        description: "New channel name",
        required: false
      },
      {
        name: "topic",
        type: "string",
        description: "New channel topic (max 1024 chars)",
        required: false
      },
      {
        name: "nsfw",
        type: "boolean",
        description: "Set NSFW flag",
        required: false
      },
      {
        name: "rateLimitPerUser",
        type: "number",
        description: "Slowmode in seconds (0-21600)",
        required: false
      },
      {
        name: "parentId",
        type: "string",
        description: "Move to a different category",
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
          message: "Could not fetch guild.",
          denialReason: "GUILD_ONLY"
        };
      }
      const channelId = String(context.arguments.channelId || "").trim();
      if (!channelId) {
        return { status: "validation_error", message: "Missing required parameter: channelId" };
      }
      const updates = {};
      const changes = [];
      const name = context.arguments.name !== void 0 ? String(context.arguments.name).trim() : void 0;
      const topic = context.arguments.topic !== void 0 ? String(context.arguments.topic) : void 0;
      const nsfw = context.arguments.nsfw !== void 0 ? Boolean(context.arguments.nsfw) : void 0;
      const rateLimitPerUser = context.arguments.rateLimitPerUser !== void 0 ? Number(context.arguments.rateLimitPerUser) : void 0;
      const parentId = context.arguments.parentId !== void 0 ? String(context.arguments.parentId).trim() : void 0;
      if (name !== void 0) {
        if (!name || name.length < 1 || name.length > 100) {
          return { status: "validation_error", message: "Channel name must be 1-100 characters." };
        }
        if (!/^[a-z0-9\-_]+$/i.test(name)) {
          return { status: "validation_error", message: "Channel name can only contain letters, numbers, hyphens, and underscores." };
        }
        updates.name = name;
      }
      if (topic !== void 0) {
        if (topic.length > 1024) {
          return { status: "validation_error", message: "Channel topic must be 1024 characters or fewer." };
        }
        updates.topic = topic;
      }
      if (nsfw !== void 0) {
        updates.nsfw = nsfw;
      }
      if (rateLimitPerUser !== void 0) {
        if (rateLimitPerUser < 0 || rateLimitPerUser > 21600) {
          return { status: "validation_error", message: "Slowmode must be between 0 and 21600 seconds." };
        }
        updates.rateLimitPerUser = rateLimitPerUser;
      }
      if (parentId !== void 0) {
        if (parentId) {
          const category = guild.channels.cache.get(parentId);
          if (!category || category.type !== import_discord.ChannelType.GuildCategory) {
            return { status: "validation_error", message: `Category "${parentId}" not found or is not a category.` };
          }
          if (category.guild.id !== guild.id) {
            return { status: "denied", message: "Category belongs to a different guild.", denialReason: "GUILD_ONLY" };
          }
          if ((0, import_protection.isProtectedCategory)(context.guildId, parentId)) {
            return {
              status: "denied",
              message: `\u274C Cannot move channel into protected category "${category.name}".`,
              denialReason: "PROTECTED_RESOURCE"
            };
          }
        }
        updates.parentId = parentId || null;
      }
      if (Object.keys(updates).length === 0) {
        return { status: "validation_error", message: "No properties to update. Provide at least one field to edit." };
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
          message: `\u274C Cannot edit protected channel #${targetChannel.name}.`,
          denialReason: "PROTECTED_RESOURCE"
        };
      }
      const requesterMember = context.requesterId ? await guild.members.fetch(context.requesterId).catch(() => null) : null;
      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result = {
          status: "denied",
          message: "\u274C You do not have the **ManageChannels** permission.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result = {
          status: "denied",
          message: "\u274C The bot does not have **ManageChannels** permission.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const oldName = targetChannel.name;
      const changeList = [];
      if (updates.name) changeList.push({ type: "modify", target: `#${oldName}`, description: `Rename to #${updates.name}`, before: oldName, after: String(updates.name) });
      if (updates.topic !== void 0) changeList.push({ type: "modify", target: `#${oldName}`, description: "Update topic", before: "set", after: "updated" });
      if (updates.nsfw !== void 0) changeList.push({ type: "modify", target: `#${oldName}`, description: `Set NSFW to ${updates.nsfw}` });
      if (updates.rateLimitPerUser !== void 0) changeList.push({ type: "modify", target: `#${oldName}`, description: `Set slowmode to ${updates.rateLimitPerUser}s` });
      if (updates.parentId !== void 0) changeList.push({ type: "modify", target: `#${oldName}`, description: "Move category" });
      const plan = (0, import_executor.createActionPlan)(context, "medium", changeList, true);
      plan.toolName = "edit_channel";
      plan.arguments = { ...context.arguments };
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Edit Channel`,
        `**Channel:** #${oldName}`,
        ...changeList.map((c) => `\u2022 ${c.description}`),
        "",
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
async function executeEditChannel(plan, getClient) {
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
  const updates = {};
  if (plan.arguments.name !== void 0) updates.name = String(plan.arguments.name).trim();
  if (plan.arguments.topic !== void 0) updates.topic = String(plan.arguments.topic);
  if (plan.arguments.nsfw !== void 0) updates.nsfw = Boolean(plan.arguments.nsfw);
  if (plan.arguments.rateLimitPerUser !== void 0) updates.rateLimitPerUser = Number(plan.arguments.rateLimitPerUser);
  if (plan.arguments.parentId !== void 0) {
    const parentId = String(plan.arguments.parentId).trim();
    if (parentId && (0, import_protection.isProtectedCategory)(plan.guildId, parentId)) {
      return { status: "denied", message: "\u274C Target category is now protected.", denialReason: "PROTECTED_RESOURCE" };
    }
    updates.parentId = parentId || null;
  }
  try {
    await targetChannel.edit(updates);
    const result = {
      status: "success",
      message: `\u2705 **Channel updated** #${targetChannel.name}
Action ID: \`${plan.id}\``,
      data: { channelId: targetChannel.id, name: targetChannel.name }
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
    import_logger.logger.error(`edit_channel execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: `\u274C Edit failed. The issue has been logged.` };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createEditChannelTool,
  executeEditChannel
});
