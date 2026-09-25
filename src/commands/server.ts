import {
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
  InteractionContextType,
} from "discord.js";

import {
  getMemberSummary,
  getServerSummary,
} from "../discord/server-actions";

import { AshenCommand } from "./definitions";
import { logger } from "../logger";

export function createServerCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("server")
    .setDescription("Server information and member utilities")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("Show information about this Discord server")
    )
    .addSubcommand((sub) =>
      sub
        .setName("user")
        .setDescription("Show information about a server member")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The member to inspect")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("roles")
        .setDescription("Show the roles of a server member")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The member whose roles you want to see")
            .setRequired(true)
        )
    );

  return {
    data,
    async execute(interaction: ChatInputCommandInteraction) {
      try {
        if (!interaction.guild) {
          await interaction.editReply(
            "❌ This command can only be used inside a server."
          );
          return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "info") {
          await interaction.editReply(
            `🏠 **Server Information**\n${getServerSummary(
              interaction.guild
            )}`
          );
          return;
        }

        if (subcommand === "user") {
          const user = interaction.options.getUser("user", true);

          let member: GuildMember | null;

          try {
            member = await interaction.guild.members.fetch(user.id);
          } catch {
            member = null;
          }

          if (!member) {
            await interaction.editReply(
              "❌ I couldn't find that member in this server."
            );
            return;
          }

          await interaction.editReply(
            `👤 **User Information**\n${getMemberSummary(member)}`
          );
          return;
        }

        if (subcommand === "roles") {
          const user = interaction.options.getUser("user", true);

          let member: GuildMember | null;

          try {
            member = await interaction.guild.members.fetch(user.id);
          } catch {
            member = null;
          }

          if (!member) {
            await interaction.editReply(
              "❌ I couldn't find that member in this server."
            );
            return;
          }

          const roles = member.roles.cache
            .filter((role) => role.id !== interaction.guild!.id)
            .map((role) => role.name);

          await interaction.editReply(
            `🎭 **${member.user.tag}'s roles**\n${
              roles.length ? roles.join(", ") : "No roles"
            }`
          );
          return;
        }
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
