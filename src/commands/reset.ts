import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { ConversationMemory } from "../ai/memory";
import { AshenCommand } from "./definitions";

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
      const userId = interaction.user.id;

      memory.reset(userId);

      await interaction.editReply({
        content:
          "🧹 Your AshenAI conversation context has been reset.",
      });
    },
  };
}
