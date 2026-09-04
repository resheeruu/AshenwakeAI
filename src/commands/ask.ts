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
import { wrapUntrustedContent, stripSecurityLabels } from "../security/context";
import { StageTimer } from "../ai/timing";

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

      const usageCheck = usageManager.check(userId, guildId, "ask", prompt.length);
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
        // Boundary behavior — checkBoundary() already handles "I know", abuse, "fair enough"
        const boundary = checkBoundary(prompt);
        if (boundary.matched && boundary.response) {
          await interaction.editReply(boundary.response);
          return;
        }

        // Security boundary: inspect untrusted Discord input before AI processing.
        const security = inspectUserInput(prompt);
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

        // Creator question — fast regex, no AI needed
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

        t.mark("pre_ai");

        /*
         * Conversation memory — in-memory read, fast
         */
        const history = memory.get(userId, interaction.channelId);
        t.mark("memory_get");

        const messages = [
          {
            role: "system" as const,
            content: ASHENAI_SYSTEM_PROMPT,
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
        t.mark("build_messages");

        /*
         * Ask the smart AI router.
         */
        const response = await router.generate({
          messages,
          temperature: 0.7,
          maxTokens: 1200,
          guildId,
          userId,
          channelId: interaction.channelId || "",
          source: "ask",
        });
        t.mark("ai_generate");

        if (
          !response ||
          !response.text ||
          !response.text.trim()
        ) {
          throw new Error(
            "AI router returned an empty response."
          );
        }

        usageManager.recordDeferred({
          userId,
          guildId,
          feature: "ask",
          credits: usageCheck.credits,
          provider: response.provider,
          latencyMs: response.latencyMs,
          success: true,
        });
        t.mark("usage_record");

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

        const reply = cleanResponse(stripSecurityLabels(guarded.text));
        t.mark("guard_and_format");

        /*
         * Save conversation after successful generation.
         * Batch both writes into a single flush at the end.
         */
        memory.addBatch(
          userId,
          { role: "user", content: prompt },
          interaction.channelId
        );

        memory.addBatch(
          userId,
          { role: "assistant", content: guarded.text },
          interaction.channelId
        );
        t.mark("memory_save");

        await interaction.editReply(reply);
        t.mark("discord_reply");

        memory.flushBatch();
        usageManager.flush();
        t.log();

        logger.debug(
          `✅ /ask response sent using ${response.provider} in ${response.latencyMs}ms`
        );
      } catch (error) {
        logger.error(
          "❌ /ask failed:",
          error instanceof Error ? error.message : String(error)
        );

        usageManager.record({
          userId,
          guildId,
          feature: "ask",
          credits: usageCheck.credits,
          success: false,
        });

        try {
          if (interaction.isRepliable()) {
            await interaction.editReply(
              "❌ I couldn't get a response right now. Please try again."
            );
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
