import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { AshenCommand } from "./definitions";
import { addWarning, getWarnings } from "../discord/warnings";
import {
  canModerate,
  canTarget,
} from "../discord/moderation";
import { recordAudit } from "../security/audit";
import { UserRateLimiter } from "../security/rate-limit";
import { logger } from "../logger";

const moderationRateLimiter = new UserRateLimiter(5, 60_000);

function checkModerationRateLimit(interaction: ChatInputCommandInteraction): boolean {
  const result = moderationRateLimiter.check(interaction.user.id);
  if (!result.allowed) {
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    interaction.editReply(
      `⚠️ Rate limit exceeded. Please wait ${seconds} second(s) before using moderation commands again.`
    ).catch(() => {});
    return false;
  }
  return true;
}

export function createWarnCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a server member.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member to warn.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the warning.")
        .setRequired(true)
        .setMaxLength(500)
    );

  return {
    data,

    async execute(interaction: ChatInputCommandInteraction) {
      try {
        if (!interaction.guild || !interaction.member) {
          await interaction.editReply(
            "❌ This command can only be used inside a server."
          );
          return;
        }

        if (!checkModerationRateLimit(interaction)) return;

        const requester = interaction.member as GuildMember;

        if (
          !canModerate(
            requester,
            PermissionFlagsBits.ModerateMembers
          )
        ) {
          await interaction.editReply(
            "❌ You don't have permission to warn members."
          );
          return;
        }

        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);

        let target: GuildMember;
        let botMember: GuildMember;

        try {
          target = await interaction.guild.members.fetch(user.id);
          botMember = await interaction.guild.members.fetchMe();
        } catch {
          await interaction.editReply(
            "❌ I couldn't find that member."
          );
          return;
        }

        const check = canTarget(
          requester,
          target,
          botMember
        );

        if (!check.allowed) {
          await interaction.editReply(
            `❌ ${check.reason}`
          );
          return;
        }

        const warning = addWarning(
          interaction.guild.id,
          target.id,
          requester.id,
          reason
        );

        await interaction.editReply(
          `⚠️ **Warning issued**\n` +
          `User: ${target.user.tag}\n` +
          `Reason: ${reason}\n` +
          `Warning ID: ${warning.id}\n` +
          `Moderator: ${requester.user.tag}`
        );

        recordAudit({
          who: requester.id,
          whoName: requester.user.tag,
          what: `Warned user ${target.user.tag} (${target.id}): ${reason}`,
          where: "discord",
          guildId: interaction.guild.id,
          result: "success",
        });
      } catch (error) {
        logger.error("❌ /warn failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "❌ Failed to warn member. Please try again." });
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

export function createWarningsCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a member's warning history.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member whose warnings you want to view.")
        .setRequired(true)
    );

  return {
    data,

    async execute(interaction: ChatInputCommandInteraction) {
      try {
        if (!interaction.guild || !interaction.member) {
          await interaction.editReply(
            "❌ This command can only be used inside a server."
          );
          return;
        }

        const requester = interaction.member as GuildMember;

        if (
          !canModerate(
            requester,
            PermissionFlagsBits.ModerateMembers
          )
        ) {
          await interaction.editReply(
            "❌ You don't have permission to view moderation records."
          );
          return;
        }

        const user = interaction.options.getUser("user", true);

        const warnings = getWarnings(
          interaction.guild.id,
          user.id
        );

        if (warnings.length === 0) {
          await interaction.editReply(
            `📋 **${user.tag}** has no recorded warnings.`
          );
          return;
        }

        const recent = warnings.slice(-10);

        const lines = recent.map(
          (warning, index) =>
            `${index + 1}. **${warning.reason}**\n` +
            `   ID: ${warning.id}\n` +
            `   Date: ${warning.createdAt}`
        );

        await interaction.editReply(
          `📋 **Warnings for ${user.tag}**\n` +
          `Total warnings: **${warnings.length}**\n\n` +
          lines.join("\n")
        );
      } catch (error) {
        logger.error("❌ /warnings failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "❌ Failed to get warnings. Please try again." });
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

export function createTimeoutCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Temporarily timeout a server member.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member to timeout.")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("Timeout duration in minutes.")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the timeout.")
        .setRequired(true)
        .setMaxLength(500)
    );

  return {
    data,

    async execute(interaction: ChatInputCommandInteraction) {
      try {
        if (!interaction.guild || !interaction.member) {
          await interaction.editReply(
            "❌ This command can only be used inside a server."
          );
          return;
        }

        if (!checkModerationRateLimit(interaction)) return;

        const requester = interaction.member as GuildMember;

        if (
          !canModerate(
            requester,
            PermissionFlagsBits.ModerateMembers
          )
        ) {
          await interaction.editReply(
            "❌ You don't have permission to timeout members."
          );
          return;
        }

        const user = interaction.options.getUser("user", true);
        const minutes = interaction.options.getInteger("minutes", true);
        const reason = interaction.options.getString("reason", true);

        let target: GuildMember;
        let botMember: GuildMember;

        try {
          target = await interaction.guild.members.fetch(user.id);
          botMember = await interaction.guild.members.fetchMe();
        } catch {
          await interaction.editReply(
            "❌ I couldn't find that member."
          );
          return;
        }

        const check = canTarget(
          requester,
          target,
          botMember
        );

        if (!check.allowed) {
          await interaction.editReply(
            `❌ ${check.reason}`
          );
          return;
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          await interaction.editReply(
            "❌ I don't have permission to timeout members."
          );
          return;
        }

        try {
          await target.timeout(
            minutes * 60 * 1000,
            `${reason} | Moderator: ${requester.user.tag}`
          );

          await interaction.editReply(
            `🔇 **Member timed out**\n` +
            `User: ${target.user.tag}\n` +
            `Duration: ${minutes} minute(s)\n` +
            `Reason: ${reason}\n` +
            `Moderator: ${requester.user.tag}`
          );

          recordAudit({
            who: requester.id,
            whoName: requester.user.tag,
            what: `Timed out user ${target.user.tag} (${target.id}) for ${minutes} minutes: ${reason}`,
            where: "discord",
            guildId: interaction.guild.id,
            result: "success",
          });
        } catch {
          await interaction.editReply(
            "❌ Discord rejected the timeout. Check my role position and permissions."
          );

          recordAudit({
            who: requester.id,
            whoName: requester.user.tag,
            what: `Failed timeout for user ${target.user.tag} (${target.id})`,
            where: "discord",
            guildId: interaction.guild.id,
            result: "failure",
          });
        }
      } catch (error) {
        logger.error("❌ /timeout failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "❌ Failed to timeout member. Please try again." });
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

export function createUntimeoutCommand(): AshenCommand {
  const data = new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a member's timeout.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Member whose timeout should be removed.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for removing the timeout.")
        .setRequired(true)
        .setMaxLength(500)
    );

  return {
    data,

    async execute(interaction: ChatInputCommandInteraction) {
      try {
        if (!interaction.guild || !interaction.member) {
          await interaction.editReply(
            "❌ This command can only be used inside a server."
          );
          return;
        }

        if (!checkModerationRateLimit(interaction)) return;

        const requester = interaction.member as GuildMember;

        if (
          !canModerate(
            requester,
            PermissionFlagsBits.ModerateMembers
          )
        ) {
          await interaction.editReply(
            "❌ You don't have permission to remove timeouts."
          );
          return;
        }

        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);

        let target: GuildMember;
        let botMember: GuildMember;

        try {
          target = await interaction.guild.members.fetch(user.id);
          botMember = await interaction.guild.members.fetchMe();
        } catch {
          await interaction.editReply(
            "❌ I couldn't find that member."
          );
          return;
        }

        const check = canTarget(
          requester,
          target,
          botMember
        );

        if (!check.allowed) {
          await interaction.editReply(
            `❌ ${check.reason}`
          );
          return;
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          await interaction.editReply(
            "❌ I don't have permission to manage timeouts."
          );
          return;
        }

        try {
          await target.timeout(
            null,
            `${reason} | Moderator: ${requester.user.tag}`
          );

          await interaction.editReply(
            `🔊 **Timeout removed**\n` +
            `User: ${target.user.tag}\n` +
            `Reason: ${reason}\n` +
            `Moderator: ${requester.user.tag}`
          );

          recordAudit({
            who: requester.id,
            whoName: requester.user.tag,
            what: `Removed timeout for user ${target.user.tag} (${target.id}): ${reason}`,
            where: "discord",
            guildId: interaction.guild.id,
            result: "success",
          });
        } catch {
          await interaction.editReply(
            "❌ Discord rejected the action. Check my role position and permissions."
          );

          recordAudit({
            who: requester.id,
            whoName: requester.user.tag,
            what: `Failed to remove timeout for user ${target.user.tag} (${target.id})`,
            where: "discord",
            guildId: interaction.guild.id,
            result: "failure",
          });
        }
      } catch (error) {
        logger.error("❌ /untimeout failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "❌ Failed to remove timeout. Please try again." });
          }
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
