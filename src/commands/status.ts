import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

import { AIRouter } from "../ai/router";
import { ConversationMemory } from "../ai/memory";
import { AshenCommand } from "./definitions";
import { AgentManager } from "../agent/manager";
import { logger } from "../logger";

export function createStatusCommand(
  router: AIRouter,
  memory: ConversationMemory,
  agentManager?: AgentManager,
): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("status")
      .setDescription(
        "Show AshenAI system status and provider performance"
      ),

    async execute(
      interaction: ChatInputCommandInteraction
    ): Promise<void> {
      try {
      const providers = router.getAvailableProviders();
      const health = router.getHealth();
      const stats = memory.stats();
      const agentStatus = agentManager?.getStatus() ?? { status: "offline" };

      const tested = health
        .filter(
          (provider) =>
            provider.successes > 0
        )
        .sort(
          (a, b) =>
            (a.score ?? 999999) -
            (b.score ?? 999999)
        );

      const untested = health.filter(
        (provider) =>
          provider.successes === 0
      );

      const totalSuccesses = health.reduce(
        (total, provider) =>
          total + provider.successes,
        0
      );

      const totalFailures = health.reduce(
        (total, provider) =>
          total + provider.failures,
        0
      );

      const totalRequests =
        totalSuccesses + totalFailures;

      const overallSuccessRate =
        totalRequests > 0
          ? Math.round(
              (totalSuccesses /
                totalRequests) *
                100
            )
          : null;

      const cooldownProviders = health.filter(
        (provider) =>
          provider.cooldownUntil > Date.now()
      );

      const disabledProviders = health.filter(
        (provider) =>
          provider.disabledUntil > Date.now()
      );

      const ranking =
        tested.length > 0
          ? tested
              .slice(0, 5)
              .map((provider, index) => {
                const medal =
                  index === 0
                    ? "🥇"
                    : index === 1
                    ? "🥈"
                    : index === 2
                    ? "🥉"
                    : "▫️";

                const latency =
                  provider.averageLatencyMs !== null
                    ? `${provider.averageLatencyMs}ms`
                    : "N/A";

                const successRate =
                  provider.successRate !== null
                    ? `${provider.successRate}%`
                    : "N/A";

                const lastLatency =
                  provider.lastLatencyMs !== null
                    ? `${provider.lastLatencyMs}ms`
                    : "N/A";

                return (
                  `${medal} **${provider.provider}** — ` +
                  `${latency} avg · ` +
                  `${successRate} success · ` +
                  `${provider.successes} success · ` +
                  `${provider.failures} failed · ` +
                  `last ${lastLatency}`
                );
              })
              .join("\n")
          : "No providers have successful requests yet.";

      const untestedText =
        untested.length > 0
          ? untested
              .map(
                (provider) =>
                  `• ${provider.provider}`
              )
              .join("\n")
          : "None";

      const unavailable =
        health
          .filter(
            (provider) =>
              !provider.available
          )
          .map(
            (provider) =>
              `• ${provider.provider}`
          )
          .join("\n");

      const unavailableText =
        unavailable || "None";

      const cooldownText =
        cooldownProviders.length > 0
          ? cooldownProviders
              .map(
                (provider) => {
                  const seconds = Math.max(
                    1,
                    Math.ceil(
                      (provider.cooldownUntil -
                        Date.now()) /
                        1000
                    )
                  );

                  return (
                    `• ${provider.provider} — ` +
                    `${seconds}s remaining`
                  );
                }
              )
              .join("\n")
          : "None";

      const disabledText =
        disabledProviders.length > 0
          ? disabledProviders
              .map(
                (provider) => {
                  const seconds = Math.max(
                    1,
                    Math.ceil(
                      (provider.disabledUntil -
                        Date.now()) /
                        1000
                    )
                  );

                  const reason =
                    provider.disabledReason ||
                    "temporary disable";

                  return (
                    `• ${provider.provider} — ` +
                    `${seconds}s · ${reason}`
                  );
                }
              )
              .join("\n")
          : "None";

      const content = [
        "🟢 **AshenAI Status**",
        "",
        "🤖 **Bot:** Online",
        `🧠 **AI Agent:** ${agentStatus.status === "online" ? "Online" : agentStatus.status}`,
        "⚡ **System:** Operational",
        "💬 **Reply System:** Online",
        `🧠 **Available Providers:** ${providers.length}/${health.length}`,
        `🧠 **Conversations:** ${stats.conversations}`,
        `📝 **Messages:** ${stats.messages}`,
        "",
        "📊 **Router Statistics**",
        `✅ Successful requests: ${totalSuccesses}`,
        `❌ Failed requests: ${totalFailures}`,
        `📈 Overall success rate: ${
          overallSuccessRate !== null
            ? `${overallSuccessRate}%`
            : "N/A"
        }`,
        "",
        "🏆 **Provider Ranking**",
        ranking,
        "",
        "🆕 **Untested Providers**",
        untestedText,
        "",
        "⏳ **Providers On Cooldown**",
        cooldownText,
        "",
        "🚫 **Disabled Providers**",
        disabledText,
        "",
        "⚠️ **Unavailable Providers**",
        unavailableText,
        "",
        "💾 **Provider Memory:** Persistent",
        "🔄 **Fallback:** Automatic",
        "⚡ **Smart Routing:** Enabled",
        "🛡️ **Provider Attempt Limit:** 6",
      ].join("\n");

      /*
       * CommandHandler already acknowledged this interaction
       * with deferReply(), so edit the deferred reply.
       */
      await interaction.editReply({
        content,
      });
      } catch (error) {
        logger.error("/status failed:", error);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "❌ Status check failed. Check the logs." });
          } else {
            await interaction.reply({ content: "❌ Status check failed.", flags: MessageFlags.Ephemeral });
          }
        } catch (replyError) {
          logger.error("Could not send status result:", replyError);
        }
      }
    },
  };
}
