"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var personality_exports = {};
__export(personality_exports, {
  createPersonalityCommand: () => createPersonalityCommand
});
module.exports = __toCommonJS(personality_exports);
var import_discord = require("discord.js");
var import_guild_config = require("../core/guild-config");
var import_audit = require("../security/audit");
var import_logger = require("../logger");
const MAX_PROMPT_LENGTH = 2e3;
const MIN_PROMPT_LENGTH = 2;
function isOwnerOrAdmin(userId, guildOwnerId, adminIds) {
  return userId === guildOwnerId || adminIds.includes(userId);
}
function truncatePreview(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
function createPersonalityCommand() {
  return {
    data: new import_discord.SlashCommandBuilder().setName("personality").setDescription("Manage AshenAI's custom personality prompt for this server").setDefaultMemberPermissions(import_discord.PermissionFlagsBits.ManageGuild).addSubcommand(
      (sub) => sub.setName("set").setDescription("Set a custom personality prompt").addStringOption(
        (opt) => opt.setName("text").setDescription("The custom prompt (2-2000 characters)").setRequired(true).setMaxLength(MAX_PROMPT_LENGTH)
      )
    ).addSubcommand(
      (sub) => sub.setName("view").setDescription("View the current custom prompt")
    ).addSubcommand(
      (sub) => sub.setName("reset").setDescription("Reset the custom prompt to default")
    ),
    async execute(interaction) {
      try {
        if (!interaction.guild) {
          await interaction.editReply("This command can only be used in a server.");
          return;
        }
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const guildOwnerId = interaction.guild.ownerId;
        const { config } = await import("../config/env");
        const adminIds = config.admin?.discordIds || [];
        if (!isOwnerOrAdmin(userId, guildOwnerId, adminIds)) {
          await interaction.editReply(
            "You need the Manage Server permission to use this command."
          );
          return;
        }
        const subcommand = interaction.options.getSubcommand();
        const guildConfig = (0, import_guild_config.loadGuildConfig)(guildId);
        switch (subcommand) {
          case "set": {
            const text = interaction.options.getString("text", true).trim();
            if (text.length < MIN_PROMPT_LENGTH) {
              await interaction.editReply(
                `Prompt must be at least ${MIN_PROMPT_LENGTH} characters.`
              );
              return;
            }
            if (text.length > MAX_PROMPT_LENGTH) {
              await interaction.editReply(
                `Prompt must be at most ${MAX_PROMPT_LENGTH} characters.`
              );
              return;
            }
            if (!text.replace(/\s+/g, "").length) {
              await interaction.editReply(
                "Prompt cannot be only whitespace."
              );
              return;
            }
            const hasInjectionPatterns = /ignore\s+(all\s+)?previous\s+instructions/i.test(text) || /you\s+are\s+now/i.test(text) || /system\s*:\s*/i.test(text) || /assistant\s*:\s*/i.test(text) || /<\|im_start\|>/i.test(text);
            guildConfig.personality.customInstructions = text;
            guildConfig.updatedAt = Date.now();
            (0, import_guild_config.saveGuildConfig)(guildConfig);
            const embed = new import_discord.EmbedBuilder().setColor(hasInjectionPatterns ? 15965202 : 3066993).setTitle(
              hasInjectionPatterns ? "Custom Prompt Set (Warning)" : "Custom Prompt Set"
            ).setDescription(
              hasInjectionPatterns ? "Your custom prompt has been saved, but it contains patterns that resemble prompt injection attempts. These will not override AshenAI's security rules." : "Your custom prompt has been saved and will be applied to all AI conversations in this server."
            ).addFields(
              {
                name: "Current Prompt",
                value: `\`\`\`${truncatePreview(text, 500)}\`\`\``
              },
              {
                name: "Security Note",
                value: "The custom prompt is applied after system and security rules. It cannot override safety restrictions."
              }
            ).setFooter({ text: "Use /prompt view to see the full prompt" });
            await interaction.editReply({ embeds: [embed] });
            (0, import_audit.recordAudit)({
              who: userId,
              whoName: interaction.user.tag,
              what: `Updated custom prompt (${text.length} chars)`,
              where: "prompt-command",
              guildId,
              result: "success"
            });
            import_logger.logger.info(
              `Custom prompt updated by ${interaction.user.tag} in guild ${guildId} (${text.length} chars)`
            );
            break;
          }
          case "view": {
            const currentPrompt = guildConfig.personality?.customInstructions;
            const embed = new import_discord.EmbedBuilder().setColor(3447003).setTitle("Current Custom Prompt").setDescription(
              currentPrompt ? `This server has a custom prompt configured (${currentPrompt.length} characters).` : "No custom prompt configured. AshenAI uses the default personality."
            );
            if (currentPrompt) {
              embed.addFields({
                name: "Custom Prompt",
                value: `\`\`\`${truncatePreview(currentPrompt, 1e3)}\`\`\``
              });
            }
            embed.addFields({
              name: "How It Works",
              value: "The custom prompt is applied after system and security rules, shaping AshenAI's tone and behavior for this server."
            });
            await interaction.editReply({ embeds: [embed] });
            break;
          }
          case "reset": {
            const hadPrompt = !!guildConfig.personality?.customInstructions;
            guildConfig.personality.customInstructions = "";
            guildConfig.updatedAt = Date.now();
            (0, import_guild_config.saveGuildConfig)(guildConfig);
            const embed = new import_discord.EmbedBuilder().setColor(hadPrompt ? 3066993 : 9807270).setTitle("Custom Prompt Reset").setDescription(
              hadPrompt ? "The custom prompt has been removed. AshenAI will use the default personality." : "No custom prompt was configured. AshenAI already uses the default personality."
            );
            await interaction.editReply({ embeds: [embed] });
            if (hadPrompt) {
              (0, import_audit.recordAudit)({
                who: userId,
                whoName: interaction.user.tag,
                what: "Reset custom prompt to default",
                where: "prompt-command",
                guildId,
                result: "success"
              });
            }
            break;
          }
        }
      } catch (error) {
        import_logger.logger.error(
          "/prompt failed:",
          error instanceof Error ? error.message : String(error)
        );
        try {
          await interaction.editReply(
            "An error occurred. Please try again."
          );
        } catch {
        }
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createPersonalityCommand
});
