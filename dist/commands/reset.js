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
var reset_exports = {};
__export(reset_exports, {
  createResetCommand: () => createResetCommand
});
module.exports = __toCommonJS(reset_exports);
var import_discord = require("discord.js");
var import_logger = require("../logger");
var import_emojis = require("../discord/emojis");
function createResetCommand(memory) {
  return {
    data: new import_discord.SlashCommandBuilder().setName("reset").setDescription("Reset your AshenAI conversation"),
    async execute(interaction) {
      try {
        const userId = interaction.user.id;
        memory.reset(userId, interaction.channelId);
        await interaction.editReply({
          content: `${(0, import_emojis.emoji)("ash_refresh")} Your AshenAI conversation context has been reset.`
        });
      } catch (error) {
        import_logger.logger.error(`${(0, import_emojis.emoji)("ash_error")} /reset failed:`, error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: `${(0, import_emojis.emoji)("ash_error")} Failed to reset conversation. Please try again.` });
          } else {
            await interaction.reply({ content: `${(0, import_emojis.emoji)("ash_error")} Failed to reset conversation.`, flags: 64 }).catch(() => {
            });
          }
        } catch {
        }
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createResetCommand
});
