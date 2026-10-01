import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
} from "discord.js";

import { AshenCommand } from "./definitions";
import { logger } from "../logger";
import { openServerPanel } from "../discord/panels/server-panel";

export function createServerCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("server")
    .setDescription("Open the Server Center panel")
    .setContexts(InteractionContextType.Guild);

  return {
    data,
    async execute(interaction: ChatInputCommandInteraction) {
      try {
        if (!interaction.guild) {
          await interaction.editReply("❌ This command can only be used in a server.");
          return;
        }

        await openServerPanel(interaction);
      } catch (error) {
        logger.error("❌ /server failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "❌ Failed to process server command. Please try again." });
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
