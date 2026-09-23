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
var protection_tools_exports = {};
__export(protection_tools_exports, {
  createListProtectedResourcesTool: () => createListProtectedResourcesTool,
  createProtectCategoryTool: () => createProtectCategoryTool,
  createProtectChannelTool: () => createProtectChannelTool,
  createUnprotectCategoryTool: () => createUnprotectCategoryTool,
  createUnprotectChannelTool: () => createUnprotectChannelTool,
  executeProtectCategory: () => executeProtectCategory,
  executeProtectChannel: () => executeProtectChannel,
  executeUnprotectCategory: () => executeUnprotectCategory,
  executeUnprotectChannel: () => executeUnprotectChannel
});
module.exports = __toCommonJS(protection_tools_exports);
var import_discord = require("discord.js");
var import_executor = require("../executor");
var import_confirmation_store = require("../confirmation-store");
var import_audit = require("../audit");
var import_protection = require("./protection");
function hasManageChannels(member) {
  return member.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
}
function createProtectChannelTool(getClient) {
  return {
    name: "protect_channel",
    description: "Protect a channel from being deleted, renamed, moved, or modified by AI tools.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel to protect",
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
      if ((0, import_protection.isProtectedResource)(context.guildId, channelId)) {
        return { status: "validation_error", message: `Channel #${targetChannel.name} is already protected.` };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [{
          type: "assign",
          target: `#${targetChannel.name}`,
          description: "Protect channel from AI modifications",
          permissions: "ManageChannels"
        }],
        true
      );
      plan.toolName = "protect_channel";
      plan.arguments = { ...context.arguments };
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Protect Channel`,
        `**Channel:** #${targetChannel.name}`,
        `**Effect:** Channel cannot be deleted, renamed, moved, or have permissions modified by AI`,
        `**Risk:** MEDIUM`,
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
async function executeProtectChannel(plan, getClient) {
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
  const added = (0, import_protection.protectChannel)(plan.guildId, channelId);
  if (!added) {
    return { status: "validation_error", message: `Channel #${targetChannel.name} is already protected.` };
  }
  const result = {
    status: "success",
    message: `\u2705 **Channel protected** #${targetChannel.name}
Action ID: \`${plan.id}\``,
    data: { channelId, name: targetChannel.name, protected: true }
  };
  (0, import_audit.recordToolAudit)(
    { ...plan, channelId: plan.channelId, requesterName: "confirmed" },
    "success",
    void 0,
    startTime,
    false
  );
  return result;
}
function createUnprotectChannelTool(getClient) {
  return {
    name: "unprotect_channel",
    description: "Remove protection from a channel, allowing AI tools to modify it.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "channelId",
        type: "string",
        description: "ID of the channel to unprotect",
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
      if (!(0, import_protection.isProtectedResource)(context.guildId, channelId)) {
        return { status: "validation_error", message: `Channel #${targetChannel.name} is not protected.` };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [{
          type: "remove",
          target: `#${targetChannel.name}`,
          description: "Remove channel protection",
          permissions: "ManageChannels"
        }],
        true
      );
      plan.toolName = "unprotect_channel";
      plan.arguments = { ...context.arguments };
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Unprotect Channel`,
        `**Channel:** #${targetChannel.name}`,
        `**Effect:** Channel can now be modified by AI tools`,
        `**Risk:** MEDIUM`,
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
async function executeUnprotectChannel(plan, getClient) {
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
  const removed = (0, import_protection.unprotectChannel)(plan.guildId, channelId);
  if (!removed) {
    return { status: "validation_error", message: `Channel #${targetChannel.name} is not protected.` };
  }
  const result = {
    status: "success",
    message: `\u2705 **Channel unprotected** #${targetChannel.name}
Action ID: \`${plan.id}\``,
    data: { channelId, name: targetChannel.name, protected: false }
  };
  (0, import_audit.recordToolAudit)(
    { ...plan, channelId: plan.channelId, requesterName: "confirmed" },
    "success",
    void 0,
    startTime,
    false
  );
  return result;
}
function createProtectCategoryTool(getClient) {
  return {
    name: "protect_category",
    description: "Protect a category from being deleted or modified by AI tools.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "categoryId",
        type: "string",
        description: "ID of the category to protect",
        required: true
      }
    ],
    execute: async (context) => {
      const startTime = Date.now();
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      const categoryId = String(context.arguments.categoryId || "").trim();
      if (!categoryId) return { status: "validation_error", message: "Missing required parameter: categoryId" };
      const targetCategory = guild.channels.cache.get(categoryId);
      if (!targetCategory || targetCategory.type !== import_discord.ChannelType.GuildCategory) {
        return { status: "denied", message: `Category "${categoryId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      }
      if (targetCategory.guild.id !== guild.id) return { status: "denied", message: "Category belongs to a different guild.", denialReason: "GUILD_ONLY" };
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
      if ((0, import_protection.isProtectedResource)(context.guildId, categoryId)) {
        return { status: "validation_error", message: `Category ${targetCategory.name} is already protected.` };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [{
          type: "assign",
          target: targetCategory.name,
          description: "Protect category from AI modifications",
          permissions: "ManageChannels"
        }],
        true
      );
      plan.toolName = "protect_category";
      plan.arguments = { ...context.arguments };
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Protect Category`,
        `**Category:** ${targetCategory.name}`,
        `**Effect:** Category cannot be deleted or modified by AI`,
        `**Risk:** MEDIUM`,
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
async function executeProtectCategory(plan, getClient) {
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
  const categoryId = String(plan.arguments.categoryId || "").trim();
  const targetCategory = guild.channels.cache.get(categoryId);
  if (!targetCategory || targetCategory.type !== import_discord.ChannelType.GuildCategory) {
    return { status: "error", message: "Category no longer exists." };
  }
  const added = (0, import_protection.protectCategory)(plan.guildId, categoryId);
  if (!added) {
    return { status: "validation_error", message: `Category ${targetCategory.name} is already protected.` };
  }
  const result = {
    status: "success",
    message: `\u2705 **Category protected** ${targetCategory.name}
Action ID: \`${plan.id}\``,
    data: { categoryId, name: targetCategory.name, protected: true }
  };
  (0, import_audit.recordToolAudit)(
    { ...plan, channelId: plan.channelId, requesterName: "confirmed" },
    "success",
    void 0,
    startTime,
    false
  );
  return result;
}
function createUnprotectCategoryTool(getClient) {
  return {
    name: "unprotect_category",
    description: "Remove protection from a category, allowing AI tools to modify it.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "medium",
    parameters: [
      {
        name: "categoryId",
        type: "string",
        description: "ID of the category to unprotect",
        required: true
      }
    ],
    execute: async (context) => {
      const startTime = Date.now();
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      const categoryId = String(context.arguments.categoryId || "").trim();
      if (!categoryId) return { status: "validation_error", message: "Missing required parameter: categoryId" };
      const targetCategory = guild.channels.cache.get(categoryId);
      if (!targetCategory || targetCategory.type !== import_discord.ChannelType.GuildCategory) {
        return { status: "denied", message: `Category "${categoryId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      }
      if (targetCategory.guild.id !== guild.id) return { status: "denied", message: "Category belongs to a different guild.", denialReason: "GUILD_ONLY" };
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
      if (!(0, import_protection.isProtectedResource)(context.guildId, categoryId)) {
        return { status: "validation_error", message: `Category ${targetCategory.name} is not protected.` };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [{
          type: "remove",
          target: targetCategory.name,
          description: "Remove category protection",
          permissions: "ManageChannels"
        }],
        true
      );
      plan.toolName = "unprotect_category";
      plan.arguments = { ...context.arguments };
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Unprotect Category`,
        `**Category:** ${targetCategory.name}`,
        `**Effect:** Category can now be modified by AI tools`,
        `**Risk:** MEDIUM`,
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
async function executeUnprotectCategory(plan, getClient) {
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
  const categoryId = String(plan.arguments.categoryId || "").trim();
  const targetCategory = guild.channels.cache.get(categoryId);
  if (!targetCategory || targetCategory.type !== import_discord.ChannelType.GuildCategory) {
    return { status: "error", message: "Category no longer exists." };
  }
  const removed = (0, import_protection.unprotectCategory)(plan.guildId, categoryId);
  if (!removed) {
    return { status: "validation_error", message: `Category ${targetCategory.name} is not protected.` };
  }
  const result = {
    status: "success",
    message: `\u2705 **Category unprotected** ${targetCategory.name}
Action ID: \`${plan.id}\``,
    data: { categoryId, name: targetCategory.name, protected: false }
  };
  (0, import_audit.recordToolAudit)(
    { ...plan, channelId: plan.channelId, requesterName: "confirmed" },
    "success",
    void 0,
    startTime,
    false
  );
  return result;
}
function createListProtectedResourcesTool(getClient) {
  return {
    name: "list_protected_resources",
    description: "List all protected channels and categories in this server.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context) => {
      const startTime = Date.now();
      const client = getClient();
      if (!client) return { status: "error", message: "Discord client is not connected." };
      const guild = await client.guilds.fetch(context.guildId).catch(() => null);
      if (!guild) return { status: "denied", message: "Could not fetch guild.", denialReason: "GUILD_ONLY" };
      const resources = (0, import_protection.getProtectedResources)(context.guildId);
      const channelNames = resources.channels.map((id) => {
        const ch = guild.channels.cache.get(id);
        return ch ? `<#${id}>` : `#${id} (not found)`;
      });
      const categoryNames = resources.categories.map((id) => {
        const cat = guild.channels.cache.get(id);
        return cat ? cat.name : `${id} (not found)`;
      });
      const lines = [
        "**\u{1F512} Protected Resources**",
        "",
        `**Channels (${resources.channels.length}):**`,
        ...channelNames.length ? channelNames.map((n) => `\u2022 ${n}`) : ["\u2022 None"],
        "",
        `**Categories (${resources.categories.length}):**`,
        ...categoryNames.length ? categoryNames.map((n) => `\u2022 ${n}`) : ["\u2022 None"]
      ];
      (0, import_audit.recordToolAudit)(context, "success", void 0, startTime, false);
      return {
        status: "success",
        message: lines.join("\n"),
        data: resources
      };
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createListProtectedResourcesTool,
  createProtectCategoryTool,
  createProtectChannelTool,
  createUnprotectCategoryTool,
  createUnprotectChannelTool,
  executeProtectCategory,
  executeProtectChannel,
  executeUnprotectCategory,
  executeUnprotectChannel
});
