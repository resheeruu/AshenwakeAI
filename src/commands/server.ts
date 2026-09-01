import {
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
} from "discord.js";

import {
  getMemberSummary,
  getServerSummary,
} from "../discord/server-actions";

import { AshenCommand } from "./definitions";
import { logger } from "../logger";

export function createServerCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show information about this Discord server.");

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

        await interaction.editReply(
          `🏠 **Server Information**\n${getServerSummary(
            interaction.guild
          )}`
        );
      } catch (error) {
        logger.error("❌ /serverinfo failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "❌ Failed to get server info. Please try again." });
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

export function createUserInfoCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show information about a server member.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The member to inspect.")
        .setRequired(true)
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
      } catch (error) {
        logger.error("❌ /userinfo failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "❌ Failed to get user info. Please try again." });
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

export function createRolesCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Show the roles of a server member.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The member whose roles you want to see.")
        .setRequired(true)
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
      } catch (error) {
        logger.error("❌ /roles failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "❌ Failed to get roles. Please try again." });
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
