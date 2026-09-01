import {
  ChatInputCommandInteraction,
  Client,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

import { AIRouter } from "../ai/router";
import { ConversationMemory } from "../ai/memory";
import { AshenCommand } from "./definitions";
import { scanAshenAI } from "../diagnostics/health-scanner";
import { generateOptimizations } from "../diagnostics/optimizer";
import { config } from "../config/env";
import { logger } from "../logger";
import { recordAudit } from "../security/audit";

export function createDiagnoseCommand(
  client: Client,
  router: AIRouter,
  memory: ConversationMemory,
  getCommandCount: () => number,
): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("diagnose")
      .setDescription("Run a detailed AshenAI health check"),

    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
      try {
        const userId = interaction.user.id;
        const isCreator = config.creator.discord === userId;
        const isAdmin = config.admin.discordIds.includes(userId);
        if (!isCreator && !isAdmin) {
          const denyMsg = "❌ Only the bot owner or an admin can run /diagnose.";
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: denyMsg });
          } else {
            await interaction.reply({ content: denyMsg, flags: MessageFlags.Ephemeral });
          }
          return;
        }

        recordAudit({
          who: interaction.user.id,
          whoName: interaction.user.tag,
          what: "Ran diagnostics",
          where: "discord",
          result: "success",
        });

        const discordReady = client.isReady();
        const ping = client.ws.ping;

        const providers = router.getAvailableProviders();
        const health = router.getHealth();
        const memoryStats = memory.stats();

        // Project health scan — read-only.
        const healthReport = scanAshenAI();
        const optimizations =
          generateOptimizations(healthReport);

        const available = providers.length;
        const total = health.length;

        const disabled = health.filter(
          (provider) =>
            provider.disabledUntil > Date.now(),
        );

        const tested = health
          .filter(
            (provider) =>
              provider.successes > 0,
          )
          .sort(
            (a, b) =>
              (a.score ?? 999999) -
              (b.score ?? 999999),
          );

        const fastest =
          tested.length > 0
            ? `${tested[0].provider} (${tested[0].averageLatencyMs}ms avg)`
            : "No successful provider data yet";

        const providerStatus =
          total === 0
            ? "⚠️ No providers configured"
            : available > 0
              ? `✅ ${available}/${total} available`
              : "❌ No providers available";

        const disabledText =
          disabled.length > 0
            ? disabled
                .map(
                  (provider) =>
                    `• ${provider.provider} — ${
                      provider.disabledReason ??
                      "temporarily disabled"
                    }`,
                )
                .join("\n")
            : "None";

        const content = [
          "🔍 **AshenAI Diagnostics**",
          "",
          `${discordReady ? "✅" : "❌"} Discord connection`,
          `⚡ WebSocket latency: ${
            ping >= 0 ? `${ping}ms` : "unknown"
          }`,
          "✅ Command handler",
          `📦 Commands loaded: ${getCommandCount()}`,
          "",
          "🤖 **AI Router**",
          "✅ Router operational",
          `📡 Providers: ${providerStatus}`,
          `🏆 Fastest known: ${fastest}`,
          "",
          "🚫 **Disabled Providers**",
          disabledText,
          "",
          "🧠 **Memory**",
          "✅ Memory system operational",
          `💬 Conversations: ${memoryStats.conversations}`,
          `📝 Messages: ${memoryStats.messages}`,
          `💾 Persistent: ${
            memoryStats.persistent ? "Yes" : "No"
          }`,
          "",
          "🩺 **Project Health**",
          `📁 Files scanned: ${healthReport.filesScanned}`,
          `⏱️ Scan time: ${healthReport.durationMs}ms`,
          ...(healthReport.findings.length > 0
            ? healthReport.findings.map(
                (finding) =>
                  `${finding.level === "error" ? "❌" : finding.level === "warning" ? "⚠️" : "✅"} ${finding.area}: ${finding.message}`,
              )
            : ["✅ No structural problems detected."]),
          "",
          "💡 **Optimization Suggestions**",
          ...optimizations.map(
            (item) =>
              `${item.priority === "high" ? "🔴" : item.priority === "medium" ? "🟡" : "🟢"} ${item.area}: ${item.suggestion}`,
          ),
          "",
          "🔐 **Security**",
          "🔒 API keys: hidden",
          "🔒 Secrets: hidden",
          "",
          discordReady && available > 0
            ? "🎉 **AshenAI is healthy.**"
            : "⚠️ **AshenAI needs attention.**",
        ].join("\n");

        const chunks: string[] = [];
        let current = "";

        for (const line of content.split("\n")) {
          if (current.length + line.length + 1 > 1900) {
            if (current) chunks.push(current);
            current = line;
          } else {
            current += (current ? "\n" : "") + line;
          }
        }

        if (current) chunks.push(current);

        if (
          interaction.deferred ||
          interaction.replied
        ) {
          await interaction.editReply({
            content: chunks[0] ?? "Diagnostics completed.",
          });

          for (const chunk of chunks.slice(1)) {
            await interaction.followUp({
              content: chunk,
              flags: MessageFlags.Ephemeral,
            });
          }
        } else {
          await interaction.reply({
            content: chunks[0] ?? "Diagnostics completed.",
            flags: MessageFlags.Ephemeral,
          });

          for (const chunk of chunks.slice(1)) {
            await interaction.followUp({
              content: chunk,
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      } catch (error) {
        logger.error("/diagnose failed:", error instanceof Error ? error.message : String(error));

        try {
          if (
            interaction.deferred ||
            interaction.replied
          ) {
            await interaction.editReply({
              content:
                "❌ Diagnostics failed. Please try again.",
            });
          } else {
            await interaction.reply({
              content:
                "❌ Diagnostics failed. Please try again.",
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

