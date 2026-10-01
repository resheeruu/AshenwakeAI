import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
} from "discord.js";
import { AshenCommand } from "./definitions";
import { openSupportPanel } from "../discord/panels/support-panel";
import { logger } from "../logger";

export function createSupportCommand(): AshenCommand {
  return {
    /*
     * NO subcommands: Discord makes a command WITH subcommands
     * impossible to invoke bare, and the bare invocation is what
     * opens the persistent Support Center panel. Ticket/report/
     * appeal/case flows moved to panel components (buttons, selects,
     * modals) in src/discord/panels/support-panel.ts.
     */
    data: new SlashCommandBuilder()
      .setName("support")
      .setDescription("Support Center — tickets, reports, appeals, and case management")
      .setContexts(InteractionContextType.Guild),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        await openSupportPanel(interaction);
      } catch (error) {
        logger.error("❌ /support failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply("❌ Failed to open the Support Center. Please try again.");
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
