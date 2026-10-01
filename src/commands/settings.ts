import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType as DiscordChannelType,
  type ModalSubmitInteraction,
  InteractionContextType,
  MessageFlags,
} from "discord.js";
import { AshenCommand } from "../commands/definitions";
import { loadGuildConfig } from "../core/guild-config";
import { recordAudit } from "../security/audit";
import { logger } from "../logger";
import {
  SETTINGS_CATEGORIES,
  getSettingsByCategory,
  getSettingById,
} from "../settings/definitions";
import type {
  SettingDescriptor,
  SettingsCategory,
  PanelSession,
} from "../settings/types";
import {
  validateSettingValue,
  applySettingValue,
  saveSettingChange,
  getOverviewData,
  getRecentAuditEntries,
  formatValue,
  formatChannelMention,
  formatRoleMention,
  ensureConfigSections,
} from "../settings/service";

const activeSessions = new Map<string, PanelSession>();
function sessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}
function registerSession(guildId: string, userId: string, channelId: string, messageId: string): PanelSession {
  const key = sessionKey(guildId, userId);
  const session: PanelSession = { guildId, userId, channelId, messageId, createdAt: Date.now(), currentCategory: "overview" };
  activeSessions.set(key, session);
  return session;
}
function getSession(guildId: string, userId: string): PanelSession | undefined {
  const key = sessionKey(guildId, userId);
  const session = activeSessions.get(key);
  if (!session) return undefined;
  if (Date.now() - session.createdAt > 300_000) { activeSessions.delete(key); return undefined; }
  return session;
}
function removeSession(guildId: string, userId: string): void {
  activeSessions.delete(sessionKey(guildId, userId));
}

const P = { cat: "as", tog: "at", ch: "ac", rl: "ar", num: "an", str: "st" } as const;
const BRAND = 0x7c3aed;

/**
 * True for settings-panel modal submissions (`st:` string modals and
 * `an:` number modals). The client-level dispatcher must use this —
 * gating on a single hardcoded prefix silently drops every other
 * modal type.
 */
export function isSettingsModalCustomId(customId: string): boolean {
  return customId.startsWith(`${P.str}:`) || customId.startsWith(`${P.num}:`);
}

/**
 * True for every settings-panel COMPONENT interaction (selects,
 * toggles, channel/role pickers, modal-opening buttons and nav).
 * Used by the global panel router in index.ts.
 */
export function isSettingsComponentCustomId(customId: string): boolean {
  return Object.values(P).some((prefix) => customId.startsWith(`${prefix}:`));
}

/**
 * The panel no longer relies on a 5-minute message collector: a
 * restart (or an expired session entry) must not brick a panel that
 * is still on screen. When no live session exists, rebuild one from
 * the panel message the interaction is attached to — but only if
 * that message actually carries settings-panel components.
 */
function messageLooksLikePanel(message: unknown): boolean {
  const rows = (message as { components?: Array<{ components?: Array<{ customId?: string }> }> })?.components;
  if (!Array.isArray(rows)) return false;
  return rows.some((row) =>
    (row?.components ?? []).some((c) => typeof c?.customId === "string" && isSettingsComponentCustomId(c.customId)),
  );
}

function resolveSession(interaction: { message?: unknown; user: { id: string }; channelId?: string | null }, guildId: string): PanelSession | undefined {
  const existing = getSession(guildId, interaction.user.id);
  if (existing) return existing;
  const message = interaction.message as { id?: string; channelId?: string } | undefined;
  if (!message?.id || !messageLooksLikePanel(message)) return undefined;
  return registerSession(guildId, interaction.user.id, message.channelId ?? interaction.channelId ?? "", message.id);
}

const EXPIRED_PANEL_MSG = "This panel has expired. Use `/settings` to open a new one.";
const NO_PERM_PANEL_MSG = "You need the Manage Server permission to change settings.";

/**
 * Shared gate for every panel write (toggle, selects, modals).
 * Order: permission → session → message binding.
 *
 * Permissions are re-checked on every interaction: a member demoted
 * while a panel is open loses write access immediately — the session
 * alone must never authorize a write. `memberPermissions` is present
 * on guild interactions; missing ⇒ fail closed. Message binding
 * requires the interaction to be attached to the exact panel message
 * the session was created for.
 */
function panelDenyReason(
  interaction: { memberPermissions?: { has?: (perm: bigint) => boolean } | null },
  session: PanelSession | undefined,
  opts: { requireMessageBinding?: boolean } = {},
): string | undefined {
  const perms = interaction.memberPermissions;
  if (!perms || typeof perms.has !== "function" || !perms.has(PermissionFlagsBits.ManageGuild)) {
    return NO_PERM_PANEL_MSG;
  }
  if (!session) return EXPIRED_PANEL_MSG;
  if (opts.requireMessageBinding) {
    const messageId = (interaction as { message?: { id?: string } }).message?.id;
    if (!messageId || messageId !== session.messageId) return EXPIRED_PANEL_MSG;
  }
  return undefined;
}

function buildEmbed(category: SettingsCategory, guildId: string): EmbedBuilder {
  const config = loadGuildConfig(guildId);
  ensureConfigSections(config);
  switch (category) {
    case "overview": {
      const ov = getOverviewData(config);
      const mods = ov.enabledModules.length > 0 ? ov.enabledModules.map((m) => `\u2705 ${m}`).join("\n") : "No modules enabled";
      const chs = ov.configuredChannels.length > 0 ? ov.configuredChannels.map((c) => `${c.label}: ${formatChannelMention(c.id)}`).join("\n") : "No channels configured";
      const roles = ov.staffRoles.length > 0 ? ov.staffRoles.map((r) => formatRoleMention(r)).join(", ") : "No staff roles";
      const lc = ov.lastConfigChange ? `<t:${Math.floor(ov.lastConfigChange / 1000)}:R>` : "Never";
      return new EmbedBuilder().setTitle("\uD83C\uDFE0 ASHENAI SETTINGS \u2014 OVERVIEW").setColor(BRAND)
        .setDescription("Server configuration overview.")
        .addFields(
          { name: "Enabled Modules", value: mods, inline: true },
          { name: "Configured Channels", value: chs, inline: true },
          { name: "Staff Roles", value: roles, inline: false },
          { name: "Logging", value: ov.loggingEnabled ? "\u2705 Active" : "\u274C Inactive", inline: true },
          { name: "Last Change", value: lc, inline: true },
        ).setFooter({ text: "Select a category below to configure." });
    }
    case "moderation": {
      const m = config.moderation;
      return new EmbedBuilder().setTitle("\uD83D\uDEE1\uFE0F ASHENAI SETTINGS \u2014 MODERATION").setColor(BRAND)
        .setDescription("Configure moderation behavior.")
        .addFields(
          { name: "Enabled", value: m.enabled ? "\u2705" : "\u274C", inline: true },
          { name: "Default Timeout", value: `${m.defaultTimeoutMinutes} min`, inline: true },
          { name: "Max Warnings", value: `${m.maxWarnBeforeAction}`, inline: true },
          { name: "Auto Ban", value: m.autoBanOnMaxWarn ? "\u2705" : "\u274C", inline: true },
        ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "support": {
      const s = config.support!;
      return new EmbedBuilder().setTitle("\uD83C\uDFAB ASHENAI SETTINGS \u2014 SUPPORT").setColor(BRAND)
        .setDescription("Configure the support ticket system.")
        .addFields(
          { name: "Enabled", value: s.enabled ? "\u2705" : "\u274C", inline: true },
          { name: "Support Channel", value: formatChannelMention(s.channelId), inline: true },
          { name: "Category", value: formatChannelMention(s.categoryId), inline: true },
          { name: "General Help", value: s.allowGeneralHelp ? "\u2705" : "\u274C", inline: true },
          { name: "Reports", value: s.allowReports ? "\u2705" : "\u274C", inline: true },
          { name: "Appeals", value: s.allowAppeals ? "\u2705" : "\u274C", inline: true },
        ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "reports": {
      const r = config.reports!;
      return new EmbedBuilder().setTitle("\uD83D\uDEA8 ASHENAI SETTINGS \u2014 REPORTS").setColor(BRAND)
        .setDescription("Configure the user report system.")
        .addFields(
          { name: "Enabled", value: r.enabled ? "\u2705" : "\u274C", inline: true },
          { name: "Category", value: formatChannelMention(r.categoryId), inline: true },
          { name: "Require Evidence", value: r.requireEvidence ? "\u2705" : "\u274C", inline: true },
          { name: "AI Analysis", value: r.aiAnalysisEnabled ? "\u2705" : "\u274C", inline: true },
          { name: "Auto Escalate", value: r.autoEscalateHighRisk ? "\u2705" : "\u274C", inline: true },
        ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "appeals": {
      const a = config.appeals!;
      return new EmbedBuilder().setTitle("\uD83D\uDD28 ASHENAI SETTINGS \u2014 APPEALS").setColor(BRAND)
        .setDescription("Configure the ban appeal system.")
        .addFields(
          { name: "Enabled", value: a.enabled ? "\u2705" : "\u274C", inline: true },
          { name: "Category", value: formatChannelMention(a.categoryId), inline: true },
          { name: "AI Analysis", value: a.aiAnalysisEnabled ? "\u2705" : "\u274C", inline: true },
        ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "ai": {
      const ai = config.supportAi!;
      return new EmbedBuilder().setTitle("\uD83E\uDD16 ASHENAI SETTINGS \u2014 AI").setColor(BRAND)
        .setDescription("Configure AI behavior in support cases.")
        .addFields(
          { name: "AI Enabled", value: ai.enabled ? "\u2705" : "\u274C", inline: true },
          { name: "Mod Actions", value: ai.allowModerationActions ? "\u2705" : "\u274C", inline: true },
          { name: "Confirmation", value: ai.requireConfirmation ? "\u2705 Required" : "\u274C Not Required", inline: true },
          { name: "Web Research", value: ai.allowWebResearch ? "\u2705" : "\u274C", inline: true },
        ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "logging": {
      const l = config.supportLogging!;
      return new EmbedBuilder().setTitle("\uD83D\uDCCB ASHENAI SETTINGS \u2014 LOGGING").setColor(BRAND)
        .setDescription("Configure support event logging.")
        .addFields(
          { name: "Enabled", value: l.enabled ? "\u2705" : "\u274C", inline: true },
          { name: "Log Channel", value: formatChannelMention(l.channelId), inline: true },
          { name: "Moderation", value: l.includeModeration ? "\u2705" : "\u274C", inline: true },
          { name: "Tickets", value: l.includeTickets ? "\u2705" : "\u274C", inline: true },
          { name: "Reports", value: l.includeReports ? "\u2705" : "\u274C", inline: true },
          { name: "Appeals", value: l.includeAppeals ? "\u2705" : "\u274C", inline: true },
          { name: "AI Actions", value: l.includeAiActions ? "\u2705" : "\u274C", inline: true },
        ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "staff": {
      const st = config.staff!;
      const roleList = st.roleIds.length > 0 ? st.roleIds.map((id) => `<@&${id}>`).join(", ") : "No staff roles configured";
      return new EmbedBuilder().setTitle("\uD83D\uDC65 ASHENAI SETTINGS \u2014 STAFF").setColor(BRAND)
        .setDescription("Configure staff roles for case management.")
        .addFields({ name: "Staff Roles", value: roleList })
        .setFooter({ text: "Use the role selector below to add/remove roles." });
    }
    case "social": {
      const s = config.social!;
      return new EmbedBuilder().setTitle("\uD83D\uDCAC ASHENAI SETTINGS \u2014 SOCIAL").setColor(BRAND)
        .setDescription("Configure AI Social autonomous behavior.")
        .addFields(
          { name: "Enabled", value: s.enabled ? "\u2705" : "\u274C", inline: true },
          { name: "Global Cooldown", value: `${s.globalCooldownMs}ms`, inline: true },
          { name: "Max Responses/Hour", value: `${s.maxResponsesPerHour}`, inline: true },
          { name: "Anime Actions", value: s.animeActions ? "\u2705" : "\u274C", inline: true },
          { name: "Custom Reactions", value: s.customReactions ? "\u2705" : "\u274C", inline: true },
          { name: "Custom Emoji", value: s.customEmoji ? "\u2705" : "\u274C", inline: true },
          { name: "Rivalry Mode", value: s.rivalryMode ? "\u2705" : "\u274C", inline: true },
          { name: "Debate Mode", value: s.debateMode ? "\u2705" : "\u274C", inline: true },
        ).setFooter({ text: "Use buttons to toggle, or select another category." });
    }
    case "personality": {
      const p = config.personality;
      return new EmbedBuilder().setTitle("\uD83C\uDFAD ASHENAI SETTINGS \u2014 PERSONALITY").setColor(BRAND)
        .setDescription("Configure AshenAI's personality and tone.")
        .addFields(
          { name: "Bot Name", value: p.name || "AshenAI", inline: true },
          { name: "Tone", value: p.tone || "friendly", inline: true },
          { name: "Instructions", value: p.customInstructions || "None", inline: false },
        ).setFooter({ text: "Use the number modal to edit name or tone." });
    }
    case "audit": {
      const entries = getRecentAuditEntries(guildId, 10);
      const auditLines = entries.length > 0
        ? entries.map((e) => { const ts = `<t:${Math.floor(e.timestamp / 1000)}:R>`; return `\`${ts}\` ${e.whoName ?? e.who}: ${e.what}`; }).join("\n")
        : "No recent audit entries";
      /*
       * Guild-scoped audit entries ONLY. Global runtime logs
       * (getRecentLogEntries) are intentionally NOT shown here:
       * they are not filtered by guild and would leak other
       * servers' activity into this guild-facing panel.
       */
      return new EmbedBuilder().setTitle("\uD83D\uDCDC ASHENAI SETTINGS \u2014 AUDIT").setColor(BRAND)
        .setDescription("Recent configuration changes for this server.")
        .addFields(
          { name: "Recent Audit Entries", value: auditLines.slice(0, 1024) || "None", inline: false },
        ).setFooter({ text: "Showing most recent entries." });
    }
    default:
      return new EmbedBuilder().setTitle("ASHENAI SETTINGS").setColor(BRAND).setDescription("Unknown category.");
  }
}

function buildCategorySelect(): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(`${P.cat}:select`)
    .setPlaceholder("Select a settings category")
    .addOptions(SETTINGS_CATEGORIES.map((cat) => ({ label: cat.label, value: cat.id, emoji: cat.emoji })));
}

function buildBooleanRows(settings: SettingDescriptor[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < settings.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const s of settings.slice(i, i + 5)) {
      row.addComponents(new ButtonBuilder().setCustomId(`${P.tog}:${s.id}`).setLabel(s.label).setStyle(ButtonStyle.Secondary));
    }
    rows.push(row);
  }
  return rows;
}

function buildChannelRows(settings: SettingDescriptor[]): ActionRowBuilder<ChannelSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<ChannelSelectMenuBuilder>[] = [];
  const typeMap: Record<string, number> = {
    Text: DiscordChannelType.GuildText, Voice: DiscordChannelType.GuildVoice,
    Category: DiscordChannelType.GuildCategory, Announcement: DiscordChannelType.GuildAnnouncement,
    Stage: DiscordChannelType.GuildStageVoice,
  };
  for (const s of settings) {
    const row = new ActionRowBuilder<ChannelSelectMenuBuilder>();
    const select = new ChannelSelectMenuBuilder()
      .setCustomId(`${P.ch}:${s.id}`).setPlaceholder(`Select ${s.label}`).setMinValues(0).setMaxValues(1);
    if (s.channelTypes) {
      select.setChannelTypes(s.channelTypes.map((t) => typeMap[t]).filter((t) => t !== undefined) as any[]);
    }
    row.addComponents(select);
    rows.push(row);
  }
  return rows;
}

function buildRoleRows(): ActionRowBuilder<RoleSelectMenuBuilder>[] {
  const row = new ActionRowBuilder<RoleSelectMenuBuilder>();
  row.addComponents(new RoleSelectMenuBuilder().setCustomId(`${P.rl}:staff`).setPlaceholder("Add/remove staff roles").setMinValues(0).setMaxValues(10));
  return [row];
}

function buildNumberRows(settings: SettingDescriptor[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const s of settings) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(new ButtonBuilder().setCustomId(`${P.num}:${s.id}`).setLabel(`Set ${s.label}`).setStyle(ButtonStyle.Primary));
    rows.push(row);
  }
  return rows;
}

function buildStringRows(settings: SettingDescriptor[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const s of settings) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(new ButtonBuilder().setCustomId(`${P.str}:${s.id}`).setLabel(`Set ${s.label}`).setStyle(ButtonStyle.Primary));
    rows.push(row);
  }
  return rows;
}

function buildCategoryComponents(category: SettingsCategory): ActionRowBuilder<any>[] {
  if (category === "overview" || category === "audit") return [];
  const settings = getSettingsByCategory(category);
  const components: ActionRowBuilder<any>[] = [];
  const booleans = settings.filter((s) => s.type === "boolean");
  const channels = settings.filter((s) => s.type === "channel");
  const numbers = settings.filter((s) => s.type === "number");
  const strings = settings.filter((s) => s.type === "string");
  if (booleans.length > 0) components.push(...buildBooleanRows(booleans));
  if (channels.length > 0) components.push(...buildChannelRows(channels));
  if (numbers.length > 0) components.push(...buildNumberRows(numbers));
  if (strings.length > 0) components.push(...buildStringRows(strings));
  if (category === "staff") components.push(...buildRoleRows());
  return components;
}

function buildNavRow(category: SettingsCategory): ActionRowBuilder<ButtonBuilder> {
  const onOverview = category === "overview";
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("as:back").setLabel("← Back").setStyle(ButtonStyle.Secondary).setDisabled(onOverview),
    new ButtonBuilder().setCustomId("as:home").setLabel("🏠 Home").setStyle(ButtonStyle.Secondary).setDisabled(onOverview),
    new ButtonBuilder().setCustomId("as:close").setLabel("✖ Close").setStyle(ButtonStyle.Danger),
  );
}

function buildFullMessage(category: SettingsCategory, guildId: string): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const embed = buildEmbed(category, guildId);
  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildCategorySelect());
  return { embeds: [embed], components: [buildNavRow(category), selectRow, ...buildCategoryComponents(category)] };
}

function buildNumberModal(setting: SettingDescriptor, currentValue: unknown): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`${P.num}:${setting.id}`).setTitle(`Set ${setting.label}`);
  const input = new TextInputBuilder().setCustomId("value").setLabel(setting.description).setStyle(TextInputStyle.Short)
    .setPlaceholder(`Current: ${formatValue(currentValue)}${setting.min !== undefined ? ` (${setting.min}-${setting.max})` : ""}`)
    .setRequired(true);
  if (setting.min !== undefined) { input.setMinLength(1); input.setMaxLength(10); }
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

function buildStringModal(setting: SettingDescriptor, currentValue: unknown): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`${P.str}:${setting.id}`).setTitle(`Set ${setting.label}`);
  const input = new TextInputBuilder().setCustomId("value").setLabel(setting.description).setStyle(TextInputStyle.Short)
    .setPlaceholder(`Current: ${formatValue(currentValue)}${setting.min !== undefined ? ` (${setting.min}-${setting.max} chars)` : ""}`)
    .setRequired(true);
  if (setting.min !== undefined) { input.setMinLength(1); input.setMaxLength(setting.max ?? 100); }
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

async function handleToggle(interaction: any, settingId: string, guildId: string): Promise<void> {
  const session = resolveSession(interaction, guildId);
  const deny = panelDenyReason(interaction, session, { requireMessageBinding: true });
  if (deny) { await interaction.reply({ content: deny, flags: MessageFlags.Ephemeral }); return; }
  const descriptor = getSettingById(settingId);
  if (!descriptor || descriptor.type !== "boolean") {
    await interaction.reply({ content: "Invalid setting.", flags: MessageFlags.Ephemeral });
    return;
  }
  const config = loadGuildConfig(guildId);
  ensureConfigSections(config);
  const currentValue = applySettingValue(config, settingId);
  if (currentValue === null || currentValue === undefined) {
    await interaction.reply({ content: "Failed to read setting.", flags: MessageFlags.Ephemeral });
    return;
  }
  const newValue = !currentValue;
  applySettingValue(config, settingId, newValue);
  saveSettingChange(config, {
    settingId, category: descriptor.category, path: descriptor.path, label: descriptor.label,
    oldValue: currentValue, newValue, guildId, userId: interaction.user.id, userName: interaction.user.tag, timestamp: Date.now(),
  }, interaction.user.id, interaction.user.tag);
  if (session) session.currentCategory = descriptor.category;
  await interaction.update(buildFullMessage(descriptor.category, guildId));
}

async function handleChannelSelect(interaction: any, settingId: string, guildId: string): Promise<void> {
  const session = resolveSession(interaction, guildId);
  const deny = panelDenyReason(interaction, session, { requireMessageBinding: true });
  if (deny) { await interaction.reply({ content: deny, flags: MessageFlags.Ephemeral }); return; }
  const descriptor = getSettingById(settingId);
  if (!descriptor) { await interaction.reply({ content: "Invalid setting.", flags: MessageFlags.Ephemeral }); return; }
  const config = loadGuildConfig(guildId);
  ensureConfigSections(config);
  const newValue = interaction.values?.[0] || undefined;
  const currentValue = applySettingValue(config, settingId);
  applySettingValue(config, settingId, newValue);
  saveSettingChange(config, {
    settingId, category: descriptor.category, path: descriptor.path, label: descriptor.label,
    oldValue: currentValue, newValue, guildId, userId: interaction.user.id, userName: interaction.user.tag, timestamp: Date.now(),
  }, interaction.user.id, interaction.user.tag);
  if (session) session.currentCategory = descriptor.category;
  await interaction.update(buildFullMessage(descriptor.category, guildId));
}

async function handleRoleSelect(interaction: any, guildId: string): Promise<void> {
  const session = resolveSession(interaction, guildId);
  const deny = panelDenyReason(interaction, session, { requireMessageBinding: true });
  if (deny) { await interaction.reply({ content: deny, flags: MessageFlags.Ephemeral }); return; }
  const config = loadGuildConfig(guildId);
  ensureConfigSections(config);
  const selectedRoles = (interaction.values ?? []).filter((id: string) => id !== guildId);
  const oldRoles = [...(config.staff?.roleIds ?? [])];
  config.staff!.roleIds = selectedRoles;
  saveSettingChange(config, {
    settingId: "staff.roleIds", category: "staff", path: "staff.roleIds", label: "Staff Roles",
    oldValue: oldRoles, newValue: selectedRoles, guildId, userId: interaction.user.id, userName: interaction.user.tag, timestamp: Date.now(),
  }, interaction.user.id, interaction.user.tag);
  if (session) session.currentCategory = "staff";
  await interaction.update(buildFullMessage("staff", guildId));
}

async function handleNumberModalSubmit(interaction: ModalSubmitInteraction, settingId: string, guildId: string): Promise<void> {
  const session = resolveSession(interaction, guildId);
  const deny = panelDenyReason(interaction, session, { requireMessageBinding: true });
  if (deny) { await interaction.reply({ content: deny, flags: MessageFlags.Ephemeral }); return; }
  const descriptor = getSettingById(settingId);
  if (!descriptor) { await interaction.reply({ content: "Invalid setting.", flags: MessageFlags.Ephemeral }); return; }
  const rawValue = interaction.fields.getTextInputValue("value");
  if (!rawValue) { await interaction.reply({ content: "No value provided.", flags: MessageFlags.Ephemeral }); return; }
  const validation = validateSettingValue(descriptor, rawValue, guildId);
  if (!validation.valid) { await interaction.reply({ content: validation.error ?? "Invalid value.", flags: MessageFlags.Ephemeral }); return; }
  const config = loadGuildConfig(guildId);
  ensureConfigSections(config);
  const currentValue = applySettingValue(config, settingId);
  applySettingValue(config, settingId, validation.normalized);
  saveSettingChange(config, {
    settingId, category: descriptor.category, path: descriptor.path, label: descriptor.label,
    oldValue: currentValue, newValue: validation.normalized, guildId, userId: interaction.user.id, userName: interaction.user.tag, timestamp: Date.now(),
  }, interaction.user.id, interaction.user.tag);
  if (session) session.currentCategory = descriptor.category;
  await interaction.reply({ ...buildFullMessage(descriptor.category, guildId), flags: MessageFlags.Ephemeral });
}

async function handleStringModalSubmit(interaction: ModalSubmitInteraction, settingId: string, guildId: string): Promise<void> {
  const session = resolveSession(interaction, guildId);
  const deny = panelDenyReason(interaction, session, { requireMessageBinding: true });
  if (deny) { await interaction.reply({ content: deny, flags: MessageFlags.Ephemeral }); return; }
  const descriptor = getSettingById(settingId);
  if (!descriptor) { await interaction.reply({ content: "Invalid setting.", flags: MessageFlags.Ephemeral }); return; }
  const rawValue = interaction.fields.getTextInputValue("value");
  if (!rawValue) { await interaction.reply({ content: "No value provided.", flags: MessageFlags.Ephemeral }); return; }
  const validation = validateSettingValue(descriptor, rawValue, guildId);
  if (!validation.valid) { await interaction.reply({ content: validation.error ?? "Invalid value.", flags: MessageFlags.Ephemeral }); return; }
  const config = loadGuildConfig(guildId);
  ensureConfigSections(config);
  const currentValue = applySettingValue(config, settingId);
  applySettingValue(config, settingId, validation.normalized);
  saveSettingChange(config, {
    settingId, category: descriptor.category, path: descriptor.path, label: descriptor.label,
    oldValue: currentValue, newValue: validation.normalized, guildId, userId: interaction.user.id, userName: interaction.user.tag, timestamp: Date.now(),
  }, interaction.user.id, interaction.user.tag);
  if (session) session.currentCategory = descriptor.category;
  await interaction.reply({ ...buildFullMessage(descriptor.category, guildId), flags: MessageFlags.Ephemeral });
}

export function createSettingsCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("settings")
      .setDescription("Interactive server settings panel for AshenAI")
      .setContexts(InteractionContextType.Guild)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      /*
       * NO subcommands: Discord makes a command WITH subcommands
       * impossible to invoke bare, and the bare invocation is what
       * opens the persistent Settings Center panel. The legacy
       * `/settings update <category> <setting> <value>` path moved
       * into the panel (select → toggle/modal) in this same module.
       */
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        if (!interaction.guild) { await interaction.editReply("This command can only be used in a server."); return; }
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        removeSession(guildId, userId);
        registerSession(guildId, userId, interaction.channelId, "");
        const { embeds, components } = buildFullMessage("overview", guildId);
        const response = await interaction.editReply({ embeds, components });
        const session = getSession(guildId, userId);
        if (session && response?.id) session.messageId = response.id;
        recordAudit({ who: interaction.user.id, whoName: interaction.user.tag, what: "Opened /settings panel", where: "discord", guildId, result: "success" });
      } catch (error) {
        logger.error("/settings failed:", error instanceof Error ? error.message : String(error));
        try { await interaction.editReply("Failed to load settings. Please try again."); } catch {}
      }
    },
  };
}

/**
 * Global component router for the settings panel (buttons, selects,
 * modal-opening inputs). Replaces the old 5-minute message
 * collector: panels now persist until closed and survive restarts
 * because the session is rebuilt from the panel message.
 */
export async function handleSettingsComponent(interaction: any): Promise<void> {
  try {
    const guildId = interaction.guildId as string | null;
    if (!guildId) {
      await interaction.reply({ content: "Must be used in a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const customId: string = interaction.customId;
    const session = resolveSession(interaction, guildId);
    const deny = panelDenyReason(interaction, session, { requireMessageBinding: true });
    if (deny) { await interaction.reply({ content: deny, flags: MessageFlags.Ephemeral }); return; }

    // Nav first: `as:home`/`as:back`/`as:close` share the `as:` prefix.
    if (customId === "as:close") {
      removeSession(guildId, interaction.user.id);
      await interaction.update({ embeds: [closedSettingsPanelEmbed()], components: [] });
      return;
    }
    if (customId === "as:home") {
      if (session) session.currentCategory = "overview";
      await interaction.update(buildFullMessage("overview", guildId));
      return;
    }
    if (customId === "as:back") {
      const target = session?.previousCategory ?? "overview";
      if (session) { session.previousCategory = session.currentCategory; session.currentCategory = target; }
      await interaction.update(buildFullMessage(target, guildId));
      return;
    }
    if (customId === `${P.cat}:select` && interaction.isStringSelectMenu()) {
      const cat = interaction.values[0] as SettingsCategory;
      if (session) { session.previousCategory = session.currentCategory; session.currentCategory = cat; }
      await interaction.update(buildFullMessage(cat, guildId));
      return;
    }
    if (customId.startsWith(`${P.tog}:`)) { await handleToggle(interaction, customId.slice(P.tog.length + 1), guildId); return; }
    if (customId.startsWith(`${P.ch}:`)) { await handleChannelSelect(interaction, customId.slice(P.ch.length + 1), guildId); return; }
    if (customId === `${P.rl}:staff`) { await handleRoleSelect(interaction, guildId); return; }
    if (customId.startsWith(`${P.num}:`)) {
      const settingId = customId.slice(P.num.length + 1);
      const descriptor = getSettingById(settingId);
      if (!descriptor) { await interaction.reply({ content: "Invalid setting.", flags: MessageFlags.Ephemeral }); return; }
      const config = loadGuildConfig(guildId);
      const currentValue = applySettingValue(config, settingId);
      await interaction.showModal(buildNumberModal(descriptor, currentValue));
      return;
    }
    if (customId.startsWith(`${P.str}:`)) {
      const settingId = customId.slice(P.str.length + 1);
      const descriptor = getSettingById(settingId);
      if (!descriptor) { await interaction.reply({ content: "Invalid setting.", flags: MessageFlags.Ephemeral }); return; }
      const config = loadGuildConfig(guildId);
      const currentValue = applySettingValue(config, settingId);
      await interaction.showModal(buildStringModal(descriptor, currentValue));
      return;
    }
  } catch (error) {
    logger.error("Settings panel error:", error instanceof Error ? error.message : String(error));
    await replyPanelError(interaction);
  }
}

/** Log-safe error reply that also follows up on already-deferred interactions. */
async function replyPanelError(interaction: { replied?: boolean; deferred?: boolean; reply?: (p: any) => Promise<unknown>; editReply?: (p: any) => Promise<unknown> }): Promise<void> {
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply?.("An error occurred.");
    } else if (!interaction.replied) {
      await interaction.reply?.({ content: "An error occurred.", flags: MessageFlags.Ephemeral });
    }
  } catch {
    // Interaction may have expired
  }
}

function closedSettingsPanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🔒 Settings panel closed")
    .setDescription("Panel closed. Re-run `/settings` to open it again.")
    .setColor(0x6b7280);
}

export async function handleSettingsModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  try {
    const customId = interaction.customId;
    if (customId.startsWith(`${P.str}:`)) {
      const settingId = customId.slice(P.str.length + 1);
      const guildId = interaction.guildId;
      if (!guildId) { await interaction.reply({ content: "Must be used in a server.", flags: MessageFlags.Ephemeral }); return; }
      await handleStringModalSubmit(interaction, settingId, guildId);
      return;
    }
    if (!customId.startsWith(`${P.num}:`)) return;
    const settingId = customId.slice(P.num.length + 1);
    const guildId = interaction.guildId;
    if (!guildId) { await interaction.reply({ content: "Must be used in a server.", flags: MessageFlags.Ephemeral }); return; }
    await handleNumberModalSubmit(interaction, settingId, guildId);
  } catch (error) {
    logger.error("Settings modal error:", error instanceof Error ? error.message : String(error));
    await replyPanelError(interaction);
  }
}
