import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  InteractionContextType,
} from "discord.js";
import { AshenCommand } from "./definitions";
import {
  loadGuildAIConfig,
  saveGuildAIConfig,
  addTrustedUser,
  removeTrustedUser,
  getTrustedUsers,
} from "../ai/tools/channel-scope";
import { config } from "../config/env";
import { recordAudit } from "../security/audit";
import { logger } from "../logger";

export function createAccessCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("access")
      .setDescription("Manage trusted users and send messages as AshenAI")
      .setContexts(InteractionContextType.Guild)
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a trusted user")
          .addUserOption((opt) =>
            opt
              .setName("user")
              .setDescription("The user to trust")
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a trusted user")
          .addUserOption((opt) =>
            opt
              .setName("user")
              .setDescription("The user to remove trust from")
              .setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("List all trusted users")
      )
      .addSubcommand((sub) =>
        sub
          .setName("send")
          .setDescription("Send a message as AshenAI")
          .addStringOption((opt) =>
            opt
              .setName("message")
              .setDescription("The message to send")
              .setRequired(true)
              .setMaxLength(2000)
          )
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        if (!interaction.guild) {
          await interaction.editReply("❌ This command can only be used in a server.");
          return;
        }

        const subcommand = interaction.options.getSubcommand();
        const member = interaction.member;
        const guild = interaction.guild;

        const isGuildOwner =
          member && typeof member !== "string"
            ? (member as any).id === guild.ownerId
            : false;

        const isAdmin =
          member && typeof member.permissions === "string"
            ? false
            : member && "permissions" in member
              ? (member.permissions as any).has?.(PermissionFlagsBits.Administrator) ?? false
              : false;

        const aiConfig = loadGuildAIConfig(guild.id);
        const isTrusted =
          aiConfig.trustedUserIds?.includes(interaction.user.id) || false;

        if (subcommand === "add" || subcommand === "remove") {
          if (!isGuildOwner && !isAdmin) {
            await interaction.editReply(
              "❌ Only the server owner or administrators can manage trusted users."
            );
            return;
          }
        }

        if (subcommand === "send") {
          const isBotOwner = config.admin.discordIds.includes(interaction.user.id);
          if (!isTrusted && !isGuildOwner && !isBotOwner) {
            await interaction.editReply("❌ You don't have permission to use `/access send`.");
            return;
          }
        }

        if (subcommand === "add") {
          const targetUser = interaction.options.getUser("user", true);

          if (targetUser.bot) {
            await interaction.editReply("❌ Cannot trust a bot account.");
            return;
          }

          const added = addTrustedUser(aiConfig, targetUser.id);
          if (!added) {
            await interaction.editReply(
              `⚠️ <@${targetUser.id}> is already trusted.`
            );
            return;
          }

          saveGuildAIConfig(aiConfig);

          recordAudit({
            who: interaction.user.id,
            whoName: interaction.user.tag,
            what: `Added trusted user: ${targetUser.tag} (${targetUser.id})`,
            where: "access-command",
            guildId: guild.id,
            result: "success",
          });

          await interaction.editReply(
            `✅ <@${targetUser.id}> has been added as a trusted user. They can now use server-management features.`
          );
          return;
        }

        if (subcommand === "remove") {
          const targetUser = interaction.options.getUser("user", true);

          const removed = removeTrustedUser(aiConfig, targetUser.id);
          if (!removed) {
            await interaction.editReply(
              `⚠️ <@${targetUser.id}> is not currently trusted.`
            );
            return;
          }

          saveGuildAIConfig(aiConfig);

          recordAudit({
            who: interaction.user.id,
            whoName: interaction.user.tag,
            what: `Removed trusted user: ${targetUser.tag} (${targetUser.id})`,
            where: "access-command",
            guildId: guild.id,
            result: "success",
          });

          await interaction.editReply(
            `✅ <@${targetUser.id}> has been removed from trusted users.`
          );
          return;
        }

        if (subcommand === "list") {
          const trustedIds = getTrustedUsers(aiConfig);

          if (trustedIds.length === 0) {
            await interaction.editReply(
              "📋 No trusted users configured.\n\nUse `/access add @user` to add a trusted user."
            );
            return;
          }

          const lines = ["📋 **Trusted Users**", ""];
          for (const id of trustedIds) {
            lines.push(`• <@${id}>`);
          }
          lines.push(
            "",
            "Trusted users can use server-management features without being administrators."
          );

          await interaction.editReply(lines.join("\n"));
          return;
        }

        if (subcommand === "send") {
          const message = interaction.options.getString("message", true);

          if (interaction.channel && interaction.channel.isSendable()) {
            await interaction.channel.send(message);
          }

          await interaction.editReply("✅ Message sent.");

          recordAudit({
            who: interaction.user.id,
            whoName: interaction.user.tag,
            what: `Sent message via /access send: ${message.slice(0, 100)}`,
            where: "access-command",
            guildId: guild.id,
            result: "success",
          });
          return;
        }
      } catch (error) {
        logger.error("❌ /access failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(
              "❌ Failed to process access command. Please try again."
            );
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
