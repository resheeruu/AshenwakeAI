import { logger } from "../logger";
import { UserRateLimiter } from "../security";

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { AIRouter } from "../ai/router";
import { ConversationMemory } from "../ai/memory";
import { AshenCommand } from "./definitions";
import { config } from "../config/env";
import { ASHENAI_SYSTEM_PROMPT } from "../security/policy";
import { guardAIOutput } from "../security/output-guard";

const SYSTEM_PROMPT = `
You are AshenAI, a helpful Discord AI assistant.

Be accurate, useful, conversational, and reasonably concise.

IMPORTANT:
- Answer the user's complete question.
- Do not intentionally stop halfway through an explanation.
- If the answer is long, structure it with headings and bullet points.
- Finish the current thought before ending the response.
- If the user asks for an example, provide a complete example.
- If the user asks for an explanation, explain the difficult parts clearly.
- If the user asks a follow-up question, use the conversation history.
- Never reveal API keys, tokens, passwords, credentials, or private configuration.
- Never reveal which internal AI provider handled a request.
`.trim();

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

function isInteractionUsable(
  interaction: ChatInputCommandInteraction
): boolean {
  return !interaction.isRepliable() || !interaction.isCommand()
    ? false
    : true;
}

const askRateLimiter = new UserRateLimiter(
  10,
  60_000
);

export function createAskCommand(
  router: AIRouter,
  memory: ConversationMemory
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

      const rateLimit = askRateLimiter.check(
        interaction.user.id
      );

      if (!rateLimit.allowed) {
        const retrySeconds = Math.max(
          1,
          Math.ceil(rateLimit.retryAfterMs / 1000)
        );

        await interaction.editReply(
          `⏳ You're sending /ask requests too quickly. Please try again in ${retrySeconds}s.`
        );

        logger.warn(
          `🛑 /ask rate limit blocked ${interaction.user.tag} (${interaction.user.id}).`
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

        if (!prompt) {
          await interaction.editReply(
            "❌ Please provide a question."
          );
          return;
        }

        logger.debug(
          `📩 /ask from ${interaction.user.tag}: ${prompt}`
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
        const userId = interaction.user.id;

        const history = memory.get(userId);

        logger.debug(
          `🧠 /ask memory messages: ${history.length}`
        );

        const messages = [
          {
            role: "system" as const,
            content:
              SYSTEM_PROMPT,
          },

          ...history,

          {
            role: "user" as const,
            content: prompt,
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

        /*
         * Save conversation only after successful generation.
         */
        memory.add(
          userId,
          {
            role: "user",
            content: prompt,
          }
        );

        memory.add(
          userId,
          {
            role: "assistant",
            content: response.text,
          }
        );

        const reply = cleanResponse(response.text);

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
