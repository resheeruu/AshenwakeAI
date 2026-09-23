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
var status_exports = {};
__export(status_exports, {
  createStatusCommand: () => createStatusCommand
});
module.exports = __toCommonJS(status_exports);
var import_discord = require("discord.js");
var import_ai_usage_repo = require("../database/ai-usage-repo");
var import_logger = require("../logger");
var import_emojis = require("../discord/emojis");
const EMBED_COLOR = 2895667;
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
function formatTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
function statusDot(online) {
  return online ? `${(0, import_emojis.emoji)("ash_online")}` : `${(0, import_emojis.emoji)("ash_offline")}`;
}
function createStatusCommand(_router, memory, agentManager) {
  return {
    data: new import_discord.SlashCommandBuilder().setName("status").setDescription("Show AshenAI health and your AI usage"),
    async execute(interaction) {
      try {
        const agentStatus = agentManager?.getStatus() ?? { status: "offline" };
        const stats = memory.stats();
        const uptimeSec = Math.floor(process.uptime());
        const userId = interaction.user.id;
        const now = Math.floor(Date.now() / 1e3);
        const DAY = 86400;
        const today = (0, import_ai_usage_repo.getAIUsageSummaryDB)(userId, now - DAY);
        const week = (0, import_ai_usage_repo.getAIUsageSummaryDB)(userId, now - 7 * DAY);
        const month = (0, import_ai_usage_repo.getAIUsageSummaryDB)(userId, now - 30 * DAY);
        const lifetime = (0, import_ai_usage_repo.getAIUsageSummaryDB)(userId, 0);
        const isOnline = agentStatus.status === "online";
        const isDegraded = agentStatus.status === "degraded";
        const embed = new import_discord.EmbedBuilder().setColor(EMBED_COLOR).setTitle(`${(0, import_emojis.emoji)("ash_online")} AshenAI Status`).setDescription("System overview and your AI usage statistics.").addFields(
          {
            name: `${(0, import_emojis.emoji)("ash_ai")} Discord`,
            value: `${statusDot(true)} Connected`,
            inline: true
          },
          {
            name: `${(0, import_emojis.emoji)("ash_ai")} AI Runtime`,
            value: `${statusDot(isOnline)} ${isOnline ? "Healthy" : isDegraded ? "Degraded" : "Offline"}`,
            inline: true
          },
          {
            name: `${(0, import_emojis.emoji)("ash_refresh")} Uptime`,
            value: formatUptime(uptimeSec),
            inline: true
          }
        ).addFields(
          {
            name: `${(0, import_emojis.emoji)("ash_memory")} Memory`,
            value: [
              `Conversations: ${stats.conversations}`,
              `Messages: ${stats.messages}`
            ].join("\n"),
            inline: true
          },
          {
            name: `${(0, import_emojis.emoji)("ash_stats")} Version`,
            value: process.env.npm_package_version || "1.0.0",
            inline: true
          }
        ).setFooter({ text: "AshenAI" }).setTimestamp();
        const usageLines = [];
        usageLines.push(`Today \u2014 ${today.requests} requests \xB7 ${formatTokens(today.totalTokens)} tokens`);
        usageLines.push(`This week \u2014 ${week.requests} requests \xB7 ${formatTokens(week.totalTokens)} tokens`);
        usageLines.push(`This month \u2014 ${month.requests} requests \xB7 ${formatTokens(month.totalTokens)} tokens`);
        usageLines.push(`All time \u2014 ${lifetime.requests} requests \xB7 ${formatTokens(lifetime.totalTokens)} tokens`);
        embed.addFields({
          name: `${(0, import_emojis.emoji)("ash_stats")} Your AI Usage`,
          value: usageLines.join("\n"),
          inline: false
        });
        await interaction.editReply({
          embeds: [embed]
        });
      } catch (error) {
        import_logger.logger.error(
          "/status failed:",
          error instanceof Error ? error.message : String(error)
        );
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: `${(0, import_emojis.emoji)("ash_error")} Status check failed. Please try again.`
            });
          } else {
            await interaction.reply({
              content: `${(0, import_emojis.emoji)("ash_error")} Status check failed.`,
              flags: import_discord.MessageFlags.Ephemeral
            });
          }
        } catch {
        }
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createStatusCommand
});
