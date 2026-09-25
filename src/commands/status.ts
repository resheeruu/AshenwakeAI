import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";

import { AIRouter } from "../ai/router";
import { ConversationMemory } from "../ai/memory";
import { AshenCommand } from "./definitions";
import { AgentManager } from "../agent/manager";
import { getAIUsageSummaryDB } from "../database/ai-usage-repo";
import { getDiscordHealth } from "../core/discord-health";
import { logger } from "../logger";
import { emoji } from "../discord/emojis";

const EMBED_COLOR = 0x2c2f33;

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function statusDot(online: boolean): string {
  return online ? `${emoji("ash_online")}` : `${emoji("ash_offline")}`;
}

/**
 * Real gateway state from the discord-health observer — never a
 * hardcoded "Connected". Uninitialized health (no client) reports
 * as not connected rather than pretending everything is fine.
 */
export function formatDiscordHealthField(): string {
  const health = getDiscordHealth();
  if (!health.ready) {
    const reason = health.lastDisconnectReason
      ? ` (${health.lastDisconnectReason})`
      : "";
    return `${statusDot(false)} Not connected${reason}`;
  }
  const lines: string[] = [`${statusDot(true)} Connected`];
  lines.push(
    `Latency: ${health.gatewayLatency >= 0 ? `${Math.round(health.gatewayLatency)}ms` : "n/a"}`,
  );
  lines.push(`Gateway uptime: ${formatUptime(Math.floor(health.uptime / 1000))}`);
  if (health.shardCount > 0) {
    lines.push(`Shards: ${health.shardCount}`);
  }
  if (health.reconnectCount > 0) {
    lines.push(`Reconnects: ${health.reconnectCount}`);
  }
  return lines.join("\n");
}

export function createStatusCommand(
  _router: AIRouter,
  memory: ConversationMemory,
  agentManager?: AgentManager,
): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("status")
      .setDescription("Show AshenAI health and your AI usage"),

    async execute(
      interaction: ChatInputCommandInteraction
    ): Promise<void> {
      try {
        const agentStatus =
          agentManager?.getStatus() ?? { status: "offline" };
        const stats = memory.stats();
        const uptimeSec = Math.floor(process.uptime());

        const userId = interaction.user.id;
        const now = Math.floor(Date.now() / 1000);
        const DAY = 86400;

        const today = getAIUsageSummaryDB(userId, now - DAY);
        const week = getAIUsageSummaryDB(userId, now - 7 * DAY);
        const month = getAIUsageSummaryDB(userId, now - 30 * DAY);
        const lifetime = getAIUsageSummaryDB(userId, 0);

        const isOnline = agentStatus.status === "online";
        const isDegraded = agentStatus.status === "degraded";

        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle(`${emoji("ash_online")} AshenAI Status`)
          .setDescription("System overview and your AI usage statistics.")
          .addFields(
            {
              name: `${emoji("ash_ai")} Discord`,
              value: formatDiscordHealthField(),
              inline: true,
            },
            {
              name: `${emoji("ash_ai")} AI Runtime`,
              value: `${statusDot(isOnline)} ${isOnline ? "Healthy" : isDegraded ? "Degraded" : "Offline"}`,
              inline: true,
            },
            {
              name: `${emoji("ash_refresh")} Uptime`,
              value: formatUptime(uptimeSec),
              inline: true,
            }
          )
          .addFields(
            {
              name: `${emoji("ash_memory")} Memory`,
              value: [
                `Conversations: ${stats.conversations}`,
                `Messages: ${stats.messages}`,
              ].join("\n"),
              inline: true,
            },
            {
              name: `${emoji("ash_stats")} Version`,
              value: process.env.npm_package_version || "1.0.0",
              inline: true,
            }
          )
          .setFooter({ text: "AshenAI" })
          .setTimestamp();

        const usageLines: string[] = [];
        usageLines.push(`Today — ${today.requests} requests · ${formatTokens(today.totalTokens)} tokens`);
        usageLines.push(`This week — ${week.requests} requests · ${formatTokens(week.totalTokens)} tokens`);
        usageLines.push(`This month — ${month.requests} requests · ${formatTokens(month.totalTokens)} tokens`);
        usageLines.push(`All time — ${lifetime.requests} requests · ${formatTokens(lifetime.totalTokens)} tokens`);

        embed.addFields({
          name: `${emoji("ash_stats")} Your AI Usage`,
          value: usageLines.join("\n"),
          inline: false,
        });

        await interaction.editReply({
          embeds: [embed],
        });
      } catch (error) {
        logger.error(
          "/status failed:",
          error instanceof Error ? error.message : String(error)
        );
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: `${emoji("ash_error")} Status check failed. Please try again.`,
            });
          } else {
            await interaction.reply({
              content: `${emoji("ash_error")} Status check failed.`,
              flags: MessageFlags.Ephemeral,
            });
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
