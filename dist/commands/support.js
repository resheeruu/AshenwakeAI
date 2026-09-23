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
var support_exports = {};
__export(support_exports, {
  createSupportCommand: () => createSupportCommand
});
module.exports = __toCommonJS(support_exports);
var import_discord = require("discord.js");
var import_guild_config = require("../core/guild-config");
var import_case_manager = require("../support/case-manager");
var import_audit = require("../security/audit");
var import_logger = require("../logger");
function createSupportCommand() {
  return {
    data: new import_discord.SlashCommandBuilder().setName("support").setDescription("Support tickets, reports, appeals, and case management").addSubcommand(
      (sub) => sub.setName("ticket").setDescription("Create a support ticket").addStringOption(
        (opt) => opt.setName("type").setDescription("Ticket type").setRequired(true).addChoices(
          { name: "General Help", value: "support" },
          { name: "Report a User", value: "report" },
          { name: "Ban Appeal", value: "appeal" }
        )
      ).addStringOption(
        (opt) => opt.setName("subject").setDescription("Brief description of your issue").setRequired(false)
      ).addUserOption(
        (opt) => opt.setName("target_user").setDescription("User being reported (reports only)").setRequired(false)
      )
    ).addSubcommand(
      (sub) => sub.setName("report").setDescription("Report a user for rule violations").addUserOption(
        (opt) => opt.setName("user").setDescription("The user to report").setRequired(true)
      ).addStringOption(
        (opt) => opt.setName("reason").setDescription("Why are you reporting this user?").setRequired(true)
      ).addStringOption(
        (opt) => opt.setName("evidence").setDescription("Links, message IDs, or additional context").setRequired(false)
      )
    ).addSubcommand(
      (sub) => sub.setName("appeal").setDescription("Appeal a ban or moderation action").addStringOption(
        (opt) => opt.setName("reason").setDescription("Why should your action be reversed?").setRequired(true)
      ).addStringOption(
        (opt) => opt.setName("additional_context").setDescription("Any additional information for staff").setRequired(false)
      )
    ).addSubcommandGroup(
      (group) => group.setName("case").setDescription("Manage support cases").addSubcommand(
        (c) => c.setName("view").setDescription("View a support case").addStringOption((opt) => opt.setName("id").setDescription("Case ID").setRequired(true))
      ).addSubcommand(
        (c) => c.setName("list").setDescription("List support cases").addStringOption(
          (opt) => opt.setName("status").setDescription("Filter by status").addChoices(
            { name: "Open", value: "open" },
            { name: "Investigating", value: "investigating" },
            { name: "Waiting User", value: "waiting_user" },
            { name: "Waiting Staff", value: "waiting_staff" },
            { name: "Escalated", value: "escalated" },
            { name: "Resolved", value: "resolved" },
            { name: "Closed", value: "closed" }
          )
        ).addStringOption(
          (opt) => opt.setName("type").setDescription("Filter by type").addChoices(
            { name: "Support", value: "support" },
            { name: "Report", value: "report" },
            { name: "Appeal", value: "appeal" }
          )
        )
      ).addSubcommand(
        (c) => c.setName("assign").setDescription("Assign a case to a staff member").addStringOption((opt) => opt.setName("id").setDescription("Case ID").setRequired(true)).addUserOption((opt) => opt.setName("staff").setDescription("Staff member to assign").setRequired(true))
      ).addSubcommand(
        (c) => c.setName("status").setDescription("Update case status").addStringOption((opt) => opt.setName("id").setDescription("Case ID").setRequired(true)).addStringOption(
          (opt) => opt.setName("status").setDescription("New status").setRequired(true).addChoices(
            { name: "Investigating", value: "investigating" },
            { name: "Waiting User", value: "waiting_user" },
            { name: "Waiting Staff", value: "waiting_staff" },
            { name: "Escalated", value: "escalated" },
            { name: "Resolved", value: "resolved" },
            { name: "Closed", value: "closed" }
          )
        )
      ).addSubcommand(
        (c) => c.setName("stats").setDescription("View case statistics")
      ).addSubcommand(
        (c) => c.setName("summarize").setDescription("AI-generated case summary").addStringOption((opt) => opt.setName("id").setDescription("Case ID").setRequired(true))
      ).addSubcommand(
        (c) => c.setName("evidence").setDescription("View collected evidence").addStringOption((opt) => opt.setName("id").setDescription("Case ID").setRequired(true))
      ).addSubcommand(
        (c) => c.setName("timeline").setDescription("View case message timeline").addStringOption((opt) => opt.setName("id").setDescription("Case ID").setRequired(true))
      ).addSubcommand(
        (c) => c.setName("recommend").setDescription("Get AI recommendation for a case").addStringOption((opt) => opt.setName("id").setDescription("Case ID").setRequired(true))
      )
    ),
    async execute(interaction) {
      try {
        if (!interaction.guild) {
          await interaction.editReply("\u274C This command can only be used in a server.");
          return;
        }
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "ticket") {
          await handleTicket(interaction, guildId);
          return;
        }
        if (subcommand === "report") {
          await handleReport(interaction, guildId);
          return;
        }
        if (subcommand === "appeal") {
          await handleAppeal(interaction, guildId);
          return;
        }
        if (subcommand === "case") {
          await handleCase(interaction, guildId);
          return;
        }
      } catch (error) {
        import_logger.logger.error("\u274C /support failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply("\u274C Failed to process support command. Please try again.");
        } catch {
        }
      }
    }
  };
}
async function handleTicket(interaction, guildId) {
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  const type = interaction.options.getString("type", true);
  const subject = interaction.options.getString("subject") ?? "No subject provided";
  const targetUser = interaction.options.getUser("target_user");
  const supportConfig = config.support ?? { enabled: false, allowGeneralHelp: true, allowReports: true, allowAppeals: true };
  const reportsConfig = config.reports ?? { enabled: false, requireEvidence: false, aiAnalysisEnabled: true, autoEscalateHighRisk: true };
  const appealsConfig = config.appeals ?? { enabled: false, aiAnalysisEnabled: true };
  if (type === "support" && !supportConfig.enabled) {
    await interaction.editReply("\u274C Support tickets are not enabled. Ask an admin to enable them with `/settings`.");
    return;
  }
  if (type === "report" && !reportsConfig.enabled) {
    await interaction.editReply("\u274C Reports are not enabled. Ask an admin to enable them with `/settings`.");
    return;
  }
  if (type === "appeal" && !appealsConfig.enabled) {
    await interaction.editReply("\u274C Appeals are not enabled. Ask an admin to enable them with `/settings`.");
    return;
  }
  const categoryId = type === "report" ? reportsConfig.categoryId : type === "appeal" ? appealsConfig.categoryId : supportConfig.categoryId;
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  const newCase = caseManager.createCase({
    guildId,
    channelId: interaction.channelId,
    type,
    creatorId: interaction.user.id,
    subjectUserId: targetUser?.id,
    summary: subject
  });
  if (!newCase) {
    await interaction.editReply("\u274C Failed to create ticket. Please try again.");
    return;
  }
  const typeEmoji = type === "support" ? "\u{1F3AB}" : type === "report" ? "\u{1F6A8}" : "\u{1F528}";
  const typeName = type === "support" ? "Support" : type === "report" ? "Report" : "Appeal";
  const embed = new import_discord.EmbedBuilder().setTitle(`${typeEmoji} ${typeName} \u2014 ${newCase.id}`).setDescription(subject).setColor(type === "report" ? 15680580 : type === "appeal" ? 16096779 : 3900150).addFields(
    { name: "Created By", value: `<@${interaction.user.id}>`, inline: true },
    { name: "Type", value: typeName, inline: true },
    { name: "Status", value: "Open", inline: true }
  ).setTimestamp();
  if (targetUser) {
    embed.addFields({ name: "Subject User", value: `<@${targetUser.id}>`, inline: true });
  }
  embed.setFooter({ text: `Case ID: ${newCase.id}` });
  let ticketChannel = null;
  if (categoryId) {
    try {
      const category = interaction.guild.channels.cache.get(categoryId);
      if (category && category.type === import_discord.ChannelType.GuildCategory) {
        ticketChannel = await interaction.guild.channels.create({
          name: `${typeEmoji} ${newCase.id}`,
          type: import_discord.ChannelType.GuildText,
          parent: categoryId,
          topic: `${typeName} ticket \u2014 ${subject}`
        });
        caseManager.transitionCase(newCase.id, "investigating", interaction.user.id);
      }
    } catch (error) {
      import_logger.logger.warn(`\u26A0\uFE0F Could not create ticket channel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const replyEmbed = new import_discord.EmbedBuilder().setTitle(`${typeEmoji} ${typeName} Created`).setDescription(`Your ticket has been created.

**Case ID:** \`${newCase.id}\`
**Type:** ${typeName}
**Subject:** ${subject}`).setColor(type === "report" ? 15680580 : type === "appeal" ? 16096779 : 3900150);
  if (ticketChannel) {
    replyEmbed.addFields({ name: "Ticket Channel", value: `<#${ticketChannel.id}>` });
    await ticketChannel.send({ embeds: [embed] });
  }
  await interaction.editReply({ embeds: [replyEmbed] });
  (0, import_audit.recordAudit)({
    who: interaction.user.id,
    whoName: interaction.user.tag,
    what: `Created ${typeName} ticket ${newCase.id}`,
    where: "support",
    guildId,
    result: "success"
  });
  import_logger.logger.info(`\u{1F3AB} ${typeName} ticket ${newCase.id} created by ${interaction.user.tag} in ${guildId}`);
}
async function handleReport(interaction, guildId) {
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  const reportsConfig = config.reports ?? { enabled: false, requireEvidence: false, aiAnalysisEnabled: true, autoEscalateHighRisk: true };
  if (!reportsConfig.enabled) {
    await interaction.editReply("\u274C Reports are not enabled. Ask an admin to enable them with `/settings`.");
    return;
  }
  const targetUser = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const evidence = interaction.options.getString("evidence");
  if (targetUser.id === interaction.user.id) {
    await interaction.editReply("\u274C You cannot report yourself.");
    return;
  }
  if (targetUser.bot) {
    await interaction.editReply("\u274C You cannot report a bot.");
    return;
  }
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  const newCase = caseManager.createCase({
    guildId,
    channelId: interaction.channelId,
    type: "report",
    creatorId: interaction.user.id,
    subjectUserId: targetUser.id,
    summary: reason,
    metadata: { evidence: evidence ?? void 0 }
  });
  if (!newCase) {
    await interaction.editReply("\u274C Failed to create report. Please try again.");
    return;
  }
  if (evidence) {
    caseManager.addMessage(newCase.id, interaction.user.id, `Evidence: ${evidence}`);
  }
  const embed = new import_discord.EmbedBuilder().setTitle(`\u{1F6A8} Report \u2014 ${newCase.id}`).setDescription(reason).setColor(15680580).addFields(
    { name: "Reported User", value: `<@${targetUser.id}>`, inline: true },
    { name: "Reporter", value: `<@${interaction.user.id}>`, inline: true },
    { name: "Status", value: "Open", inline: true }
  ).setTimestamp();
  if (evidence) {
    embed.addFields({ name: "Evidence", value: evidence });
  }
  embed.setFooter({ text: `Case ID: ${newCase.id}` });
  const replyEmbed = new import_discord.EmbedBuilder().setTitle("\u{1F6A8} Report Submitted").setDescription(
    `Your report has been submitted and will be reviewed by staff.

**Case ID:** \`${newCase.id}\`
**Reported User:** <@${targetUser.id}>
**Reason:** ${reason}

Please wait for staff review. Do not ping moderators about your report.`
  ).setColor(15680580).setFooter({ text: "If you have additional evidence, use /support ticket and reference this case ID." });
  await interaction.editReply({ embeds: [replyEmbed] });
  (0, import_audit.recordAudit)({
    who: interaction.user.id,
    whoName: interaction.user.tag,
    what: `Report submitted: ${targetUser.tag} \u2014 ${reason}`,
    where: "support",
    guildId,
    result: "success"
  });
  import_logger.logger.info(`\u{1F6A8} Report ${newCase.id} submitted by ${interaction.user.tag} against ${targetUser.tag} in ${guildId}`);
}
async function handleAppeal(interaction, guildId) {
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  const appealsConfig = config.appeals ?? { enabled: false, aiAnalysisEnabled: true };
  if (!appealsConfig.enabled) {
    await interaction.editReply("\u274C Appeals are not enabled. Ask an admin to enable them with `/settings`.");
    return;
  }
  const reason = interaction.options.getString("reason", true);
  const additionalContext = interaction.options.getString("additional_context");
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  const newCase = caseManager.createCase({
    guildId,
    channelId: interaction.channelId,
    type: "appeal",
    creatorId: interaction.user.id,
    summary: reason,
    metadata: { additionalContext: additionalContext ?? void 0 }
  });
  if (!newCase) {
    await interaction.editReply("\u274C Failed to create appeal. Please try again.");
    return;
  }
  if (additionalContext) {
    caseManager.addMessage(newCase.id, interaction.user.id, `Additional context: ${additionalContext}`);
  }
  const embed = new import_discord.EmbedBuilder().setTitle(`\u{1F528} Appeal \u2014 ${newCase.id}`).setDescription(reason).setColor(16096779).addFields(
    { name: "Appellant", value: `<@${interaction.user.id}>`, inline: true },
    { name: "Status", value: "Open", inline: true }
  ).setTimestamp();
  if (additionalContext) {
    embed.addFields({ name: "Additional Context", value: additionalContext });
  }
  embed.setFooter({ text: `Case ID: ${newCase.id}` });
  const replyEmbed = new import_discord.EmbedBuilder().setTitle("\u{1F528} Appeal Submitted").setDescription(
    `Your appeal has been submitted and will be reviewed by staff.

**Case ID:** \`${newCase.id}\`
**Reason:** ${reason}

Please wait for staff review. Do not ping moderators about your appeal.`
  ).setColor(16096779).setFooter({ text: "If you have additional information, use /support ticket and reference this case ID." });
  await interaction.editReply({ embeds: [replyEmbed] });
  (0, import_audit.recordAudit)({
    who: interaction.user.id,
    whoName: interaction.user.tag,
    what: `Appeal submitted: ${reason}`,
    where: "support",
    guildId,
    result: "success"
  });
  import_logger.logger.info(`\u{1F528} Appeal ${newCase.id} submitted by ${interaction.user.tag} in ${guildId}`);
}
async function handleCase(interaction, guildId) {
  const subcommand = interaction.options.getSubcommand();
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  switch (subcommand) {
    case "view": {
      const id = interaction.options.getString("id", true).toUpperCase();
      const c = caseManager.getCase(id);
      if (!c || c.guildId !== guildId) {
        await interaction.editReply(`\u274C Case \`${id}\` not found.`);
        return;
      }
      const statusEmoji = {
        open: "\u{1F7E2}",
        investigating: "\u{1F50D}",
        waiting_user: "\u23F3",
        waiting_staff: "\u23F3",
        escalated: "\u{1F534}",
        resolved: "\u2705",
        closed: "\u26AB"
      };
      const embed = new import_discord.EmbedBuilder().setTitle(`\u{1F4CB} Case ${c.id}`).setDescription(c.summary || "No summary").setColor(c.type === "report" ? 15680580 : c.type === "appeal" ? 16096779 : 3900150).addFields(
        { name: "Type", value: c.type, inline: true },
        { name: "Status", value: `${statusEmoji[c.status] ?? "\u2753"} ${c.status}`, inline: true },
        { name: "Creator", value: `<@${c.creatorId}>`, inline: true },
        { name: "Created", value: `<t:${Math.floor(c.createdAt / 1e3)}:R>`, inline: true },
        { name: "Updated", value: `<t:${Math.floor(c.updatedAt / 1e3)}:R>`, inline: true }
      );
      if (c.subjectUserId) embed.addFields({ name: "Subject", value: `<@${c.subjectUserId}>`, inline: true });
      if (c.assignedStaffId) embed.addFields({ name: "Assigned", value: `<@${c.assignedStaffId}>`, inline: true });
      if (c.closedAt) embed.addFields({ name: "Closed", value: `<t:${Math.floor(c.closedAt / 1e3)}:R>`, inline: true });
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "list": {
      const statusFilter = interaction.options.getString("status");
      const typeFilter = interaction.options.getString("type");
      const cases = caseManager.getGuildCases(guildId, statusFilter, typeFilter, 25);
      if (cases.length === 0) {
        await interaction.editReply("\u{1F4ED} No cases found matching your criteria.");
        return;
      }
      const list = cases.map((c) => {
        const emoji = c.type === "support" ? "\u{1F3AB}" : c.type === "report" ? "\u{1F6A8}" : "\u{1F528}";
        return `${emoji} \`${c.id}\` \u2014 ${c.status} \u2014 <@${c.creatorId}> \u2014 <t:${Math.floor(c.createdAt / 1e3)}:R>`;
      }).join("\n");
      const embed = new import_discord.EmbedBuilder().setTitle("\u{1F4CB} Support Cases").setDescription(list).setColor(8141549);
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case "assign": {
      const id = interaction.options.getString("id", true).toUpperCase();
      const staff = interaction.options.getUser("staff", true);
      const result = caseManager.assignCase(id, staff.id, interaction.user.id);
      if (!result) {
        await interaction.editReply(`\u274C Case \`${id}\` not found or assignment failed.`);
        return;
      }
      await interaction.editReply(`\u2705 Case \`${id}\` assigned to <@${staff.id}>.`);
      break;
    }
    case "status": {
      const id = interaction.options.getString("id", true).toUpperCase();
      const newStatus = interaction.options.getString("status", true);
      const result = caseManager.transitionCase(id, newStatus, interaction.user.id);
      if (!result) {
        await interaction.editReply(`\u274C Invalid transition or case \`${id}\` not found.`);
        return;
      }
      await interaction.editReply(`\u2705 Case \`${id}\` status updated to **${newStatus}**.`);
      break;
    }
    case "stats": {
      const stats = caseManager.getStats(guildId);
      const embed = new import_discord.EmbedBuilder().setTitle("\u{1F4CA} Case Statistics").setColor(8141549).addFields(
        { name: "Total Cases", value: `${stats.total}`, inline: true },
        { name: "Open Cases", value: `${stats.open}`, inline: true }
      );
      if (Object.keys(stats.byType).length > 0) {
        embed.addFields({
          name: "By Type",
          value: Object.entries(stats.byType).map(([t, c]) => `${t}: ${c}`).join("\n")
        });
      }
      if (Object.keys(stats.byStatus).length > 0) {
        embed.addFields({
          name: "By Status",
          value: Object.entries(stats.byStatus).map(([s, c]) => `${s}: ${c}`).join("\n")
        });
      }
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    default: {
      await interaction.editReply("\u274C Unknown case subcommand.");
      break;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createSupportCommand
});
