import { logger } from "../logger";
import {
  inspectUserInput,
} from "../security";
import { checkBoundary } from "../security/boundary";

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { AIRouter } from "../ai/router";
import { ConversationMemory } from "../ai/memory";
import { UsageManager } from "../ai/usage-manager";
import { AshenCommand } from "./definitions";
import { config } from "../config/env";
import { ASHENAI_SYSTEM_PROMPT } from "../security/policy";
import { guardAIOutput } from "../security/output-guard";
import { wrapUntrustedContent } from "../security/context";

const MAX_DISCORD_LENGTH = 1900;

function cleanResponse(text: string): string {
  const cleaned = text.trim();

  if (!cleaned) {
    return "I wasn't able to generate a response.";
  }

  if (cleaned.length <= MAX_DISCORD_LENGTH) {
    return cleaned;
  }

  return cleaned.slice(0, MAX_DISCORD_LENGTH - 20).trimEnd() +
    "\n\n…(response shortened)";
}

export function createAskCommand(
  router: AIRouter,
  memory: ConversationMemory,
  usageManager: UsageManager
): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("ask")
      .setDescription("Ask AshenAI a question")
      .addStringOption((option) =>
        option
          .setName("prompt")
          .setDescription("Your question")
          .setRequired(true)
          .setMaxLength(4000)
      ),

    async execute(
      interaction: ChatInputCommandInteraction
    ): Promise<void> {

      const userId = interaction.user.id;
      const guildId = interaction.guildId || "";
      const prompt = interaction.options.getString("prompt", true).trim();

      const usageCheck = usageManager.check(userId, guildId, "ask", prompt.length);

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

      /*
       * Discord interactions must be acknowledged quickly.
       * Do this BEFORE any AI work.
       */
      try {
        if (!interaction.isRepliable()) {
          console.error("❌ /ask interaction is no longer repliable.");
          return;
        }

      } catch (error) {
        console.error(
          "❌ Could not acknowledge /ask interaction:",
          error
        );

        console.error(
          "⚠️ The Discord interaction probably expired before AshenAI acknowledged it."
        );

        return;
      }

      try {
        const prompt = interaction.options.getString(
          "prompt",
          true
        ).trim();

        // Boundary behavior (single source, no duplication)
        const boundary = checkBoundary(prompt);
        if (boundary.matched && boundary.response) {
          await interaction.editReply(boundary.response);
          return;
        }

        // Security boundary: inspect untrusted Discord input before AI processing.
        const security = inspectUserInput(prompt);

        // Boundary behavior: calmly handle excessive patterns
        const lower = prompt.toLowerCase().trim();

        // "I know" detection
        if (/^\s*i\s+know\s*$/.test(lower)) {
          await interaction.editReply("I know what? Tell me.");
          return;
        }

        // Abuse boundary: calm refusal + redirect
        if (/\b(useless|stupid|dumb|idiot|garbage|trash)\b/.test(lower)) {
          await interaction.editReply(
            "I'm here to help. If something wasn't clear, tell me what confused you and I'll re-explain."
          );
          return;
        }

        // "Fair enough" reciprocation (playful)
        if (/\bfair enough\b/.test(lower)) {
          await interaction.editReply("Glad we're on the same page. What's on your mind?");
          return;
        }

        if (security.decision === "BLOCK") {
          await interaction.editReply(
            security.safeResponse ||
              "I can't process that request."
          );
          return;
        }

        if (!prompt) {
          await interaction.editReply(
            "❌ Please provide a question."
          );
          return;
        }

        logger.debug(
          `📩 /ask: userId=${userId} guildId=${guildId} promptLength=${prompt.length}`
        );

        /*
         * Creator question
         */
        const creatorQuestion =
          /\b(who|what)\b.*\b(creator|created|made|owner)\b/i.test(
            prompt
          ) ||
          /\bwho('?s| is)\b.*\b(owner|creator)\b/i.test(
            prompt
          );

        if (creatorQuestion) {
          const creatorId = config.creator.discord;

          await interaction.editReply(
            creatorId
              ? `👑 My creator is <@${creatorId}>.`
              : "👑 My creator is not configured yet."
          );

          return;
        }

        /*
         * Conversation memory
         */

        const history = memory.get(userId, interaction.channelId);

        logger.debug(
          `🧠 /ask memory messages: ${history.length}`
        );

        const messages = [
          {
            role: "system" as const,
            content:
              ASHENAI_SYSTEM_PROMPT,
          },

          ...history.map((entry) => ({
            ...entry,
            content: wrapUntrustedContent(
              "CONVERSATION HISTORY",
              entry.content
            ),
          })),

          {
            role: "user" as const,
            content: wrapUntrustedContent(
              "USER PROMPT",
              prompt
            ),
          },
        ];

        logger.debug(
          `🧠 /ask context messages: ${messages.length}`
        );

        /*
         * Ask the smart AI router.
         *
         * The router handles:
         * - provider ranking
         * - provider failures
         * - rate limits
         * - credit/billing failures
         * - provider switching
         * - timeout handling
         */
        logger.debug(
          "🤖 /ask sending request to AI router..."
        );

        const response = await router.generate({
          messages,
          temperature: 0.7,
          maxTokens: 1200,
        });

        if (
          !response ||
          !response.text ||
          !response.text.trim()
        ) {
          throw new Error(
            "AI router returned an empty response."
          );
        }

        usageManager.record({
          userId,
          guildId,
          feature: "ask",
          credits: usageCheck.credits,
          provider: response.provider,
          latencyMs: response.latencyMs,
          success: true,
        });

        /*
         * Final application-level security check.
         * Never send raw AI output directly to Discord.
         */
        const guarded = guardAIOutput(response.text);

        if (!guarded.allowed) {
          logger.warn(
            `🛡️ /ask output blocked: ${guarded.reason ?? "security_policy"}`
          );
        }

        const reply = cleanResponse(guarded.text);

        /*
         * Save conversation only after successful generation
         * and after output has passed the application security guard.
         */
        memory.add(
          userId,
          {
            role: "user",
            content: prompt,
          },
          interaction.channelId
        );

        memory.add(
          userId,
          {
            role: "assistant",
            content: guarded.text,
          },
          interaction.channelId
        );

        /*
         * Interaction was already deferred, so editReply()
         * is safe as long as the interaction remains valid.
         */
        await interaction.editReply(reply);

        logger.debug(
          `✅ /ask response sent using ${response.provider} in ${response.latencyMs}ms`
        );
      } catch (error) {
        console.error(
          "❌ /ask failed:",
          error
        );

        usageManager.record({
          userId,
          guildId,
          feature: "ask",
          credits: usageCheck.credits,
          success: false,
        });

        /*
         * The interaction may have expired while the AI router
         * was working. Never attempt another interaction
         * response blindly.
         */
        try {
          if (interaction.isRepliable()) {
            await interaction.editReply(
              "❌ I couldn't get a response right now. Please try again."
            );
          }
        } catch (replyError) {
          console.error(
            "❌ Could not send /ask error response:",
            replyError
          );
        }
      }
    },
  };
}
