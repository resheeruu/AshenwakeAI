import { logger } from "../logger";
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { AIRouter } from "../ai/router";
import { ConversationMemory } from "../ai/memory";
import { UsageManager } from "../ai/usage-manager";
import { AshenCommand } from "./definitions";
import { config } from "../config/env";
import { createAIRequestService } from "../ai/request-service";
import { StageTimer } from "../ai/timing";

export function createAskCommand(
  router: AIRouter,
  memory: ConversationMemory,
  usageManager: UsageManager
): AshenCommand {
  const aiService = createAIRequestService({ router, memory, usageManager });

  return {
    data: new SlashCommandBuilder()
      .setName("ask")
      .setDescription("Ask AshenAI a question")
      .addStringOption((option) =>
        option
          .setName("question")
          .setDescription("Your question")
          .setRequired(true)
          .setMaxLength(4000)
      ),

    async execute(
      interaction: ChatInputCommandInteraction
    ): Promise<void> {
      const t = new StageTimer("/ask");
      const userId = interaction.user.id;
      const guildId = interaction.guildId || "";
      const prompt = interaction.options.getString("question", true).trim();

      t.mark("extract_args");

      const usageCheck = aiService.checkUsage(userId, guildId, "ask", prompt.length);
      t.mark("usage_check");

      if (!usageCheck.allowed) {
        const retrySeconds = usageCheck.retryAfterMs
          ? Math.max(1, Math.ceil(usageCheck.retryAfterMs / 1000))
          : 60;

        const reasonText: Record<string, string> = {
          cooldown: "You're on a brief cooldown.",
          daily_limit: "You've reached your daily AI limit.",
          monthly_limit: "You've reached your monthly AI limit.",
          rate_limit: "You're sending requests too quickly.",
          burst_limit: "Too many requests in a short time.",
          concurrent_limit: "Too many concurrent requests. Please wait.",
        };

        await interaction.editReply(
          `⏳ ${reasonText[usageCheck.reason || ""] || "Request limit reached."} Try again in ${retrySeconds}s.`
        );
        return;
      }

      try {
        if (!prompt) {
          await interaction.editReply("❌ Please provide a question.");
          return;
        }

        const creatorQuestion =
          /\b(who|what)\b.*\b(creator|created|made|owner)\b/i.test(prompt) ||
          /\bwho('?s| is)\b.*\b(owner|creator)\b/i.test(prompt);

        if (creatorQuestion) {
          const creatorId = config.creator.discord;
          await interaction.editReply(
            creatorId
              ? `👑 My creator is <@${creatorId}>.`
              : "👑 My creator is not configured yet."
          );
          return;
        }

        t.mark("pre_ai");

        const result = await aiService.processRequest({
          userId, guildId, channelId: interaction.channelId || "",
          prompt, source: "ask",
        });

        t.mark("ai_generate");

        if (result.boundaryMatched) {
          await interaction.editReply(result.text);
          return;
        }

        aiService.recordUsage({
          userId, guildId, feature: "ask",
          credits: usageCheck.credits,
          provider: result.provider, latencyMs: result.latencyMs, success: true,
        });
        t.mark("usage_record");

        await interaction.editReply(result.text);
        t.mark("discord_reply");

        aiService.flush();
        t.log();

        logger.debug(`✅ /ask response sent using ${result.provider} in ${result.latencyMs}ms`);
      } catch (error) {
        logger.error("❌ /ask failed:", error instanceof Error ? error.message : String(error));

        aiService.recordFailure({
          userId, guildId, feature: "ask", credits: usageCheck.credits,
        });

        try {
          if (interaction.isRepliable()) {
            await interaction.editReply("❌ I couldn't get a response right now. Please try again.");
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
