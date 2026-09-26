import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  InteractionContextType,
} from "discord.js";
import { AshenCommand } from "./definitions";
import { config } from "../config/env";
import { loadGuildAIConfig, getTrustedUsers } from "../ai/tools/channel-scope";
import { recordAudit } from "../security/audit";
import { logger } from "../logger";

function canSend(
  userId: string,
  guildOwnerId: string,
  adminIds: string[],
  trustedIds: string[],
): boolean {
  return userId === guildOwnerId || adminIds.includes(userId) || trustedIds.includes(userId);
}

export function createSendCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("send")
      .setDescription("Send a message as AshenAI (trusted users, owners)")
      .setContexts(InteractionContextType.Guild)
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("The message to send")
          .setRequired(true)
          .setMaxLength(2000)
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        if (!interaction.guild || !interaction.member) {
          await interaction.editReply("❌ This command can only be used in a server.");
          return;
        }

        const message = interaction.options.getString("message", true);
        const guild = interaction.guild;
        const userId = interaction.user.id;

        const isGuildOwner = guild.ownerId === userId;
        const isAdmin = config.admin.discordIds.includes(userId);
        const aiConfig = loadGuildAIConfig(guild.id);
        const trustedIds = getTrustedUsers(aiConfig);

        if (!canSend(userId, guild.ownerId, config.admin.discordIds, trustedIds)) {
          await interaction.editReply("❌ You don't have permission to use `/send`.");
          return;
        }

        if (interaction.channel && interaction.channel.isSendable()) {
          await interaction.channel.send(message);
        } else {
          await interaction.editReply("❌ Cannot send message to this channel.");
          return;
        }

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
        logger.error(
          "❌ /send failed:",
          error instanceof Error ? error.message : String(error)
        );
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(
              "❌ Failed to process send command. Please try again."
            );
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}