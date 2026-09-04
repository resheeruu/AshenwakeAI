import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

import { AIRouter } from "../ai/router";
import { ConversationMemory } from "../ai/memory";
import { AshenCommand } from "./definitions";
import { AgentManager } from "../agent/manager";
import { getAIUsageSummaryDB } from "../database/ai-usage-repo";
import { logger } from "../logger";

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

export function createStatusCommand(
  _router: AIRouter,
  memory: ConversationMemory,
  agentManager?: AgentManager,
): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("status")
      .setDescription(
        "Show AshenAI health and your AI usage"
      ),

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

        const agentLabel =
          agentStatus.status === "online"
            ? "Online"
            : agentStatus.status === "starting"
              ? "Starting"
              : agentStatus.status === "degraded"
                ? "Degraded"
                : "Offline";

        const agentEmoji =
          agentStatus.status === "online"
            ? "🟢"
            : agentStatus.status === "degraded"
              ? "🟡"
              : "🔴";

        const lines = [
          "🟢 **AshenAI Status**",
          "",
          `🤖 **Bot:** Online`,
          `${agentEmoji} **Agent:** ${agentLabel}`,
          "⚡ **System:** Operational",
          `⏱️ **Uptime:** ${formatUptime(uptimeSec)}`,
          "",
          "🧠 **Memory**",
          `Conversations: ${stats.conversations}`,
          `Messages: ${stats.messages}`,
          "",
          "📊 **Your AI Usage**",
          `Today — ${today.requests} requests · ${formatTokens(today.totalTokens)} tokens`,
          `This week — ${week.requests} requests · ${formatTokens(week.totalTokens)} tokens`,
          `This month — ${month.requests} requests · ${formatTokens(month.totalTokens)} tokens`,
          `All time — ${lifetime.requests} requests · ${formatTokens(lifetime.totalTokens)} tokens`,
        ];

        await interaction.editReply({
          content: lines.join("\n"),
        });
      } catch (error) {
        logger.error(
          "/status failed:",
          error instanceof Error ? error.message : String(error)
        );
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: "❌ Status check failed. Please try again.",
            });
          } else {
            await interaction.reply({
              content: "❌ Status check failed.",
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
