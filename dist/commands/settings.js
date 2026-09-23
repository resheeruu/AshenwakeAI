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
var settings_exports = {};
__export(settings_exports, {
  createSettingsCommand: () => createSettingsCommand,
  createSettingsUpdateCommand: () => createSettingsUpdateCommand,
  handleSettingsModalSubmit: () => handleSettingsModalSubmit
});
module.exports = __toCommonJS(settings_exports);
var import_discord = require("discord.js");
var import_guild_config = require("../core/guild-config");
var import_audit = require("../security/audit");
var import_logger = require("../logger");
var import_definitions2 = require("../settings/definitions");
var import_service = require("../settings/service");
const activeSessions = /* @__PURE__ */ new Map();
function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}
function registerSession(guildId, userId, channelId, messageId) {
  const key = sessionKey(guildId, userId);
  const session = { guildId, userId, channelId, messageId, createdAt: Date.now(), currentCategory: "overview" };
  activeSessions.set(key, session);
  return session;
}
function getSession(guildId, userId) {
  const key = sessionKey(guildId, userId);
  const session = activeSessions.get(key);
  if (!session) return void 0;
  if (Date.now() - session.createdAt > 3e5) {
    activeSessions.delete(key);
    return void 0;
  }
  return session;
}
function removeSession(guildId, userId) {
  activeSessions.delete(sessionKey(guildId, userId));
}
const P = { cat: "as", tog: "at", ch: "ac", rl: "ar", num: "an" };
const BRAND = 8141549;
function buildEmbed(category, guildId) {
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  (0, import_service.ensureConfigSections)(config);
  switch (category) {
    case "overview": {
      const ov = (0, import_service.getOverviewData)(config);
      const mods = ov.enabledModules.length > 0 ? ov.enabledModules.map((m) => `\u2705 ${m}`).join("\n") : "No modules enabled";
      const chs = ov.configuredChannels.length > 0 ? ov.configuredChannels.map((c) => `${c.label}: ${(0, import_service.formatChannelMention)(c.id)}`).join("\n") : "No channels configured";
      const roles = ov.staffRoles.length > 0 ? ov.staffRoles.map((r) => (0, import_service.formatRoleMention)(r)).join(", ") : "No staff roles";
      const lc = ov.lastConfigChange ? `<t:${Math.floor(ov.lastConfigChange / 1e3)}:R>` : "Never";
      return new import_discord.EmbedBuilder().setTitle("\u{1F3E0} ASHENAI SETTINGS \u2014 OVERVIEW").setColor(BRAND).setDescription("Server configuration overview.").addFields(
        { name: "Enabled Modules", value: mods, inline: true },
        { name: "Configured Channels", value: chs, inline: true },
        { name: "Staff Roles", value: roles, inline: false },
        { name: "Logging", value: ov.loggingEnabled ? "\u2705 Active" : "\u274C Inactive", inline: true },
        { name: "Last Change", value: lc, inline: true }
      ).setFooter({ text: "Select a category below to configure." });
    }
    case "moderation": {
      const m = config.moderation;
      return new import_discord.EmbedBuilder().setTitle("\u{1F6E1}\uFE0F ASHENAI SETTINGS \u2014 MODERATION").setColor(BRAND).setDescription("Configure moderation behavior.").addFields(
        { name: "Enabled", value: m.enabled ? "\u2705" : "\u274C", inline: true },
        { name: "Default Timeout", value: `${m.defaultTimeoutMinutes} min`, inline: true },
        { name: "Max Warnings", value: `${m.maxWarnBeforeAction}`, inline: true },
        { name: "Auto Ban", value: m.autoBanOnMaxWarn ? "\u2705" : "\u274C", inline: true }
      ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "support": {
      const s = config.support;
      return new import_discord.EmbedBuilder().setTitle("\u{1F3AB} ASHENAI SETTINGS \u2014 SUPPORT").setColor(BRAND).setDescription("Configure the support ticket system.").addFields(
        { name: "Enabled", value: s.enabled ? "\u2705" : "\u274C", inline: true },
        { name: "Support Channel", value: (0, import_service.formatChannelMention)(s.channelId), inline: true },
        { name: "Category", value: (0, import_service.formatChannelMention)(s.categoryId), inline: true },
        { name: "General Help", value: s.allowGeneralHelp ? "\u2705" : "\u274C", inline: true },
        { name: "Reports", value: s.allowReports ? "\u2705" : "\u274C", inline: true },
        { name: "Appeals", value: s.allowAppeals ? "\u2705" : "\u274C", inline: true }
      ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "reports": {
      const r = config.reports;
      return new import_discord.EmbedBuilder().setTitle("\u{1F6A8} ASHENAI SETTINGS \u2014 REPORTS").setColor(BRAND).setDescription("Configure the user report system.").addFields(
        { name: "Enabled", value: r.enabled ? "\u2705" : "\u274C", inline: true },
        { name: "Category", value: (0, import_service.formatChannelMention)(r.categoryId), inline: true },
        { name: "Require Evidence", value: r.requireEvidence ? "\u2705" : "\u274C", inline: true },
        { name: "AI Analysis", value: r.aiAnalysisEnabled ? "\u2705" : "\u274C", inline: true },
        { name: "Auto Escalate", value: r.autoEscalateHighRisk ? "\u2705" : "\u274C", inline: true }
      ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "appeals": {
      const a = config.appeals;
      return new import_discord.EmbedBuilder().setTitle("\u{1F528} ASHENAI SETTINGS \u2014 APPEALS").setColor(BRAND).setDescription("Configure the ban appeal system.").addFields(
        { name: "Enabled", value: a.enabled ? "\u2705" : "\u274C", inline: true },
        { name: "Category", value: (0, import_service.formatChannelMention)(a.categoryId), inline: true },
        { name: "AI Analysis", value: a.aiAnalysisEnabled ? "\u2705" : "\u274C", inline: true }
      ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "ai": {
      const ai = config.supportAi;
      return new import_discord.EmbedBuilder().setTitle("\u{1F916} ASHENAI SETTINGS \u2014 AI").setColor(BRAND).setDescription("Configure AI behavior in support cases.").addFields(
        { name: "AI Enabled", value: ai.enabled ? "\u2705" : "\u274C", inline: true },
        { name: "Mod Actions", value: ai.allowModerationActions ? "\u2705" : "\u274C", inline: true },
        { name: "Confirmation", value: ai.requireConfirmation ? "\u2705 Required" : "\u274C Not Required", inline: true },
        { name: "Web Research", value: ai.allowWebResearch ? "\u2705" : "\u274C", inline: true }
      ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "logging": {
      const l = config.supportLogging;
      return new import_discord.EmbedBuilder().setTitle("\u{1F4CB} ASHENAI SETTINGS \u2014 LOGGING").setColor(BRAND).setDescription("Configure support event logging.").addFields(
        { name: "Enabled", value: l.enabled ? "\u2705" : "\u274C", inline: true },
        { name: "Log Channel", value: (0, import_service.formatChannelMention)(l.channelId), inline: true },
        { name: "Moderation", value: l.includeModeration ? "\u2705" : "\u274C", inline: true },
        { name: "Tickets", value: l.includeTickets ? "\u2705" : "\u274C", inline: true },
        { name: "Reports", value: l.includeReports ? "\u2705" : "\u274C", inline: true },
        { name: "Appeals", value: l.includeAppeals ? "\u2705" : "\u274C", inline: true },
        { name: "AI Actions", value: l.includeAiActions ? "\u2705" : "\u274C", inline: true }
      ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "staff": {
      const st = config.staff;
      const roleList = st.roleIds.length > 0 ? st.roleIds.map((id) => `<@&${id}>`).join(", ") : "No staff roles configured";
      return new import_discord.EmbedBuilder().setTitle("\u{1F465} ASHENAI SETTINGS \u2014 STAFF").setColor(BRAND).setDescription("Configure staff roles for case management.").addFields({ name: "Staff Roles", value: roleList }).setFooter({ text: "Use the role selector below to add/remove roles." });
    }
    case "audit": {
      const entries = (0, import_service.getRecentAuditEntries)(guildId, 10);
      const logs = (0, import_service.getRecentLogEntries)(10);
      const auditLines = entries.length > 0 ? entries.map((e) => {
        const ts = `<t:${Math.floor(e.timestamp / 1e3)}:R>`;
        return `\`${ts}\` ${e.whoName ?? e.who}: ${e.what}`;
      }).join("\n") : "No recent audit entries";
      const logLines = logs.length > 0 ? logs.map((l) => `[${l.level}] ${l.message.slice(0, 80)}`).join("\n") : "No recent logs";
      return new import_discord.EmbedBuilder().setTitle("\u{1F4DC} ASHENAI SETTINGS \u2014 AUDIT/LOGS").setColor(BRAND).setDescription("Recent configuration changes and runtime logs.").addFields(
        { name: "Recent Audit Entries", value: auditLines.slice(0, 1024) || "None", inline: false },
        { name: "Recent Logs", value: logLines.slice(0, 1024) || "None", inline: false }
      ).setFooter({ text: "Showing most recent entries." });
    }
    default:
      return new import_discord.EmbedBuilder().setTitle("ASHENAI SETTINGS").setColor(BRAND).setDescription("Unknown category.");
  }
}
function buildCategorySelect() {
  return new import_discord.StringSelectMenuBuilder().setCustomId(`${P.cat}:select`).setPlaceholder("Select a settings category").addOptions(import_definitions2.SETTINGS_CATEGORIES.map((cat) => ({ label: cat.label, value: cat.id, emoji: cat.emoji })));
}
function buildBooleanRows(settings) {
  const rows = [];
  for (let i = 0; i < settings.length; i += 5) {
    const row = new import_discord.ActionRowBuilder();
    for (const s of settings.slice(i, i + 5)) {
      row.addComponents(new import_discord.ButtonBuilder().setCustomId(`${P.tog}:${s.id}`).setLabel(s.label).setStyle(import_discord.ButtonStyle.Secondary));
    }
    rows.push(row);
  }
  return rows;
}
function buildChannelRows(settings) {
  const rows = [];
  const typeMap = {
    Text: import_discord.ChannelType.GuildText,
    Voice: import_discord.ChannelType.GuildVoice,
    Category: import_discord.ChannelType.GuildCategory,
    Announcement: import_discord.ChannelType.GuildAnnouncement,
    Stage: import_discord.ChannelType.GuildStageVoice
  };
  for (const s of settings) {
    const row = new import_discord.ActionRowBuilder();
    const select = new import_discord.ChannelSelectMenuBuilder().setCustomId(`${P.ch}:${s.id}`).setPlaceholder(`Select ${s.label}`).setMinValues(0).setMaxValues(1);
    if (s.channelTypes) {
      select.setChannelTypes(s.channelTypes.map((t) => typeMap[t]).filter((t) => t !== void 0));
    }
    row.addComponents(select);
    rows.push(row);
  }
  return rows;
}
function buildRoleRows() {
  const row = new import_discord.ActionRowBuilder();
  row.addComponents(new import_discord.RoleSelectMenuBuilder().setCustomId(`${P.rl}:staff`).setPlaceholder("Add/remove staff roles").setMinValues(0).setMaxValues(10));
  return [row];
}
function buildNumberRows(settings) {
  const rows = [];
  for (const s of settings) {
    const row = new import_discord.ActionRowBuilder();
    row.addComponents(new import_discord.ButtonBuilder().setCustomId(`${P.num}:${s.id}`).setLabel(`Set ${s.label}`).setStyle(import_discord.ButtonStyle.Primary));
    rows.push(row);
  }
  return rows;
}
function buildCategoryComponents(category) {
  if (category === "overview" || category === "audit") return [];
  const settings = (0, import_definitions2.getSettingsByCategory)(category);
  const components = [];
  const booleans = settings.filter((s) => s.type === "boolean");
  const channels = settings.filter((s) => s.type === "channel");
  const numbers = settings.filter((s) => s.type === "number");
  if (booleans.length > 0) components.push(...buildBooleanRows(booleans));
  if (channels.length > 0) components.push(...buildChannelRows(channels));
  if (numbers.length > 0) components.push(...buildNumberRows(numbers));
  if (category === "staff") components.push(...buildRoleRows());
  return components;
}
function buildFullMessage(category, guildId) {
  const embed = buildEmbed(category, guildId);
  const selectRow = new import_discord.ActionRowBuilder().addComponents(buildCategorySelect());
  return { embeds: [embed], components: [selectRow, ...buildCategoryComponents(category)] };
}
function buildNumberModal(setting, currentValue) {
  const modal = new import_discord.ModalBuilder().setCustomId(`${P.num}:${setting.id}`).setTitle(`Set ${setting.label}`);
  const input = new import_discord.TextInputBuilder().setCustomId("value").setLabel(setting.description).setStyle(import_discord.TextInputStyle.Short).setPlaceholder(`Current: ${(0, import_service.formatValue)(currentValue)}${setting.min !== void 0 ? ` (${setting.min}-${setting.max})` : ""}`).setRequired(true);
  if (setting.min !== void 0) {
    input.setMinLength(1);
    input.setMaxLength(10);
  }
  modal.addComponents(new import_discord.ActionRowBuilder().addComponents(input));
  return modal;
}
async function handleToggle(interaction, settingId, guildId) {
  const session = getSession(guildId, interaction.user.id);
  if (!session || interaction.message.id !== session.messageId) {
    await interaction.reply({ content: "This panel has expired. Use `/settings` to open a new one.", ephemeral: true });
    return;
  }
  const descriptor = (0, import_definitions2.getSettingById)(settingId);
  if (!descriptor || descriptor.type !== "boolean") {
    await interaction.reply({ content: "Invalid setting.", ephemeral: true });
    return;
  }
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  (0, import_service.ensureConfigSections)(config);
  const currentValue = (0, import_service.applySettingValue)(config, settingId);
  if (currentValue === null || currentValue === void 0) {
    await interaction.reply({ content: "Failed to read setting.", ephemeral: true });
    return;
  }
  const newValue = !currentValue;
  (0, import_service.applySettingValue)(config, settingId, newValue);
  (0, import_service.saveSettingChange)(config, {
    settingId,
    category: descriptor.category,
    path: descriptor.path,
    label: descriptor.label,
    oldValue: currentValue,
    newValue,
    guildId,
    userId: interaction.user.id,
    userName: interaction.user.tag,
    timestamp: Date.now()
  }, interaction.user.id, interaction.user.tag);
  await interaction.update(buildFullMessage(session.currentCategory, guildId));
}
async function handleChannelSelect(interaction, settingId, guildId) {
  const session = getSession(guildId, interaction.user.id);
  if (!session || interaction.message.id !== session.messageId) {
    await interaction.reply({ content: "This panel has expired.", ephemeral: true });
    return;
  }
  const descriptor = (0, import_definitions2.getSettingById)(settingId);
  if (!descriptor) {
    await interaction.reply({ content: "Invalid setting.", ephemeral: true });
    return;
  }
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  (0, import_service.ensureConfigSections)(config);
  const newValue = interaction.values?.[0] || void 0;
  const currentValue = (0, import_service.applySettingValue)(config, settingId);
  (0, import_service.applySettingValue)(config, settingId, newValue);
  (0, import_service.saveSettingChange)(config, {
    settingId,
    category: descriptor.category,
    path: descriptor.path,
    label: descriptor.label,
    oldValue: currentValue,
    newValue,
    guildId,
    userId: interaction.user.id,
    userName: interaction.user.tag,
    timestamp: Date.now()
  }, interaction.user.id, interaction.user.tag);
  await interaction.update(buildFullMessage(session.currentCategory, guildId));
}
async function handleRoleSelect(interaction, guildId) {
  const session = getSession(guildId, interaction.user.id);
  if (!session || interaction.message.id !== session.messageId) {
    await interaction.reply({ content: "This panel has expired.", ephemeral: true });
    return;
  }
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  (0, import_service.ensureConfigSections)(config);
  const selectedRoles = interaction.values ?? [];
  const oldRoles = [...config.staff?.roleIds ?? []];
  config.staff.roleIds = selectedRoles;
  (0, import_service.saveSettingChange)(config, {
    settingId: "staff.roleIds",
    category: "staff",
    path: "staff.roleIds",
    label: "Staff Roles",
    oldValue: oldRoles,
    newValue: selectedRoles,
    guildId,
    userId: interaction.user.id,
    userName: interaction.user.tag,
    timestamp: Date.now()
  }, interaction.user.id, interaction.user.tag);
  await interaction.update(buildFullMessage(session.currentCategory, guildId));
}
async function handleNumberModalSubmit(interaction, settingId, guildId) {
  const session = getSession(guildId, interaction.user.id);
  if (!session) {
    await interaction.reply({ content: "This panel has expired.", ephemeral: true });
    return;
  }
  const descriptor = (0, import_definitions2.getSettingById)(settingId);
  if (!descriptor) {
    await interaction.reply({ content: "Invalid setting.", ephemeral: true });
    return;
  }
  const rawValue = interaction.fields.getTextInputValue("value");
  if (!rawValue) {
    await interaction.reply({ content: "No value provided.", ephemeral: true });
    return;
  }
  const validation = (0, import_service.validateSettingValue)(descriptor, rawValue, guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error ?? "Invalid value.", ephemeral: true });
    return;
  }
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  (0, import_service.ensureConfigSections)(config);
  const currentValue = (0, import_service.applySettingValue)(config, settingId);
  (0, import_service.applySettingValue)(config, settingId, validation.normalized);
  (0, import_service.saveSettingChange)(config, {
    settingId,
    category: descriptor.category,
    path: descriptor.path,
    label: descriptor.label,
    oldValue: currentValue,
    newValue: validation.normalized,
    guildId,
    userId: interaction.user.id,
    userName: interaction.user.tag,
    timestamp: Date.now()
  }, interaction.user.id, interaction.user.tag);
  await interaction.reply({ ...buildFullMessage(session.currentCategory, guildId), ephemeral: true });
}
function createSettingsCommand() {
  return {
    data: new import_discord.SlashCommandBuilder().setName("settings").setDescription("Interactive server settings panel for AshenAI").setDefaultMemberPermissions(import_discord.PermissionFlagsBits.ManageGuild).addSubcommand(
      (sub) => sub.setName("update").setDescription("Update a specific setting (advanced/manual)").addStringOption(
        (opt) => opt.setName("category").setDescription("Settings category").setRequired(true).addChoices(
          { name: "Support", value: "support" },
          { name: "Reports", value: "reports" },
          { name: "Appeals", value: "appeals" },
          { name: "AI", value: "ai" },
          { name: "Logging", value: "logging" },
          { name: "Staff", value: "staff" },
          { name: "Moderation", value: "moderation" }
        )
      ).addStringOption(
        (opt) => opt.setName("setting").setDescription("Setting name to update").setRequired(true)
      ).addStringOption(
        (opt) => opt.setName("value").setDescription("New value (true/false, channel ID, role ID, or number)").setRequired(true)
      )
    ),
    async execute(interaction) {
      try {
        if (!interaction.guild) {
          await interaction.editReply("This command can only be used in a server.");
          return;
        }
        if (interaction.options.getSubcommand() === "update") {
          const guildId2 = interaction.guild.id;
          const category = interaction.options.getString("category", true);
          const settingName = interaction.options.getString("setting", true).toLowerCase();
          const rawValue = interaction.options.getString("value", true);
          const settings = (0, import_definitions2.getSettingsByCategory)(category);
          const descriptor = settings.find((s) => {
            const parts = s.id.split(".");
            return parts[parts.length - 1].toLowerCase() === settingName || s.id.toLowerCase().includes(settingName);
          });
          if (!descriptor) {
            await interaction.editReply(`Unknown setting \`${settingName}\` for category \`${category}\`. Use \`/settings\` for the interactive panel.`);
            return;
          }
          const validation = (0, import_service.validateSettingValue)(descriptor, rawValue, guildId2);
          if (!validation.valid) {
            await interaction.editReply(validation.error ?? "Invalid value.");
            return;
          }
          const config = (0, import_guild_config.loadGuildConfig)(guildId2);
          (0, import_service.ensureConfigSections)(config);
          const currentValue = (0, import_service.applySettingValue)(config, descriptor.id);
          (0, import_service.applySettingValue)(config, descriptor.id, validation.normalized);
          (0, import_service.saveSettingChange)(config, {
            settingId: descriptor.id,
            category: descriptor.category,
            path: descriptor.path,
            label: descriptor.label,
            oldValue: currentValue,
            newValue: validation.normalized,
            guildId: guildId2,
            userId: interaction.user.id,
            userName: interaction.user.tag,
            timestamp: Date.now()
          }, interaction.user.id, interaction.user.tag);
          await interaction.editReply(`Updated **${descriptor.label}**: ${(0, import_service.formatValue)(currentValue)} \u2192 ${(0, import_service.formatValue)(validation.normalized)}`);
          return;
        }
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        registerSession(guildId, userId, interaction.channelId, "");
        const { embeds, components } = buildFullMessage("overview", guildId);
        const response = await interaction.editReply({ embeds, components });
        const session = getSession(guildId, userId);
        if (session) session.messageId = response.id;
        const collector = response.createMessageComponentCollector({ filter: (i) => i.user.id === userId, time: 3e5 });
        collector.on("collect", async (i) => {
          try {
            if (!i.guild || i.guild.id !== guildId) {
              await i.reply({ content: "Wrong server.", ephemeral: true });
              return;
            }
            const customId = i.customId;
            if (customId === `${P.cat}:select` && i.isStringSelectMenu()) {
              const cat = i.values[0];
              const sess = getSession(guildId, userId);
              if (sess) sess.currentCategory = cat;
              await i.update(buildFullMessage(cat, guildId));
              return;
            }
            if (customId.startsWith(`${P.tog}:`)) {
              await handleToggle(i, customId.slice(P.tog.length + 1), guildId);
              return;
            }
            if (customId.startsWith(`${P.ch}:`)) {
              await handleChannelSelect(i, customId.slice(P.ch.length + 1), guildId);
              return;
            }
            if (customId === `${P.rl}:staff`) {
              await handleRoleSelect(i, guildId);
              return;
            }
            if (customId.startsWith(`${P.num}:`)) {
              const settingId = customId.slice(P.num.length + 1);
              const descriptor = (0, import_definitions2.getSettingById)(settingId);
              if (!descriptor) {
                await i.reply({ content: "Invalid setting.", ephemeral: true });
                return;
              }
              const config = (0, import_guild_config.loadGuildConfig)(guildId);
              const currentValue = (0, import_service.applySettingValue)(config, settingId);
              await i.showModal(buildNumberModal(descriptor, currentValue));
              return;
            }
          } catch (error) {
            import_logger.logger.error("Settings panel error:", error instanceof Error ? error.message : String(error));
            try {
              if (!i.replied && !i.deferred) await i.reply({ content: "An error occurred.", ephemeral: true });
            } catch {
            }
          }
        });
        collector.on("end", async () => {
          removeSession(guildId, userId);
          try {
            await interaction.editReply({ components: [] }).catch(() => {
            });
          } catch {
          }
        });
        (0, import_audit.recordAudit)({ who: interaction.user.id, whoName: interaction.user.tag, what: "Opened /settings panel", where: "discord", guildId, result: "success" });
      } catch (error) {
        import_logger.logger.error("/settings failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply("Failed to load settings. Please try again.");
        } catch {
        }
      }
    }
  };
}
function createSettingsUpdateCommand() {
  return {
    data: new import_discord.SlashCommandBuilder().setName("settings-update").setDescription("Update a specific setting (advanced/manual)").setDefaultMemberPermissions(import_discord.PermissionFlagsBits.ManageGuild).addStringOption((opt) => opt.setName("category").setDescription("Settings category").setRequired(true).addChoices(
      { name: "Support", value: "support" },
      { name: "Reports", value: "reports" },
      { name: "Appeals", value: "appeals" },
      { name: "AI", value: "ai" },
      { name: "Logging", value: "logging" },
      { name: "Staff", value: "staff" },
      { name: "Moderation", value: "moderation" }
    )).addStringOption((opt) => opt.setName("setting").setDescription("Setting name to update").setRequired(true)).addStringOption((opt) => opt.setName("value").setDescription("New value (true/false, channel ID, role ID, or number)").setRequired(true)),
    async execute(interaction) {
      try {
        if (!interaction.guild) {
          await interaction.editReply("This command can only be used in a server.");
          return;
        }
        const guildId = interaction.guild.id;
        const category = interaction.options.getString("category", true);
        const settingName = interaction.options.getString("setting", true).toLowerCase();
        const rawValue = interaction.options.getString("value", true);
        const settings = (0, import_definitions2.getSettingsByCategory)(category);
        const descriptor = settings.find((s) => {
          const parts = s.id.split(".");
          return parts[parts.length - 1].toLowerCase() === settingName || s.id.toLowerCase().includes(settingName);
        });
        if (!descriptor) {
          await interaction.editReply(`Unknown setting \`${settingName}\` for category \`${category}\`. Use \`/settings\` for the interactive panel.`);
          return;
        }
        const validation = (0, import_service.validateSettingValue)(descriptor, rawValue, guildId);
        if (!validation.valid) {
          await interaction.editReply(validation.error ?? "Invalid value.");
          return;
        }
        const config = (0, import_guild_config.loadGuildConfig)(guildId);
        (0, import_service.ensureConfigSections)(config);
        const currentValue = (0, import_service.applySettingValue)(config, descriptor.id);
        (0, import_service.applySettingValue)(config, descriptor.id, validation.normalized);
        (0, import_service.saveSettingChange)(config, {
          settingId: descriptor.id,
          category: descriptor.category,
          path: descriptor.path,
          label: descriptor.label,
          oldValue: currentValue,
          newValue: validation.normalized,
          guildId,
          userId: interaction.user.id,
          userName: interaction.user.tag,
          timestamp: Date.now()
        }, interaction.user.id, interaction.user.tag);
        await interaction.editReply(`Updated **${descriptor.label}**: ${(0, import_service.formatValue)(currentValue)} \u2192 ${(0, import_service.formatValue)(validation.normalized)}`);
      } catch (error) {
        import_logger.logger.error("/settings-update failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply("Failed to update setting. Please try again.");
        } catch {
        }
      }
    }
  };
}
async function handleSettingsModalSubmit(interaction) {
  try {
    const customId = interaction.customId;
    if (!customId.startsWith(`${P.num}:`)) return;
    const settingId = customId.slice(P.num.length + 1);
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: "Must be used in a server.", ephemeral: true });
      return;
    }
    await handleNumberModalSubmit(interaction, settingId, guildId);
  } catch (error) {
    import_logger.logger.error("Settings modal error:", error instanceof Error ? error.message : String(error));
    try {
      if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "An error occurred.", ephemeral: true });
    } catch {
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createSettingsCommand,
  createSettingsUpdateCommand,
  handleSettingsModalSubmit
});
