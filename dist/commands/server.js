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
var server_exports = {};
__export(server_exports, {
  createServerCommand: () => createServerCommand
});
module.exports = __toCommonJS(server_exports);
var import_discord = require("discord.js");
var import_server_actions = require("../discord/server-actions");
var import_logger = require("../logger");
function createServerCommand() {
  const data = new import_discord.SlashCommandBuilder().setName("server").setDescription("Server information and member utilities").addSubcommand(
    (sub) => sub.setName("info").setDescription("Show information about this Discord server")
  ).addSubcommand(
    (sub) => sub.setName("user").setDescription("Show information about a server member").addUserOption(
      (option) => option.setName("user").setDescription("The member to inspect").setRequired(true)
    )
  ).addSubcommand(
    (sub) => sub.setName("roles").setDescription("Show the roles of a server member").addUserOption(
      (option) => option.setName("user").setDescription("The member whose roles you want to see").setRequired(true)
    )
  );
  return {
    data,
    async execute(interaction) {
      try {
        if (!interaction.guild) {
          await interaction.editReply(
            "\u274C This command can only be used inside a server."
          );
          return;
        }
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "info") {
          await interaction.editReply(
            `\u{1F3E0} **Server Information**
${(0, import_server_actions.getServerSummary)(
              interaction.guild
            )}`
          );
          return;
        }
        if (subcommand === "user") {
          const user = interaction.options.getUser("user", true);
          let member;
          try {
            member = await interaction.guild.members.fetch(user.id);
          } catch {
            member = null;
          }
          if (!member) {
            await interaction.editReply(
              "\u274C I couldn't find that member in this server."
            );
            return;
          }
          await interaction.editReply(
            `\u{1F464} **User Information**
${(0, import_server_actions.getMemberSummary)(member)}`
          );
          return;
        }
        if (subcommand === "roles") {
          const user = interaction.options.getUser("user", true);
          let member;
          try {
            member = await interaction.guild.members.fetch(user.id);
          } catch {
            member = null;
          }
          if (!member) {
            await interaction.editReply(
              "\u274C I couldn't find that member in this server."
            );
            return;
          }
          const roles = member.roles.cache.filter((role) => role.id !== interaction.guild.id).map((role) => role.name);
          await interaction.editReply(
            `\u{1F3AD} **${member.user.tag}'s roles**
${roles.length ? roles.join(", ") : "No roles"}`
          );
          return;
        }
      } catch (error) {
        import_logger.logger.error("\u274C /server failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "\u274C Failed to process server command. Please try again." });
          }
        } catch {
        }
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createServerCommand
});
