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
var delete_category_exports = {};
__export(delete_category_exports, {
  createDeleteCategoryTool: () => createDeleteCategoryTool,
  executeDeleteCategory: () => executeDeleteCategory
});
module.exports = __toCommonJS(delete_category_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_logger = require("../../../../logger");
var import_protection = require("../protection");
function hasManageChannels(member) {
  return member.permissions.has(import_discord.PermissionFlagsBits.ManageChannels);
}
function createDeleteCategoryTool(getClient) {
  return {
    name: "delete_category",
    description: "Delete a category. Lists affected channels before confirmation.",
    category: "discord",
    requiredRole: "admin",
    requiredDiscordPermissions: ["ManageChannels"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "critical",
    parameters: [
      {
        name: "categoryId",
        type: "string",
        description: "ID of the category to delete",
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
      const category = guild.channels.cache.get(categoryId);
      if (!category || category.type !== import_discord.ChannelType.GuildCategory) {
        return { status: "denied", message: `Category "${categoryId}" not found.`, denialReason: "RESOURCE_NOT_FOUND" };
      }
      if (category.guild.id !== guild.id) {
        return { status: "denied", message: "Category belongs to a different guild.", denialReason: "GUILD_ONLY" };
      }
      if ((0, import_protection.isProtectedResource)(context.guildId, categoryId)) {
        return { status: "denied", message: `\u274C Cannot delete protected category ${category.name}.`, denialReason: "PROTECTED_RESOURCE" };
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
      const affectedChannels = guild.channels.cache.filter((ch) => ch.parentId === categoryId);
      const affectedNames = affectedChannels.map((ch) => `\u2022 <#${ch.id}>`).join("\n") || "\u2022 None";
      const plan = (0, import_executor.createActionPlan)(
        context,
        "critical",
        [{
          type: "delete",
          target: category.name,
          description: `Delete category and ${affectedChannels.size} channel(s)`,
          permissions: "ManageChannels"
        }],
        true
      );
      plan.toolName = "delete_category";
      plan.arguments = { ...context.arguments };
      (0, import_confirmation_store.storePendingPlan)(plan);
      const lines = [
        "\u26A0\uFE0F **CRITICAL ACTION**",
        "",
        `**Action:** Delete Category`,
        `**Category:** ${category.name}`,
        `**Guild:** ${guild.name}`,
        "",
        `**Channels affected (${affectedChannels.size}):**`,
        affectedNames,
        "",
        "The category and its channels may be removed.",
        "",
        `**Risk:** CRITICAL`,
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
async function executeDeleteCategory(plan, getClient) {
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
  const category = guild.channels.cache.get(categoryId);
  if (!category || category.type !== import_discord.ChannelType.GuildCategory) {
    return { status: "error", message: "Category no longer exists." };
  }
  if ((0, import_protection.isProtectedResource)(plan.guildId, categoryId)) {
    return { status: "denied", message: "\u274C Category is now protected.", denialReason: "PROTECTED_RESOURCE" };
  }
  const affectedChannels = guild.channels.cache.filter((ch) => ch.parentId === categoryId);
  const affectedNames = affectedChannels.map((ch) => `#${ch.name}`).join(", ") || "None";
  try {
    await category.delete();
    const result = {
      status: "success",
      message: `\u2705 **Category deleted** ${category.name}
Affected channels: ${affectedNames}
Action ID: \`${plan.id}\``,
      data: { categoryId, name: category.name, affectedChannels: affectedChannels.size }
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
    import_logger.logger.error(`delete_category execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: "error", message: `\u274C Delete failed. The issue has been logged.` };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createDeleteCategoryTool,
  executeDeleteCategory
});
