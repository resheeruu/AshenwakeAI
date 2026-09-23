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
var help_exports = {};
__export(help_exports, {
  createHelpCommand: () => createHelpCommand
});
module.exports = __toCommonJS(help_exports);
var import_discord = require("discord.js");
var import_logger = require("../logger");
var import_emojis = require("../discord/emojis");
const EMBED_COLOR = 2895667;
const COMMAND_METADATA = {
  ask: { description: "Ask AshenAI anything", category: "ai" },
  reset: { description: "Reset your conversation memory", category: "ai" },
  game: { description: "Play games, earn coins, level up", category: "ai" },
  prompt: { description: "AI-powered server builder \u2014 describe what you want in natural language", category: "server" },
  personality: { description: "Set your custom AI personality prompt for this server", category: "ai", adminOnly: true },
  server: { description: "Server info, member info, and role management", category: "server" },
  moderation: { description: "Warn, timeout, and manage members", category: "moderation", modOnly: true },
  support: { description: "Tickets, reports, appeals, and case management", category: "support" },
  access: { description: "Manage trusted users and send messages as AshenAI", category: "access" },
  settings: { description: "Server settings panel", category: "system", adminOnly: true },
  status: { description: "Show system status and your AI usage", category: "system" }
};
const CATEGORY_DEFS = [
  { id: "ai", name: "AI Chat", emoji: (0, import_emojis.emoji)("ash_ai"), description: "Chat naturally with AshenAI." },
  {
    id: "server",
    name: "Server Management",
    emoji: (0, import_emojis.emoji)("ash_settings"),
    description: "Manage your Discord server using natural language.",
    features: [
      { name: "Templates", description: "Set up your server with a template (gaming, community, etc.)" },
      { name: "Server improvements", description: "Fix and organize your server" },
      { name: "Channel management", description: "Create, delete, rename, organize channels" },
      { name: "Role management", description: "Create roles, manage permissions" }
    ]
  },
  { id: "moderation", name: "Moderation", emoji: "\u{1F6E1}\uFE0F", description: "Keep the server safe and manage members." },
  { id: "support", name: "Support", emoji: "\u{1F3AB}", description: "Tickets, reports, appeals, and case management." },
  { id: "access", name: "Access Control", emoji: "\u{1F511}", description: "Trusted users and permission management." },
  {
    id: "social",
    name: "Social",
    emoji: "\u{1F4AC}",
    description: "Anime reactions and social interactions.",
    features: [
      { name: "Anime actions", description: "Use ash <action> @user for reactions (hug, pat, bonk, etc.)" },
      { name: "Reaction commands", description: "Affection, combat, and fun interactions" }
    ]
  },
  { id: "system", name: "System", emoji: (0, import_emojis.emoji)("ash_stats"), description: "System status, settings, and AI usage." }
];
const TRY_ASKING = [
  "How do I set up my server?",
  "Create a gaming server template",
  "Fix my server organization",
  "Delete all channels except general"
];
function buildCategories(registeredNames) {
  const categories = [];
  for (const def of CATEGORY_DEFS) {
    const commands = [];
    for (const [name, meta] of Object.entries(COMMAND_METADATA)) {
      if (meta.category !== def.id) continue;
      if (!registeredNames.has(name)) continue;
      commands.push({ name: `/${name}`, description: meta.description, ownerOnly: meta.ownerOnly, modOnly: meta.modOnly, adminOnly: meta.adminOnly });
    }
    if (def.features) {
      for (const f of def.features) {
        commands.push({ name: f.name, description: f.description });
      }
    }
    if (def.id === "ai") {
      commands.push({ name: "@AshenAI", description: "Mention me in any channel for quick chat" });
    }
    categories.push({ id: def.id, name: def.name, emoji: def.emoji, description: def.description, commands });
  }
  return categories.filter((c) => c.commands.length > 0);
}
function buildMainEmbed(registeredNames, isOwner, isMod) {
  const categories = buildCategories(registeredNames);
  const embed = new import_discord.EmbedBuilder().setColor(EMBED_COLOR).setTitle("AshenAI \u2014 Help").setDescription(
    "Hi! I'm AshenAI, your AI-powered server assistant.\n\nPick a category below to see what I can do."
  );
  const shuffled = [...TRY_ASKING].sort(() => Math.random() - 0.5);
  const examples = shuffled.slice(0, 3).map((e) => `\u2022 "${e}"`).join("\n");
  embed.addFields({ name: "Try asking me...", value: examples, inline: false });
  const options = categories.filter((cat) => {
    if (cat.commands.some((c) => c.ownerOnly) && !isOwner) return false;
    return true;
  }).map((cat) => ({
    label: cat.name,
    value: cat.id,
    description: cat.description.slice(0, 100),
    emoji: cat.emoji
  }));
  const selectMenu = new import_discord.StringSelectMenuBuilder().setCustomId("help_category_select").setPlaceholder("Choose a category...").addOptions(options);
  const row = new import_discord.ActionRowBuilder().addComponents(selectMenu);
  return { embed, components: [row] };
}
function buildCategoryEmbed(category, registeredNames, isOwner, isMod) {
  const categories = buildCategories(registeredNames);
  const embed = new import_discord.EmbedBuilder().setColor(EMBED_COLOR).setTitle(`${category.emoji} ${category.name}`).setDescription(category.description);
  const visibleCmds = category.commands.filter((cmd) => {
    if (cmd.ownerOnly && !isOwner) return false;
    if (cmd.modOnly && !isMod && !isOwner) return false;
    if (cmd.adminOnly && !isOwner) return false;
    return true;
  });
  if (visibleCmds.length === 0) {
    embed.addFields({ name: "Commands", value: "No commands available for your permission level." });
  } else {
    const lines = visibleCmds.map((cmd) => `\`${cmd.name}\` \u2014 ${cmd.description}`).join("\n");
    embed.addFields({ name: "Commands", value: lines });
  }
  const backOption = { label: "\u2190 Back to categories", value: "__back__", description: "Return to the main help menu" };
  const categoryOptions = categories.filter((cat) => {
    if (cat.commands.some((c) => c.ownerOnly) && !isOwner) return false;
    return true;
  }).map((cat) => ({
    label: cat.name,
    value: cat.id,
    description: cat.description.slice(0, 100),
    emoji: cat.emoji
  }));
  const selectMenu = new import_discord.StringSelectMenuBuilder().setCustomId("help_category_select").setPlaceholder("Choose a category...").addOptions([backOption, ...categoryOptions]);
  const row = new import_discord.ActionRowBuilder().addComponents(selectMenu);
  return { embed, components: [row] };
}
function createHelpCommand(registeredCommands) {
  const registeredNames = new Set(
    registeredCommands?.map((c) => c.data.name) ?? []
  );
  return {
    data: new import_discord.SlashCommandBuilder().setName("help").setDescription("Show AshenAI commands and guide"),
    async execute(interaction) {
      try {
        const member = interaction.member;
        const isOwner = member && typeof member.permissions === "string" ? false : member && "permissions" in member ? member.permissions.has?.(import_discord.PermissionFlagsBits.Administrator) ?? false : false;
        const isMod = isOwner || (member && typeof member.permissions === "string" ? false : member && "permissions" in member ? member.permissions.has?.(import_discord.PermissionFlagsBits.ModerateMembers) ?? false : false);
        const { embed, components } = buildMainEmbed(registeredNames, isOwner, isMod);
        const reply = await interaction.editReply({
          embeds: [embed],
          components
        });
        const collector = reply.createMessageComponentCollector({
          componentType: import_discord.ComponentType.StringSelect,
          time: 12e4,
          filter: (i) => i.user.id === interaction.user.id
        });
        collector.on("collect", async (selectInteraction) => {
          try {
            const categoryId = selectInteraction.values[0];
            if (categoryId === "__back__") {
              const { embed: mainEmbed, components: mainComponents } = buildMainEmbed(registeredNames, isOwner, isMod);
              await selectInteraction.update({ embeds: [mainEmbed], components: mainComponents });
              return;
            }
            const categories = buildCategories(registeredNames);
            const category = categories.find((c) => c.id === categoryId);
            if (!category) {
              await selectInteraction.update({ content: "Category not found.", embeds: [], components: [] });
              return;
            }
            const { embed: catEmbed, components: catComponents } = buildCategoryEmbed(category, registeredNames, isOwner, isMod);
            await selectInteraction.update({ embeds: [catEmbed], components: catComponents });
          } catch (err) {
            try {
              if (!selectInteraction.replied && !selectInteraction.deferred) {
                await selectInteraction.reply({
                  content: "\u26A0\uFE0F Something went wrong. Please try again.",
                  flags: import_discord.MessageFlags.Ephemeral
                }).catch(() => {
                });
              }
            } catch {
            }
          }
        });
        collector.on("end", () => {
          const disabledMenu = new import_discord.StringSelectMenuBuilder().setCustomId("help_category_select").setPlaceholder("Session expired. Use /help again.").setDisabled(true).addOptions({ label: "Expired", value: "expired" });
          const disabledRow = new import_discord.ActionRowBuilder().addComponents(disabledMenu);
          interaction.editReply({ components: [disabledRow] }).catch(() => {
          });
        });
      } catch (error) {
        import_logger.logger.error("\u274C /help failed:", error instanceof Error ? error.message : String(error));
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              embeds: [
                new import_discord.EmbedBuilder().setColor(EMBED_COLOR).setDescription("\u26A0\uFE0F I couldn't open the help menu right now. Please try `/help` again.")
              ],
              components: []
            });
          } else {
            await interaction.reply({
              embeds: [
                new import_discord.EmbedBuilder().setColor(EMBED_COLOR).setDescription("\u26A0\uFE0F I couldn't open the help menu right now. Please try `/help` again.")
              ],
              components: [],
              flags: import_discord.MessageFlags.Ephemeral
            }).catch(() => {
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
  createHelpCommand
});
