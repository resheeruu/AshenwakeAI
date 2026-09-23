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
var access_exports = {};
__export(access_exports, {
  createAccessCommand: () => createAccessCommand
});
module.exports = __toCommonJS(access_exports);
var import_discord = require("discord.js");
var import_channel_scope = require("../ai/tools/channel-scope");
var import_env = require("../config/env");
var import_audit = require("../security/audit");
var import_logger = require("../logger");
function createAccessCommand() {
  return {
    data: new import_discord.SlashCommandBuilder().setName("access").setDescription("Manage trusted users and send messages as AshenAI").addSubcommand(
      (sub) => sub.setName("add").setDescription("Add a trusted user").addUserOption(
        (opt) => opt.setName("user").setDescription("The user to trust").setRequired(true)
      )
    ).addSubcommand(
      (sub) => sub.setName("remove").setDescription("Remove a trusted user").addUserOption(
        (opt) => opt.setName("user").setDescription("The user to remove trust from").setRequired(true)
      )
    ).addSubcommand(
      (sub) => sub.setName("list").setDescription("List all trusted users")
    ).addSubcommand(
      (sub) => sub.setName("send").setDescription("Send a message as AshenAI").addStringOption(
        (opt) => opt.setName("message").setDescription("The message to send").setRequired(true).setMaxLength(2e3)
      )
    ),
    async execute(interaction) {
      try {
        if (!interaction.guild) {
          await interaction.editReply("\u274C This command can only be used in a server.");
          return;
        }
        const subcommand = interaction.options.getSubcommand();
        const member = interaction.member;
        const guild = interaction.guild;
        const isGuildOwner = member && typeof member !== "string" ? member.id === guild.ownerId : false;
        const isAdmin = member && typeof member.permissions === "string" ? false : member && "permissions" in member ? member.permissions.has?.(import_discord.PermissionFlagsBits.Administrator) ?? false : false;
        const aiConfig = (0, import_channel_scope.loadGuildAIConfig)(guild.id);
        const isTrusted = aiConfig.trustedUserIds?.includes(interaction.user.id) || false;
        if (subcommand === "add" || subcommand === "remove") {
          if (!isGuildOwner && !isAdmin) {
            await interaction.editReply(
              "\u274C Only the server owner or administrators can manage trusted users."
            );
            return;
          }
        }
        if (subcommand === "send") {
          const isBotOwner = import_env.config.admin.discordIds.includes(interaction.user.id);
          if (!isTrusted && !isGuildOwner && !isBotOwner) {
            await interaction.editReply("\u274C You don't have permission to use `/access send`.");
            return;
          }
        }
        if (subcommand === "add") {
          const targetUser = interaction.options.getUser("user", true);
          if (targetUser.bot) {
            await interaction.editReply("\u274C Cannot trust a bot account.");
            return;
          }
          const added = (0, import_channel_scope.addTrustedUser)(aiConfig, targetUser.id);
          if (!added) {
            await interaction.editReply(
              `\u26A0\uFE0F <@${targetUser.id}> is already trusted.`
            );
            return;
          }
          (0, import_channel_scope.saveGuildAIConfig)(aiConfig);
          (0, import_audit.recordAudit)({
            who: interaction.user.id,
            whoName: interaction.user.tag,
            what: `Added trusted user: ${targetUser.tag} (${targetUser.id})`,
            where: "access-command",
            guildId: guild.id,
            result: "success"
          });
          await interaction.editReply(
            `\u2705 <@${targetUser.id}> has been added as a trusted user. They can now use server-management features.`
          );
          return;
        }
        if (subcommand === "remove") {
          const targetUser = interaction.options.getUser("user", true);
          const removed = (0, import_channel_scope.removeTrustedUser)(aiConfig, targetUser.id);
          if (!removed) {
            await interaction.editReply(
              `\u26A0\uFE0F <@${targetUser.id}> is not currently trusted.`
            );
            return;
          }
          (0, import_channel_scope.saveGuildAIConfig)(aiConfig);
          (0, import_audit.recordAudit)({
            who: interaction.user.id,
            whoName: interaction.user.tag,
            what: `Removed trusted user: ${targetUser.tag} (${targetUser.id})`,
            where: "access-command",
            guildId: guild.id,
            result: "success"
          });
          await interaction.editReply(
            `\u2705 <@${targetUser.id}> has been removed from trusted users.`
          );
          return;
        }
        if (subcommand === "list") {
          const trustedIds = (0, import_channel_scope.getTrustedUsers)(aiConfig);
          if (trustedIds.length === 0) {
            await interaction.editReply(
              "\u{1F4CB} No trusted users configured.\n\nUse `/access add @user` to add a trusted user."
            );
            return;
          }
          const lines = ["\u{1F4CB} **Trusted Users**", ""];
          for (const id of trustedIds) {
            lines.push(`\u2022 <@${id}>`);
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
          await interaction.editReply("\u2705 Message sent.");
          (0, import_audit.recordAudit)({
            who: interaction.user.id,
            whoName: interaction.user.tag,
            what: `Sent message via /access send: ${message.slice(0, 100)}`,
            where: "access-command",
            guildId: guild.id,
            result: "success"
          });
          return;
        }
      } catch (error) {
        import_logger.logger.error("\u274C /access failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(
              "\u274C Failed to process access command. Please try again."
            );
          }
        } catch {
        }
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createAccessCommand
});
