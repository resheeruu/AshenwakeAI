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
var inspect_server_exports = {};
__export(inspect_server_exports, {
  createInspectServerTool: () => createInspectServerTool
});
module.exports = __toCommonJS(inspect_server_exports);
var import_channel_scope = require("../channel-scope");
function createInspectServerTool(getClient) {
  return {
    name: "inspect_server",
    description: "Return a structured overview of the current Discord server.",
    category: "discord",
    requiredRole: "member",
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
          message: "Could not fetch guild. The bot may not be in this server.",
          denialReason: "GUILD_ONLY"
        };
      }
      try {
        const [members, channels, roles] = await Promise.all([
          guild.members.fetch(),
          guild.channels.fetch(),
          guild.roles.fetch()
        ]);
        const textChannels = channels.filter((c) => c?.type === 0).size;
        const voiceChannels = channels.filter((c) => c?.type === 2).size;
        const categories = channels.filter((c) => c?.type === 4).size;
        const forumChannels = channels.filter((c) => c?.type === 15).size;
        const botCount = members.filter((m) => m.user.bot).size;
        const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(context.guildId);
        const managementChannels = [];
        const chatChannels = [];
        for (const [chId, scopes] of Object.entries(aiConfig.channelScopes)) {
          if (scopes.includes("AI_MANAGEMENT")) managementChannels.push(chId);
          if (scopes.includes("AI_CHAT")) chatChannels.push(chId);
        }
        const info = {
          id: guild.id,
          name: guild.name,
          ownerId: guild.ownerId,
          memberCount: guild.memberCount,
          botCount,
          roleCount: roles.size,
          channelCount: channels.size,
          categoryCount: categories,
          textChannelCount: textChannels,
          voiceChannelCount: voiceChannels,
          forumChannelCount: forumChannels,
          boostLevel: guild.premiumTier,
          verificationLevel: String(guild.verificationLevel),
          aiEnabled: aiConfig.enabled,
          aiManagementEnabled: aiConfig.managementEnabled,
          aiManagementChannels: managementChannels,
          aiChatChannels: chatChannels
        };
        const lines = [
          "\u{1F4CB} **Server Overview**",
          "",
          `**Name:** ${info.name}`,
          `**ID:** ${info.id}`,
          `**Owner:** <@${info.ownerId}>`,
          `**Members:** ${info.memberCount} (${info.botCount} bots)`,
          `**Channels:** ${info.channelCount} (${info.textChannelCount} text, ${info.voiceChannelCount} voice, ${info.forumChannelCount} forum)`,
          `**Categories:** ${info.categoryCount}`,
          `**Roles:** ${info.roleCount}`,
          `**Boost Level:** ${info.boostLevel}`,
          `**Verification:** ${info.verificationLevel}`,
          "",
          `**AI:** ${info.aiEnabled ? "Enabled" : "Disabled"}`,
          `**AI Management:** ${info.aiManagementEnabled ? "Enabled" : "Disabled"}`
        ];
        if (managementChannels.length > 0) {
          lines.push(`**Management Channels:** ${managementChannels.map((id) => `<#${id}>`).join(", ")}`);
        }
        if (chatChannels.length > 0) {
          lines.push(`**AI Chat Channels:** ${chatChannels.map((id) => `<#${id}>`).join(", ")}`);
        }
        return {
          status: "success",
          message: lines.join("\n"),
          data: info
        };
      } catch (error) {
        return {
          status: "error",
          message: `Failed to inspect server. The issue has been logged.`
        };
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createInspectServerTool
});
