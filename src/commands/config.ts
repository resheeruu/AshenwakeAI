import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import {
  config,
  configManager,
} from "../config/env";

import {
  messageRateLimiter,
} from "../security";

import { AshenCommand } from "./definitions";
import { recordAudit } from "../security/audit";
import { logger } from "../logger";

export function createConfigCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("config")
      .setDescription(
        "Manage safe AshenAI runtime configuration"
      )

      .addSubcommand((subcommand) =>
        subcommand
          .setName("status")
          .setDescription(
            "Show safe runtime configuration"
          )
      )

      .addSubcommand((subcommand) =>
        subcommand
          .setName("reload")
          .setDescription(
            "Reload safe runtime configuration"
          )
      )

      .addSubcommand((subcommand) =>
        subcommand
          .setName("ratelimit")
          .setDescription(
            "Show AshenAI rate-limit status"
          )
      )

      .addSubcommand((subcommand) =>
        subcommand
          .setName("resetuser")
          .setDescription(
            "Reset a user's message rate limit"
          )
          .addStringOption((option) =>
            option
              .setName("user_id")
              .setDescription(
                "Discord user ID to reset"
              )
              .setRequired(true)
          )
      ),

    async execute(
      interaction: ChatInputCommandInteraction
    ): Promise<void> {
      try {
        const creatorId = config.creator.discord?.trim();

      /*
       * /config is creator-only and fails closed.
       * Never allow configuration management when the creator
       * identity is missing or the requester is not the creator.
       */
      if (!creatorId || interaction.user.id !== creatorId) {
        await interaction.editReply(
          "❌ You are not authorized to manage AshenAI configuration."
        );
        return;
      }

      const action =
          interaction.options.getSubcommand();

        /*
         * -----------------------------------------
         * CONFIG RELOAD
         * -----------------------------------------
         */
        if (action === "reload") {
          const runtime =
            configManager.reload();

          await interaction.editReply(
            "♻️ **AshenAI configuration reloaded.**\n\n" +
            `⏱️ Timeout: ${runtime.ai.timeoutMs}ms\n` +
            `🔁 Max retries: ${runtime.ai.maxRetries}\n` +
            `🧠 Context messages: ${runtime.ai.maxContextMessages}\n` +
            `📝 Log level: ${runtime.logLevel}\n\n` +
            "🔐 Secrets remain hidden."
          );

          recordAudit({
            who: interaction.user.id,
            whoName: interaction.user.tag,
            what: "Reloaded AshenAI configuration",
            where: "discord",
            result: "success",
          });

          return;
        }

        /*
         * -----------------------------------------
         * CONFIG STATUS
         * -----------------------------------------
         */
        if (action === "status") {
          const runtime =
            configManager.get();

          const rateConfig =
            messageRateLimiter.getConfig();

          const trackedUsers =
            messageRateLimiter.getUserCount();

          await interaction.editReply(
            "⚙️ **AshenAI Runtime Configuration**\n\n" +
            `⏱️ Timeout: ${runtime.ai.timeoutMs}ms\n` +
            `🔁 Max retries: ${runtime.ai.maxRetries}\n` +
            `🧠 Context messages: ${runtime.ai.maxContextMessages}\n` +
            `📝 Log level: ${runtime.logLevel}\n\n` +
            "🛡️ **Security**\n" +
            `🚦 Rate limit: ${rateConfig.maxRequests} requests / ${rateConfig.windowSeconds}s\n` +
            `👥 Tracked users: ${trackedUsers}\n\n` +
            "🔐 API keys: hidden\n" +
            "🔐 Discord token: hidden"
          );

          return;
        }

        /*
         * -----------------------------------------
         * RATE LIMIT STATUS
         * -----------------------------------------
         */
        if (action === "ratelimit") {
          const rateConfig =
            messageRateLimiter.getConfig();

          const trackedUsers =
            messageRateLimiter.getUserCount();

          await interaction.editReply(
            "🛡️ **AshenAI Rate Limiter**\n\n" +
            `🚦 Limit: ${rateConfig.maxRequests} requests\n` +
            `⏱️ Window: ${rateConfig.windowSeconds} seconds\n` +
            `👥 Users currently tracked: ${trackedUsers}\n\n` +
            "✅ Rate limiting is active."
          );

          return;
        }

        /*
         * -----------------------------------------
         * RESET USER RATE LIMIT
         * -----------------------------------------
         */
        if (action === "resetuser") {
          const userId =
            interaction.options.getString(
              "user_id",
              true
            ).trim();

          if (!/^\d{17,20}$/.test(userId)) {
            await interaction.editReply(
              "❌ Invalid Discord user ID."
            );

            return;
          }

          messageRateLimiter.reset(
            userId
          );

          await interaction.editReply(
            "✅ **Rate limit reset.**\n\n" +
            `👤 User ID: \`${userId}\`\n` +
            "🚦 The user can make requests again."
          );

          logger.info(
            `🛡️ Rate limit reset by ${interaction.user.tag} for ${userId}.`
          );

          recordAudit({
            who: interaction.user.id,
            whoName: interaction.user.tag,
            what: `Reset rate limit for user ${userId}`,
            where: "discord",
            result: "success",
          });

          return;
        }

        await interaction.editReply(
          "❌ Unknown configuration action."
        );
      } catch (error) {
        logger.error(
          "❌ /config failed:",
          error instanceof Error ? error.message : String(error)
        );

        try {
          if (
            interaction.deferred ||
            interaction.replied
          ) {
            await interaction.editReply(
              "❌ Configuration operation failed. Please try again."
            );
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
