import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { AshenCommand } from "./definitions";
import { loadGuildAIConfig } from "../ai/tools/channel-scope";
import { config } from "../config/env";
import { recordAudit } from "../security/audit";
import { logger } from "../logger";

/**
 * /send — Bot Messaging Command
 *
 * Only trusted users can use /send.
 * /send simply makes AshenAI send the supplied text as the bot.
 * It does NOT call the AI/router, enter /prompt, use builder mode,
 * or bypass security.
 */
export function createSendCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("send")
      .setDescription("Send a message as AshenAI")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("The message to send")
          .setRequired(true)
          .setMaxLength(2000)
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        const guild = interaction.guild;
        if (!guild) {
          await interaction.editReply("❌ This command can only be used in a server.");
          return;
        }

        const userId = interaction.user.id;
        const guildOwnerId = guild.ownerId;

        // Check authorization: trusted user, admin, or guild owner
        const aiConfig = loadGuildAIConfig(guild.id);
        const isTrusted = aiConfig.trustedUserIds?.includes(userId) || false;
        const isOwner = userId === guildOwnerId;
        const botOwnerIds = config.admin.discordIds;
        const isBotOwner = botOwnerIds.includes(userId);

        if (!isTrusted && !isOwner && !isBotOwner) {
          await interaction.editReply("❌ You don't have permission to use `/send`.");
          return;
        }

        const message = interaction.options.getString("message", true);

        // Send the message as the bot
        if (interaction.channel && interaction.channel.isSendable()) {
          await interaction.channel.send(message);
        }

        // Acknowledge to the user (ephemeral)
        await interaction.editReply("✅ Message sent.");

        recordAudit({
          who: userId,
          whoName: interaction.user.tag,
          what: `Sent message via /send: ${message.slice(0, 100)}`,
          where: "send-command",
          guildId: guild.id,
          result: "success",
        });
      } catch (error) {
        logger.error("❌ /send failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply("❌ Failed to send message. Please try again.");
          } else {
            await interaction.reply({
              content: "❌ Failed to send message. Please try again.",
              flags: MessageFlags.Ephemeral,
            }).catch(() => {});
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
