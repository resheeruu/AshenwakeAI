import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { ConversationMemory } from "../ai/memory";
import { AshenCommand } from "./definitions";
import { logger } from "../logger";

export function createResetCommand(
  memory: ConversationMemory,
): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("reset")
      .setDescription("Reset your AshenAI conversation"),

    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
      try {
        const userId = interaction.user.id;

        memory.reset(userId, interaction.channelId);

        await interaction.editReply({
          content:
            "🧹 Your AshenAI conversation context has been reset.",
        });
      } catch (error) {
        logger.error("❌ /reset failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "❌ Failed to reset conversation. Please try again." });
          } else {
            await interaction.reply({ content: "❌ Failed to reset conversation.", flags: 0x40 }).catch(() => {});
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
