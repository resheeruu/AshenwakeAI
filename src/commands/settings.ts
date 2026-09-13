import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { AshenCommand } from "../commands/definitions";
import { loadGuildConfig, saveGuildConfig } from "../core/guild-config";
import { recordAudit } from "../security/audit";
import { logger } from "../logger";

const SETTINGS_CATEGORIES = [
  { label: "Moderation", value: "moderation", emoji: "🛡️" },
  { label: "Support", value: "support", emoji: "🎫" },
  { label: "Reports", value: "reports", emoji: "🚨" },
  { label: "Appeals", value: "appeals", emoji: "🔨" },
  { label: "AI", value: "ai", emoji: "🤖" },
  { label: "Logging", value: "logging", emoji: "📋" },
  { label: "Staff", value: "staff", emoji: "👥" },
];

function buildSettingsEmbed(category: string, guildId: string): EmbedBuilder {
  const config = loadGuildConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle(`⚙️ ASHENAI SETTINGS — ${category.toUpperCase()}`)
    .setColor(0x7c3aed);

  switch (category) {
    case "moderation": {
      const m = config.moderation;
      embed.setDescription("Configure moderation behavior.")
        .addFields(
          { name: "Enabled", value: m.enabled ? "✅" : "❌", inline: true },
          { name: "Default Timeout", value: `${m.defaultTimeoutMinutes} min`, inline: true },
          { name: "Max Warns Before Action", value: `${m.maxWarnBeforeAction}`, inline: true },
          { name: "Auto Ban on Max Warn", value: m.autoBanOnMaxWarn ? "✅" : "❌", inline: true },
        );
      break;
    }
    case "support": {
      const s = config.support ?? { enabled: false, allowGeneralHelp: true, allowReports: true, allowAppeals: true };
      embed.setDescription("Configure the support ticket system.")
        .addFields(
          { name: "Enabled", value: s.enabled ? "✅" : "❌", inline: true },
          { name: "Support Channel", value: s.channelId ? `<#${s.channelId}>` : "Not set", inline: true },
          { name: "Category", value: s.categoryId ? `<#${s.categoryId}>` : "Not set", inline: true },
          { name: "Allow General Help", value: s.allowGeneralHelp ? "✅" : "❌", inline: true },
          { name: "Allow Reports", value: s.allowReports ? "✅" : "❌", inline: true },
          { name: "Allow Appeals", value: s.allowAppeals ? "✅" : "❌", inline: true },
        );
      break;
    }
    case "reports": {
      const r = config.reports ?? { enabled: false, requireEvidence: false, aiAnalysisEnabled: true, autoEscalateHighRisk: true };
      embed.setDescription("Configure the user report system.")
        .addFields(
          { name: "Enabled", value: r.enabled ? "✅" : "❌", inline: true },
          { name: "Category", value: r.categoryId ? `<#${r.categoryId}>` : "Not set", inline: true },
          { name: "Require Evidence", value: r.requireEvidence ? "✅" : "❌", inline: true },
          { name: "AI Analysis", value: r.aiAnalysisEnabled ? "✅" : "❌", inline: true },
          { name: "Auto Escalate High Risk", value: r.autoEscalateHighRisk ? "✅" : "❌", inline: true },
        );
      break;
    }
    case "appeals": {
      const a = config.appeals ?? { enabled: false, aiAnalysisEnabled: true };
      embed.setDescription("Configure the ban appeal system.")
        .addFields(
          { name: "Enabled", value: a.enabled ? "✅" : "❌", inline: true },
          { name: "Category", value: a.categoryId ? `<#${a.categoryId}>` : "Not set", inline: true },
          { name: "AI Analysis", value: a.aiAnalysisEnabled ? "✅" : "❌", inline: true },
        );
      break;
    }
    case "ai": {
      const ai = config.supportAi ?? { enabled: true, allowModerationActions: false, requireConfirmation: true, allowWebResearch: false };
      embed.setDescription("Configure AI behavior in support cases.")
        .addFields(
          { name: "AI Enabled", value: ai.enabled ? "✅" : "❌", inline: true },
          { name: "Allow Mod Actions", value: ai.allowModerationActions ? "✅" : "❌", inline: true },
          { name: "Require Confirmation", value: ai.requireConfirmation ? "✅" : "❌", inline: true },
          { name: "Allow Web Research", value: ai.allowWebResearch ? "✅" : "❌", inline: true },
        );
      break;
    }
    case "logging": {
      const l = config.supportLogging ?? { enabled: false, includeModeration: true, includeTickets: true, includeReports: true, includeAppeals: true, includeAiActions: true };
      embed.setDescription("Configure support event logging.")
        .addFields(
          { name: "Enabled", value: l.enabled ? "✅" : "❌", inline: true },
          { name: "Log Channel", value: l.channelId ? `<#${l.channelId}>` : "Not set", inline: true },
          { name: "Moderation", value: l.includeModeration ? "✅" : "❌", inline: true },
          { name: "Tickets", value: l.includeTickets ? "✅" : "❌", inline: true },
          { name: "Reports", value: l.includeReports ? "✅" : "❌", inline: true },
          { name: "Appeals", value: l.includeAppeals ? "✅" : "❌", inline: true },
          { name: "AI Actions", value: l.includeAiActions ? "✅" : "❌", inline: true },
        );
      break;
    }
    case "staff": {
      const st = config.staff ?? { roleIds: [] };
      const roleList = st.roleIds.length > 0
        ? st.roleIds.map((id) => `<@&${id}>`).join(", ")
        : "No staff roles configured";
      embed.setDescription("Configure staff roles for case management.")
        .addFields(
          { name: "Staff Roles", value: roleList },
        );
      break;
    }
    default:
      embed.setDescription("Unknown category.");
  }

  embed.setFooter({ text: "Use the menu below to switch categories." });
  return embed;
}

function buildSelectMenu(): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId("ashen_settings_select")
    .setPlaceholder("Select a settings category")
    .addOptions(
      SETTINGS_CATEGORIES.map((cat) => ({
        label: cat.label,
        value: cat.value,
        emoji: cat.emoji,
      }))
    );
}

export function createSettingsCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("settings")
      .setDescription("Configure AshenAI support systems for this server")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        if (!interaction.guild) {
          await interaction.editReply("❌ This command can only be used in a server.");
          return;
        }

        const guildId = interaction.guild.id;

        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(buildSelectMenu());

        const embed = buildSettingsEmbed("support", guildId);

        const response = await interaction.editReply({
          embeds: [embed],
          components: [selectRow],
        });

        const collector = response.createMessageComponentCollector({
          filter: (i) => i.user.id === interaction.user.id,
          time: 300_000,
        });

        collector.on("collect", async (i) => {
          if (i.isStringSelectMenu() && i.customId === "ashen_settings_select") {
            const category = i.values[0];
            const updatedEmbed = buildSettingsEmbed(category, guildId);
            await i.update({ embeds: [updatedEmbed] });
          }
        });

        collector.on("end", async () => {
          try {
            const disabledRow = new ActionRowBuilder<StringSelectMenuBuilder>()
              .addComponents(buildSelectMenu().setDisabled(true));
            await interaction.editReply({ components: [disabledRow] }).catch(() => {});
          } catch {
            // Interaction may have expired
          }
        });

        recordAudit({
          who: interaction.user.id,
          whoName: interaction.user.tag,
          what: "Opened /settings panel",
          where: "discord",
          guildId,
          result: "success",
        });
      } catch (error) {
        logger.error("❌ /settings failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply("❌ Failed to load settings. Please try again.");
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

export function createSettingsUpdateCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("settings-update")
      .setDescription("Update a specific AshenAI setting")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((opt) =>
        opt.setName("category").setDescription("Settings category").setRequired(true)
          .addChoices(
            { name: "Support", value: "support" },
            { name: "Reports", value: "reports" },
            { name: "Appeals", value: "appeals" },
            { name: "AI", value: "ai" },
            { name: "Logging", value: "logging" },
            { name: "Staff", value: "staff" },
          )
      )
      .addStringOption((opt) =>
        opt.setName("setting").setDescription("Setting name to update").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("value").setDescription("New value (true/false, channel ID, role ID, or number)").setRequired(true)
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        if (!interaction.guild) {
          await interaction.editReply("❌ This command can only be used in a server.");
          return;
        }

        const guildId = interaction.guild.id;
        const category = interaction.options.getString("category", true);
        const setting = interaction.options.getString("setting", true).toLowerCase();
        const rawValue = interaction.options.getString("value", true);

        const config = loadGuildConfig(guildId);
        let updated = false;
        let description = "";

        switch (category) {
          case "support": {
            if (!config.support) config.support = { enabled: false, allowGeneralHelp: true, allowReports: true, allowAppeals: true };
            const s = config.support;
            if (setting === "enabled") { s.enabled = rawValue === "true"; updated = true; description = `Support ${s.enabled ? "enabled" : "disabled"}`; }
            else if (setting === "channel") { s.channelId = rawValue === "none" ? undefined : rawValue; updated = true; description = `Support channel set to ${s.channelId ? `<#${s.channelId}>` : "none"}`; }
            else if (setting === "category") { s.categoryId = rawValue === "none" ? undefined : rawValue; updated = true; description = `Support category set to ${s.categoryId ? `<#${s.categoryId}>` : "none"}`; }
            else if (setting === "allowgeneralhelp") { s.allowGeneralHelp = rawValue === "true"; updated = true; description = `General help ${s.allowGeneralHelp ? "enabled" : "disabled"}`; }
            else if (setting === "allowreports") { s.allowReports = rawValue === "true"; updated = true; description = `Reports ${s.allowReports ? "enabled" : "disabled"}`; }
            else if (setting === "allowappeals") { s.allowAppeals = rawValue === "true"; updated = true; description = `Appeals ${s.allowAppeals ? "enabled" : "disabled"}`; }
            break;
          }
          case "reports": {
            if (!config.reports) config.reports = { enabled: false, requireEvidence: false, aiAnalysisEnabled: true, autoEscalateHighRisk: true };
            const r = config.reports;
            if (setting === "enabled") { r.enabled = rawValue === "true"; updated = true; description = `Reports ${r.enabled ? "enabled" : "disabled"}`; }
            else if (setting === "category") { r.categoryId = rawValue === "none" ? undefined : rawValue; updated = true; description = `Report category set to ${r.categoryId ? `<#${r.categoryId}>` : "none"}`; }
            else if (setting === "requireevidence") { r.requireEvidence = rawValue === "true"; updated = true; description = `Evidence requirement ${r.requireEvidence ? "enabled" : "disabled"}`; }
            else if (setting === "aianalysis") { r.aiAnalysisEnabled = rawValue === "true"; updated = true; description = `AI analysis ${r.aiAnalysisEnabled ? "enabled" : "disabled"}`; }
            else if (setting === "autoescalate") { r.autoEscalateHighRisk = rawValue === "true"; updated = true; description = `Auto-escalate ${r.autoEscalateHighRisk ? "enabled" : "disabled"}`; }
            break;
          }
          case "appeals": {
            if (!config.appeals) config.appeals = { enabled: false, aiAnalysisEnabled: true };
            const a = config.appeals;
            if (setting === "enabled") { a.enabled = rawValue === "true"; updated = true; description = `Appeals ${a.enabled ? "enabled" : "disabled"}`; }
            else if (setting === "category") { a.categoryId = rawValue === "none" ? undefined : rawValue; updated = true; description = `Appeal category set to ${a.categoryId ? `<#${a.categoryId}>` : "none"}`; }
            else if (setting === "aianalysis") { a.aiAnalysisEnabled = rawValue === "true"; updated = true; description = `AI analysis ${a.aiAnalysisEnabled ? "enabled" : "disabled"}`; }
            break;
          }
          case "ai": {
            if (!config.supportAi) config.supportAi = { enabled: true, allowModerationActions: false, requireConfirmation: true, allowWebResearch: false };
            const ai = config.supportAi;
            if (setting === "enabled") { ai.enabled = rawValue === "true"; updated = true; description = `AI ${ai.enabled ? "enabled" : "disabled"}`; }
            else if (setting === "allowmodactions") { ai.allowModerationActions = rawValue === "true"; updated = true; description = `AI mod actions ${ai.allowModerationActions ? "enabled" : "disabled"}`; }
            else if (setting === "requireconfirmation") { ai.requireConfirmation = rawValue === "true"; updated = true; description = `AI confirmation ${ai.requireConfirmation ? "required" : "not required"}`; }
            else if (setting === "allowwebresearch") { ai.allowWebResearch = rawValue === "true"; updated = true; description = `AI web research ${ai.allowWebResearch ? "enabled" : "disabled"}`; }
            break;
          }
          case "logging": {
            if (!config.supportLogging) config.supportLogging = { enabled: false, includeModeration: true, includeTickets: true, includeReports: true, includeAppeals: true, includeAiActions: true };
            const l = config.supportLogging;
            if (setting === "enabled") { l.enabled = rawValue === "true"; updated = true; description = `Logging ${l.enabled ? "enabled" : "disabled"}`; }
            else if (setting === "channel") { l.channelId = rawValue === "none" ? undefined : rawValue; updated = true; description = `Log channel set to ${l.channelId ? `<#${l.channelId}>` : "none"}`; }
            else if (setting === "includemoderation") { l.includeModeration = rawValue === "true"; updated = true; description = `Moderation logging ${l.includeModeration ? "enabled" : "disabled"}`; }
            else if (setting === "includetickets") { l.includeTickets = rawValue === "true"; updated = true; description = `Ticket logging ${l.includeTickets ? "enabled" : "disabled"}`; }
            else if (setting === "includereports") { l.includeReports = rawValue === "true"; updated = true; description = `Report logging ${l.includeReports ? "enabled" : "disabled"}`; }
            else if (setting === "includeappeals") { l.includeAppeals = rawValue === "true"; updated = true; description = `Appeal logging ${l.includeAppeals ? "enabled" : "disabled"}`; }
            else if (setting === "includeaiactions") { l.includeAiActions = rawValue === "true"; updated = true; description = `AI action logging ${l.includeAiActions ? "enabled" : "disabled"}`; }
            break;
          }
          case "staff": {
            if (!config.staff) config.staff = { roleIds: [] };
            const st = config.staff;
            if (setting === "addrole") {
              if (!st.roleIds.includes(rawValue)) {
                st.roleIds.push(rawValue);
                updated = true;
                description = `Added role <@&${rawValue}> to staff`;
              } else {
                description = `Role <@&${rawValue}> is already a staff role`;
              }
            } else if (setting === "removerole") {
              const idx = st.roleIds.indexOf(rawValue);
              if (idx >= 0) {
                st.roleIds.splice(idx, 1);
                updated = true;
                description = `Removed role <@&${rawValue}> from staff`;
              } else {
                description = `Role <@&${rawValue}> is not a staff role`;
              }
            } else if (setting === "clearroles") {
              st.roleIds = [];
              updated = true;
              description = "Cleared all staff roles";
            }
            break;
          }
        }

        if (!updated) {
          await interaction.editReply(`❌ Unknown setting \`${setting}\` for category \`${category}\`.`);
          return;
        }

        saveGuildConfig(config);

        await interaction.editReply(`✅ ${description}`);

        recordAudit({
          who: interaction.user.id,
          whoName: interaction.user.tag,
          what: `Updated ${category}.${setting} = ${rawValue}`,
          where: "discord",
          guildId,
          result: "success",
        });

        logger.info(`⚙️ Settings updated by ${interaction.user.tag}: ${category}.${setting} = ${rawValue}`);
      } catch (error) {
        logger.error("❌ /settings-update failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply("❌ Failed to update setting. Please try again.");
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
