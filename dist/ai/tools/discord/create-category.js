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
var create_category_exports = {};
__export(create_category_exports, {
  createCreateCategoryTool: () => createCreateCategoryTool,
  executeCreateCategory: () => executeCreateCategory
});
module.exports = __toCommonJS(create_category_exports);
var import_discord = require("discord.js");
var import_executor = require("../executor");
var import_confirmation_store = require("../confirmation-store");
var import_audit = require("../audit");
var import_logger = require("../../../logger");
function hasManageChannels(member) {
  return member.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
}
function createCreateCategoryTool(getClient) {
  return {
    name: "create_category",
    description: "Create a new category in the current server.",
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
        description: "Category name (alphanumeric, hyphens, underscores)",
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
          message: "Could not fetch guild. The bot may not be in this server.",
          denialReason: "GUILD_ONLY"
        };
      }
      const name = String(context.arguments.name || "").trim();
      if (!name || name.length < 1 || name.length > 100) {
        return {
          status: "validation_error",
          message: "Category name must be 1-100 characters."
        };
      }
      if (!/^[a-z0-9\-_]+$/i.test(name)) {
        return {
          status: "validation_error",
          message: "Category name can only contain letters, numbers, hyphens, and underscores."
        };
      }
      const requesterMember = context.requesterId ? await guild.members.fetch(context.requesterId).catch(() => null) : null;
      if (!requesterMember || !hasManageChannels(requesterMember)) {
        const result = {
          status: "denied",
          message: "\u274C You do not have the **ManageChannels** permission required to create categories.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const botMember = await guild.members.me;
      if (!botMember || !hasManageChannels(botMember)) {
        const result = {
          status: "denied",
          message: "\u274C The bot does not have the **ManageChannels** permission required to create categories.",
          denialReason: "MISSING_DISCORD_PERMISSION"
        };
        (0, import_audit.recordToolAudit)(context, result.status, result.denialReason, startTime, false);
        return result;
      }
      const existingCategory = guild.channels.cache.find(
        (ch) => ch.type === import_discord.ChannelType.GuildCategory && ch.name === name
      );
      if (existingCategory) {
        return {
          status: "validation_error",
          message: `\u274C Category **${name}** already exists.`,
          denialReason: "CATEGORY_ALREADY_EXISTS"
        };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "medium",
        [
          {
            type: "create",
            target: name,
            description: "Create category",
            permissions: "ManageChannels"
          }
        ],
        true
      );
      plan.toolName = "create_category";
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u{1F4CB} **ACTION PLAN**",
        "",
        `**Action:** Create Category`,
        `**Name:** ${name}`,
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
async function executeCreateCategory(plan, getClient) {
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
  const name = String(plan.arguments.name || "").trim();
  const existingCategory = guild.channels.cache.find(
    (ch) => ch.type === import_discord.ChannelType.GuildCategory && ch.name === name
  );
  if (existingCategory) {
    return {
      status: "validation_error",
      message: `\u274C Category **${name}** already exists.`,
      denialReason: "CATEGORY_ALREADY_EXISTS"
    };
  }
  try {
    const newCategory = await guild.channels.create({
      name,
      type: import_discord.ChannelType.GuildCategory
    });
    const result = {
      status: "success",
      message: `\u2705 **Category created**
${newCategory.name}
Action ID: \`${plan.id}\``,
      data: {
        categoryId: newCategory.id,
        name: newCategory.name
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
    import_logger.logger.error(`create_category execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `\u274C Category creation failed. The issue has been logged.`
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createCreateCategoryTool,
  executeCreateCategory
});
