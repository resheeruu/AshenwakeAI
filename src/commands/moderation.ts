import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} from "discord.js";

import { AshenCommand } from "./definitions";
import { canModerate, canTarget } from "../discord/moderation";
import { openModPanel } from "../discord/panels/mod-panel";
import { logger } from "../logger";

export function createModerationCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Moderation Center — warn, timeout, warnings, and history")
    .setContexts(InteractionContextType.Guild)
    /*
     * Hide the command from members without ModerateMembers at the
     * Discord level. Server-side checks still run on every panel
     * action (open + execution) — hiding is never the only gate.
     */
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

  return {
    data,

    async execute(interaction: ChatInputCommandInteraction) {
      try {
        if (!interaction.guild || !interaction.member) {
          await interaction.editReply("❌ This command can only be used inside a server.");
          return;
        }

        /*
         * NO subcommands: the bare invocation opens the persistent
         * Moderation Center panel (src/discord/panels/mod-panel.ts),
         * which re-runs canModerate/canTarget (via
         * executeInteractiveModeration) on every action.
         */
        await openModPanel(interaction);
      } catch (error) {
        logger.error("❌ /mod failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply({ content: "❌ Failed to open the Moderation Center. Please try again." });
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

// Re-exported for tests and callers that verify the moderation
// authorization surface lives on the canonical command module.
export { canModerate, canTarget };
