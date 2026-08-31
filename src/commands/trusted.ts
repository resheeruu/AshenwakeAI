import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { AshenCommand } from "./definitions";
import { loadGuildAIConfig, saveGuildAIConfig, addTrustedUser, removeTrustedUser, getTrustedUsers } from "../ai/tools/channel-scope";
import { recordAudit } from "../security/audit";

export function createTrustedCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("trusted")
      .setDescription("Manage trusted users who can use server-management features")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("add")
          .setDescription("Add a trusted user")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to trust")
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("remove")
          .setDescription("Remove a trusted user")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to remove trust from")
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("list")
          .setDescription("List all trusted users")
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        const member = interaction.member;
        const guild = interaction.guild;

        if (!guild) {
          await interaction.editReply("❌ This command can only be used in a server.");
          return;
        }

        // Only server owner or admin can manage trusted users
        const isGuildOwner = member && typeof member !== "string"
          ? (member as any).id === guild.ownerId
          : false;

        const isAdmin = member && typeof member.permissions === "string"
          ? false
          : member && "permissions" in member
            ? (member.permissions as any).has?.(PermissionFlagsBits.Administrator) ?? false
            : false;

        if (!isGuildOwner && !isAdmin) {
          await interaction.editReply("❌ Only the server owner or administrators can manage trusted users.");
          return;
        }

        const subcommand = interaction.options.getSubcommand();
        const aiConfig = loadGuildAIConfig(guild.id);

        if (subcommand === "add") {
          const targetUser = interaction.options.getUser("user");
          if (!targetUser) {
            await interaction.editReply("❌ Please specify a user to trust.");
            return;
          }

          if (targetUser.bot) {
            await interaction.editReply("❌ Cannot trust a bot account.");
            return;
          }

          const added = addTrustedUser(aiConfig, targetUser.id);
          if (!added) {
            await interaction.editReply(`⚠️ <@${targetUser.id}> is already trusted.`);
            return;
          }

          saveGuildAIConfig(aiConfig);

          recordAudit({
            who: interaction.user.id,
            whoName: interaction.user.tag,
            what: `Added trusted user: ${targetUser.tag} (${targetUser.id})`,
            where: "trusted-command",
            guildId: guild.id,
            result: "success",
          });

          await interaction.editReply(`✅ <@${targetUser.id}> has been added as a trusted user. They can now use server-management features.`);

        } else if (subcommand === "remove") {
          const targetUser = interaction.options.getUser("user");
          if (!targetUser) {
            await interaction.editReply("❌ Please specify a user to remove trust from.");
            return;
          }

          const removed = removeTrustedUser(aiConfig, targetUser.id);
          if (!removed) {
            await interaction.editReply(`⚠️ <@${targetUser.id}> is not currently trusted.`);
            return;
          }

          saveGuildAIConfig(aiConfig);

          recordAudit({
            who: interaction.user.id,
            whoName: interaction.user.tag,
            what: `Removed trusted user: ${targetUser.tag} (${targetUser.id})`,
            where: "trusted-command",
            guildId: guild.id,
            result: "success",
          });

          await interaction.editReply(`✅ <@${targetUser.id}> has been removed from trusted users.`);

        } else if (subcommand === "list") {
          const trustedIds = getTrustedUsers(aiConfig);

          if (trustedIds.length === 0) {
            await interaction.editReply("📋 No trusted users configured.\n\nUse `/trusted add @user` to add a trusted user.");
            return;
          }

          const lines = ["📋 **Trusted Users**", ""];
          for (const id of trustedIds) {
            lines.push(`• <@${id}>`);
          }
          lines.push("", "Trusted users can use server-management features without being administrators.");

          await interaction.editReply(lines.join("\n"));
        }
      } catch (error) {
        console.error("❌ /trusted failed:", error);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply("❌ Failed to manage trusted users. Please try again.");
          }
        } catch (replyError) {
          console.error("❌ Could not edit /trusted response:", replyError);
        }
      }
    },
  };
}
