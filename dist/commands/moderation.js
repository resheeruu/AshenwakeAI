"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var moderation_exports = {};
__export(moderation_exports, {
  createModerationCommand: () => createModerationCommand
});
module.exports = __toCommonJS(moderation_exports);
var import_discord = require("discord.js");
var import_warnings = require("../discord/warnings");
var import_moderation = require("../discord/moderation");
var import_audit = require("../security/audit");
var import_rate_limit = require("../security/rate-limit");
var import_logger = require("../logger");
const moderationRateLimiter = new import_rate_limit.UserRateLimiter(5, 6e4);
function checkModerationRateLimit(interaction) {
  const result = moderationRateLimiter.check(interaction.user.id);
  if (!result.allowed) {
    const seconds = Math.ceil(result.retryAfterMs / 1e3);
    interaction.editReply(
      `\u26A0\uFE0F Rate limit exceeded. Please wait ${seconds} second(s) before using moderation commands again.`
    ).catch(() => {
    });
    return false;
  }
  return true;
}
function createModerationCommand() {
  const data = new import_discord.SlashCommandBuilder().setName("moderation").setDescription("Moderation tools for server management").addSubcommand(
    (sub) => sub.setName("warn").setDescription("Warn a server member").addUserOption(
      (option) => option.setName("user").setDescription("Member to warn").setRequired(true)
    ).addStringOption(
      (option) => option.setName("reason").setDescription("Reason for the warning").setRequired(true).setMaxLength(500)
    )
  ).addSubcommand(
    (sub) => sub.setName("warnings").setDescription("View a member's warning history").addUserOption(
      (option) => option.setName("user").setDescription("Member whose warnings you want to view").setRequired(true)
    )
  ).addSubcommand(
    (sub) => sub.setName("timeout").setDescription("Temporarily timeout a server member").addUserOption(
      (option) => option.setName("user").setDescription("Member to timeout").setRequired(true)
    ).addIntegerOption(
      (option) => option.setName("minutes").setDescription("Timeout duration in minutes").setRequired(true).setMinValue(1).setMaxValue(40320)
    ).addStringOption(
      (option) => option.setName("reason").setDescription("Reason for the timeout").setRequired(true).setMaxLength(500)
    )
  ).addSubcommand(
    (sub) => sub.setName("untimeout").setDescription("Remove a member's timeout").addUserOption(
      (option) => option.setName("user").setDescription("Member whose timeout should be removed").setRequired(true)
    ).addStringOption(
      (option) => option.setName("reason").setDescription("Reason for removing the timeout").setRequired(true).setMaxLength(500)
    )
  );
  return {
    data,
    async execute(interaction) {
      try {
        if (!interaction.guild || !interaction.member) {
          await interaction.editReply(
            "\u274C This command can only be used inside a server."
          );
          return;
        }
        if (!checkModerationRateLimit(interaction)) return;
        const requester = interaction.member;
        const subcommand = interaction.options.getSubcommand();
        if (!(0, import_moderation.canModerate)(
          requester,
          import_discord.PermissionFlagsBits.ModerateMembers
        )) {
          await interaction.editReply(
            "\u274C You don't have permission to use moderation commands."
          );
          return;
        }
        if (subcommand === "warn") {
          const user = interaction.options.getUser("user", true);
          const reason = interaction.options.getString("reason", true);
          let target;
          let botMember;
          try {
            target = await interaction.guild.members.fetch(user.id);
            botMember = await interaction.guild.members.fetchMe();
          } catch {
            await interaction.editReply(
              "\u274C I couldn't find that member."
            );
            return;
          }
          const check = (0, import_moderation.canTarget)(
            requester,
            target,
            botMember
          );
          if (!check.allowed) {
            await interaction.editReply(
              `\u274C ${check.reason}`
            );
            return;
          }
          const warning = (0, import_warnings.addWarning)(
            interaction.guild.id,
            target.id,
            requester.id,
            reason
          );
          await interaction.editReply(
            `\u26A0\uFE0F **Warning issued**
User: ${target.user.tag}
Reason: ${reason}
Warning ID: ${warning.id}
Moderator: ${requester.user.tag}`
          );
          (0, import_audit.recordAudit)({
            who: requester.id,
            whoName: requester.user.tag,
            what: `Warned user ${target.user.tag} (${target.id}): ${reason}`,
            where: "discord",
            guildId: interaction.guild.id,
            result: "success"
          });
          return;
        }
        if (subcommand === "warnings") {
          const user = interaction.options.getUser("user", true);
          const warnings = (0, import_warnings.getWarnings)(
            interaction.guild.id,
            user.id
          );
          if (warnings.length === 0) {
            await interaction.editReply(
              `\u{1F4CB} **${user.tag}** has no recorded warnings.`
            );
            return;
          }
          const recent = warnings.slice(-10);
          const lines = recent.map(
            (warning, index) => `${index + 1}. **${warning.reason}**
   ID: ${warning.id}
   Date: ${warning.createdAt}`
          );
          await interaction.editReply(
            `\u{1F4CB} **Warnings for ${user.tag}**
Total warnings: **${warnings.length}**

` + lines.join("\n")
          );
          return;
        }
        if (subcommand === "timeout") {
          const user = interaction.options.getUser("user", true);
          const minutes = interaction.options.getInteger("minutes", true);
          const reason = interaction.options.getString("reason", true);
          let target;
          let botMember;
          try {
            target = await interaction.guild.members.fetch(user.id);
            botMember = await interaction.guild.members.fetchMe();
          } catch {
            await interaction.editReply(
              "\u274C I couldn't find that member."
            );
            return;
          }
          const check = (0, import_moderation.canTarget)(
            requester,
            target,
            botMember
          );
          if (!check.allowed) {
            await interaction.editReply(
              `\u274C ${check.reason}`
            );
            return;
          }
          if (!botMember.permissions.has(import_discord.PermissionFlagsBits.ModerateMembers)) {
            await interaction.editReply(
              "\u274C I don't have permission to timeout members."
            );
            return;
          }
          try {
            await target.timeout(
              minutes * 60 * 1e3,
              `${reason} | Moderator: ${requester.user.tag}`
            );
            await interaction.editReply(
              `\u{1F507} **Member timed out**
User: ${target.user.tag}
Duration: ${minutes} minute(s)
Reason: ${reason}
Moderator: ${requester.user.tag}`
            );
            (0, import_audit.recordAudit)({
              who: requester.id,
              whoName: requester.user.tag,
              what: `Timed out user ${target.user.tag} (${target.id}) for ${minutes} minutes: ${reason}`,
              where: "discord",
              guildId: interaction.guild.id,
              result: "success"
            });
          } catch {
            await interaction.editReply(
              "\u274C Discord rejected the timeout. Check my role position and permissions."
            );
            (0, import_audit.recordAudit)({
              who: requester.id,
              whoName: requester.user.tag,
              what: `Failed timeout for user ${target.user.tag} (${target.id})`,
              where: "discord",
              guildId: interaction.guild.id,
              result: "failure"
            });
          }
          return;
        }
        if (subcommand === "untimeout") {
          const user = interaction.options.getUser("user", true);
          const reason = interaction.options.getString("reason", true);
          let target;
          let botMember;
          try {
            target = await interaction.guild.members.fetch(user.id);
            botMember = await interaction.guild.members.fetchMe();
          } catch {
            await interaction.editReply(
              "\u274C I couldn't find that member."
            );
            return;
          }
          const check = (0, import_moderation.canTarget)(
            requester,
            target,
            botMember
          );
          if (!check.allowed) {
            await interaction.editReply(
              `\u274C ${check.reason}`
            );
            return;
          }
          if (!botMember.permissions.has(import_discord.PermissionFlagsBits.ModerateMembers)) {
            await interaction.editReply(
              "\u274C I don't have permission to manage timeouts."
            );
            return;
          }
          try {
            await target.timeout(
              null,
              `${reason} | Moderator: ${requester.user.tag}`
            );
            await interaction.editReply(
              `\u{1F50A} **Timeout removed**
User: ${target.user.tag}
Reason: ${reason}
Moderator: ${requester.user.tag}`
            );
            (0, import_audit.recordAudit)({
              who: requester.id,
              whoName: requester.user.tag,
              what: `Removed timeout for user ${target.user.tag} (${target.id}): ${reason}`,
              where: "discord",
              guildId: interaction.guild.id,
              result: "success"
            });
          } catch {
            await interaction.editReply(
              "\u274C Discord rejected the action. Check my role position and permissions."
            );
            (0, import_audit.recordAudit)({
              who: requester.id,
              whoName: requester.user.tag,
              what: `Failed to remove timeout for user ${target.user.tag} (${target.id})`,
              where: "discord",
              guildId: interaction.guild.id,
              result: "failure"
            });
          }
          return;
        }
      } catch (error) {
        import_logger.logger.error("\u274C /moderation failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "\u274C Failed to process moderation command. Please try again." });
          }
        } catch {
        }
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createModerationCommand
});
