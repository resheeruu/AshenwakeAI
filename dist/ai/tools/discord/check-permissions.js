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
var check_permissions_exports = {};
__export(check_permissions_exports, {
  createCheckPermissionsTool: () => createCheckPermissionsTool
});
module.exports = __toCommonJS(check_permissions_exports);
var import_discord = require("discord.js");
function extractPermissions(member) {
  const p = member.permissions;
  return {
    viewChannel: p.has(import_discord.PermissionFlagsBits.ViewChannel),
    sendMessages: p.has(import_discord.PermissionFlagsBits.SendMessages),
    embedLinks: p.has(import_discord.PermissionFlagsBits.EmbedLinks),
    manageChannels: p.has(import_discord.PermissionFlagsBits.ManageChannels),
    manageRoles: p.has(import_discord.PermissionFlagsBits.ManageRoles),
    manageMessages: p.has(import_discord.PermissionFlagsBits.ManageMessages),
    moderateMembers: p.has(import_discord.PermissionFlagsBits.ModerateMembers),
    moveMembers: p.has(import_discord.PermissionFlagsBits.MoveMembers),
    connect: p.has(import_discord.PermissionFlagsBits.Connect),
    speak: p.has(import_discord.PermissionFlagsBits.Speak)
  };
}
function emptyPermissions() {
  return {
    viewChannel: false,
    sendMessages: false,
    embedLinks: false,
    manageChannels: false,
    manageRoles: false,
    manageMessages: false,
    moderateMembers: false,
    moveMembers: false,
    connect: false,
    speak: false
  };
}
function createCheckPermissionsTool(getClient) {
  return {
    name: "check_permissions",
    description: "Show your application role and Discord permissions, plus the bot's permissions.",
    category: "discord",
    requiredRole: "guest",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT", "AI_MANAGEMENT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (context) => {
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
      try {
        const member = context.requesterId ? await guild.members.fetch(context.requesterId).catch(() => null) : null;
        const userPermissions = member ? extractPermissions(member) : emptyPermissions();
        const botMember = await guild.members.me;
        const botPermissions = botMember ? extractPermissions(botMember) : emptyPermissions();
        const report = {
          user: {
            applicationRole: context.requesterRole,
            discordPermissions: userPermissions
          },
          bot: {
            discordPermissions: botPermissions
          },
          summary: {
            canCreateChannels: botPermissions.manageChannels,
            canManageRoles: botPermissions.manageRoles,
            canTimeoutMembers: botPermissions.moderateMembers,
            canDeleteMessages: botPermissions.manageMessages,
            canMoveMembers: botPermissions.moveMembers
          }
        };
        const lines = [
          "\u{1F510} **Permission Report**",
          "",
          "**You:**",
          `  \u2022 Application role: **${context.requesterRole}**`,
          `  \u2022 View channel: ${userPermissions.viewChannel ? "\u2705" : "\u274C"}`,
          `  \u2022 Send messages: ${userPermissions.sendMessages ? "\u2705" : "\u274C"}`,
          `  \u2022 Manage channels: ${userPermissions.manageChannels ? "\u2705" : "\u274C"}`,
          `  \u2022 Manage roles: ${userPermissions.manageRoles ? "\u2705" : "\u274C"}`,
          `  \u2022 Timeout members: ${userPermissions.moderateMembers ? "\u2705" : "\u274C"}`,
          `  \u2022 Manage messages: ${userPermissions.manageMessages ? "\u2705" : "\u274C"}`,
          "",
          "**Bot:**",
          `  \u2022 View channel: ${botPermissions.viewChannel ? "\u2705" : "\u274C"}`,
          `  \u2022 Send messages: ${botPermissions.sendMessages ? "\u2705" : "\u274C"}`,
          `  \u2022 Embed links: ${botPermissions.embedLinks ? "\u2705" : "\u274C"}`,
          `  \u2022 Manage channels: ${botPermissions.manageChannels ? "\u2705" : "\u274C"}`,
          `  \u2022 Manage roles: ${botPermissions.manageRoles ? "\u2705" : "\u274C"}`,
          `  \u2022 Timeout members: ${botPermissions.moderateMembers ? "\u2705" : "\u274C"}`,
          `  \u2022 Manage messages: ${botPermissions.manageMessages ? "\u2705" : "\u274C"}`
        ];
        return {
          status: "success",
          message: lines.join("\n"),
          data: report
        };
      } catch (error) {
        return {
          status: "error",
          message: `Failed to check permissions. The issue has been logged.`
        };
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createCheckPermissionsTool
});
