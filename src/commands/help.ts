import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { AshenCommand } from "./definitions";

export function createHelpCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show AshenAI commands"),

    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
      await interaction.editReply({
        content: [
          "🔥 **AshenAI Commands**",
          "",
          "`/ask` — Ask AshenAI a question",
          "`/reset` — Reset your conversation",
          "`/help` — Show this help message",
          "`/status` — Show system status",
          "`/config` — Show configuration",
          "`/diagnose` — Run diagnostics",
        ].join("\n"),
      });
    },
  };
}
