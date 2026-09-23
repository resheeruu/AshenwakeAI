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
var timeout_user_exports = {};
__export(timeout_user_exports, {
  createTimeoutUserTool: () => createTimeoutUserTool,
  executeTimeoutUserPlan: () => executeTimeoutUserPlan
});
module.exports = __toCommonJS(timeout_user_exports);
var import_discord = require("discord.js");
var import_executor = require("../../executor");
var import_confirmation_store = require("../../confirmation-store");
var import_audit = require("../../audit");
var import_moderation = require("../../../../discord/moderation");
var import_logger = require("../../../../logger");
const MIN_TIMEOUT_MINUTES = 1;
const MAX_TIMEOUT_MINUTES = 40320;
function createTimeoutUserTool(getClient) {
  return {
    name: "timeout_user",
    description: "Temporarily mute a member (timeout) in this server.",
    category: "discord",
    requiredRole: "moderator",
    requiredDiscordPermissions: ["ModerateMembers"],
    allowedScopes: ["AI_MANAGEMENT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      {
        name: "userId",
        type: "string",
        description: "ID of the user to timeout",
        required: true
      },
      {
        name: "durationMinutes",
        type: "number",
        description: "Duration in minutes (1-40320, i.e. 1 minute to 28 days)",
        required: true
      },
      {
        name: "reason",
        type: "string",
        description: "Reason for the timeout",
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
      const userId = String(context.arguments.userId || "").trim();
      const durationMinutes = Number(context.arguments.durationMinutes);
      const reason = String(context.arguments.reason || "Timeout issued via AI tool").trim();
      if (!userId) {
        return { status: "validation_error", message: "Missing required parameter: userId" };
      }
      if (!Number.isFinite(durationMinutes) || durationMinutes < MIN_TIMEOUT_MINUTES || durationMinutes > MAX_TIMEOUT_MINUTES) {
        return {
          status: "validation_error",
          message: `Duration must be between ${MIN_TIMEOUT_MINUTES} and ${MAX_TIMEOUT_MINUTES} minutes (1 minute to 28 days).`
        };
      }
      const target = await guild.members.fetch(userId).catch(() => null);
      if (!target) {
        return { status: "validation_error", message: `User "${userId}" not found in this server.` };
      }
      const requesterMember = await guild.members.fetch(context.requesterId).catch(() => null);
      if (!requesterMember) {
        return { status: "denied", message: "You are not a member of this server.", denialReason: "GUILD_ONLY" };
      }
      const botMember = await guild.members.me;
      if (!botMember) {
        return { status: "error", message: "Could not fetch bot member." };
      }
      if (!botMember.permissions.has(import_discord.PermissionFlagsBits.ModerateMembers)) {
        return { status: "denied", message: "I don't have permission to timeout members.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }
      if (!(0, import_moderation.canModerate)(requesterMember, import_discord.PermissionFlagsBits.ModerateMembers)) {
        return { status: "denied", message: "You don't have permission to timeout members.", denialReason: "MISSING_DISCORD_PERMISSION" };
      }
      const targetCheck = (0, import_moderation.canTarget)(requesterMember, target, botMember);
      if (!targetCheck.allowed) {
        return { status: "denied", message: `\u274C ${targetCheck.reason}`, denialReason: "MISSING_DISCORD_PERMISSION" };
      }
      const plan = (0, import_executor.createActionPlan)(
        context,
        "high",
        [{ type: "modify", target: `@${target.user.tag}`, description: `Timeout user for ${durationMinutes}m: ${reason}` }],
        true
      );
      plan.toolName = "timeout_user";
      plan.arguments = { ...context.arguments, _targetUserId: userId, _targetTag: target.user.tag, _durationMinutes: durationMinutes };
      (0, import_confirmation_store.storePendingPlan)(plan);
      return {
        status: "confirmation_required",
        message: [
          "\u{1F4CB} **ACTION PLAN**",
          "",
          "**Action:** Timeout User",
          `**Target:** ${target} (${target.user.tag})`,
          `**Duration:** ${durationMinutes} minute(s)`,
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
async function executeTimeoutUserPlan(plan, getClient) {
  const startTime = Date.now();
  const client = getClient();
  if (!client) {
    return { status: "error", message: "Discord client is not connected." };
  }
  const guild = await client.guilds.fetch(plan.guildId).catch(() => null);
  if (!guild) {
    return { status: "denied", message: "Guild not found.", denialReason: "GUILD_ONLY" };
  }
  const userId = String(plan.arguments._targetUserId || plan.arguments.userId || "").trim();
  const durationMinutes = Number(plan.arguments._durationMinutes || plan.arguments.durationMinutes);
  const reason = String(plan.arguments.reason || "Timeout issued via AI tool").trim();
  if (!userId) {
    return { status: "validation_error", message: "Missing userId in plan." };
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes < MIN_TIMEOUT_MINUTES || durationMinutes > MAX_TIMEOUT_MINUTES) {
    return { status: "validation_error", message: `Invalid duration: ${durationMinutes}.` };
  }
  if (plan.guildId !== guild.id) {
    return { status: "denied", message: "Plan guild does not match execution guild.", denialReason: "INVALID_ARGUMENTS" };
  }
  const target = await guild.members.fetch(userId).catch(() => null);
  if (!target) {
    return { status: "validation_error", message: `User "${userId}" not found in this server.` };
  }
  const requesterMember = await guild.members.fetch(plan.requesterId).catch(() => null);
  if (!requesterMember) {
    return { status: "denied", message: "Requester is not a member of this server.", denialReason: "GUILD_ONLY" };
  }
  const botMember = await guild.members.me;
  if (!botMember) {
    return { status: "error", message: "Could not fetch bot member." };
  }
  if (!botMember.permissions.has(import_discord.PermissionFlagsBits.ModerateMembers)) {
    return { status: "denied", message: "Bot no longer has ModerateMembers permission.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  if (!(0, import_moderation.canModerate)(requesterMember, import_discord.PermissionFlagsBits.ModerateMembers)) {
    return { status: "denied", message: "Permission revoked. You no longer have ModerateMembers.", denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  const targetCheck = (0, import_moderation.canTarget)(requesterMember, target, botMember);
  if (!targetCheck.allowed) {
    return { status: "denied", message: `\u274C ${targetCheck.reason}`, denialReason: "MISSING_DISCORD_PERMISSION" };
  }
  try {
    await target.timeout(durationMinutes * 60 * 1e3, reason);
    const result = {
      status: "success",
      message: `\u{1F507} **Member timed out**
**Member:** ${target}
**Duration:** ${durationMinutes} minute(s)
**Reason:** ${reason}
Action ID: \`${plan.id}\``,
      data: { userId, durationMinutes, reason }
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
    import_logger.logger.error(`timeout_user execution failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      message: `\u274C Discord rejected the timeout. Check my role position and permissions. The issue has been logged.`
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createTimeoutUserTool,
  executeTimeoutUserPlan
});
