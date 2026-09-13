import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  TextChannel,
} from "discord.js";
import { AshenCommand } from "./definitions";
import { loadGuildConfig } from "../core/guild-config";
import { getSupportCaseManager } from "../support/case-manager";
import { recordAudit } from "../security/audit";
import { logger } from "../logger";

export function createTicketCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("ticket")
      .setDescription("Create a support ticket")
      .addStringOption((opt) =>
        opt.setName("type")
          .setDescription("Ticket type")
          .setRequired(true)
          .addChoices(
            { name: "General Help", value: "support" },
            { name: "Report a User", value: "report" },
            { name: "Ban Appeal", value: "appeal" },
          )
      )
      .addStringOption((opt) =>
        opt.setName("subject").setDescription("Brief description of your issue").setRequired(false)
      )
      .addUserOption((opt) =>
        opt.setName("target_user").setDescription("User being reported (reports only)").setRequired(false)
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        if (!interaction.guild) {
          await interaction.editReply("❌ Tickets can only be created in a server.");
          return;
        }

        const guildId = interaction.guild.id;
        const config = loadGuildConfig(guildId);
        const type = interaction.options.getString("type", true) as "support" | "report" | "appeal";
        const subject = interaction.options.getString("subject") ?? "No subject provided";
        const targetUser = interaction.options.getUser("target_user");

        const supportConfig = config.support ?? { enabled: false, allowGeneralHelp: true, allowReports: true, allowAppeals: true };
        const reportsConfig = config.reports ?? { enabled: false, requireEvidence: false, aiAnalysisEnabled: true, autoEscalateHighRisk: true };
        const appealsConfig = config.appeals ?? { enabled: false, aiAnalysisEnabled: true };

        if (type === "support" && !supportConfig.enabled) {
          await interaction.editReply("❌ Support tickets are not enabled. Ask an admin to enable them with `/settings`.");
          return;
        }
        if (type === "report" && !reportsConfig.enabled) {
          await interaction.editReply("❌ Reports are not enabled. Ask an admin to enable them with `/settings`.");
          return;
        }
        if (type === "appeal" && !appealsConfig.enabled) {
          await interaction.editReply("❌ Appeals are not enabled. Ask an admin to enable them with `/settings`.");
          return;
        }

        const categoryId = type === "report"
          ? reportsConfig.categoryId
          : type === "appeal"
            ? appealsConfig.categoryId
            : supportConfig.categoryId;

        const caseManager = getSupportCaseManager();

        const newCase = caseManager.createCase({
          guildId,
          channelId: interaction.channelId,
          type,
          creatorId: interaction.user.id,
          subjectUserId: targetUser?.id,
          summary: subject,
        });

        if (!newCase) {
          await interaction.editReply("❌ Failed to create ticket. Please try again.");
          return;
        }

        const typeEmoji = type === "support" ? "🎫" : type === "report" ? "🚨" : "🔨";
        const typeName = type === "support" ? "Support" : type === "report" ? "Report" : "Appeal";

        const embed = new EmbedBuilder()
          .setTitle(`${typeEmoji} ${typeName} — ${newCase.id}`)
          .setDescription(subject)
          .setColor(type === "report" ? 0xef4444 : type === "appeal" ? 0xf59e0b : 0x3b82f6)
          .addFields(
            { name: "Created By", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Type", value: typeName, inline: true },
            { name: "Status", value: "Open", inline: true },
          )
          .setTimestamp();

        if (targetUser) {
          embed.addFields({ name: "Subject User", value: `<@${targetUser.id}>`, inline: true });
        }

        embed.setFooter({ text: `Case ID: ${newCase.id}` });

        let ticketChannel: TextChannel | null = null;

        if (categoryId) {
          try {
            const category = interaction.guild.channels.cache.get(categoryId);
            if (category && category.type === ChannelType.GuildCategory) {
              ticketChannel = await interaction.guild.channels.create({
                name: `${typeEmoji} ${newCase.id}`,
                type: ChannelType.GuildText,
                parent: categoryId,
                topic: `${typeName} ticket — ${subject}`,
              });

              caseManager.transitionCase(newCase.id, "investigating", interaction.user.id);
            }
          } catch (error) {
            logger.warn(`⚠️ Could not create ticket channel: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        const replyEmbed = new EmbedBuilder()
          .setTitle(`${typeEmoji} ${typeName} Created`)
          .setDescription(`Your ticket has been created.\n\n**Case ID:** \`${newCase.id}\`\n**Type:** ${typeName}\n**Subject:** ${subject}`)
          .setColor(type === "report" ? 0xef4444 : type === "appeal" ? 0xf59e0b : 0x3b82f6);

        if (ticketChannel) {
          replyEmbed.addFields({ name: "Ticket Channel", value: `<#${ticketChannel.id}>` });

          await ticketChannel.send({ embeds: [embed] });

          if (type === "report" && targetUser) {
            await ticketChannel.send({
              content: `📋 **Report Details**\n\n**Reported User:** <@${targetUser.id}>\n**Reporter:** <@${interaction.user.id}>\n**Reason:** ${subject}\n\n<@${interaction.user.id}> — please provide any additional evidence or context for this report.`,
            });
          } else if (type === "appeal") {
            await ticketChannel.send({
              content: `📝 **Appeal Details**\n\n**Appellant:** <@${interaction.user.id}>\n**Reason:** ${subject}\n\n<@${interaction.user.id}> — please explain why you believe the action should be reversed.`,
            });
          } else {
            await ticketChannel.send({
              content: `👋 **Support Ticket Opened**\n\n<@${interaction.user.id}> — please describe your issue in detail. A staff member will assist you shortly.`,
            });
          }
        } else {
          await interaction.followUp({ embeds: [replyEmbed] });
        }

        if (!ticketChannel) {
          await interaction.editReply({ embeds: [replyEmbed] });
        }

        recordAudit({
          who: interaction.user.id,
          whoName: interaction.user.tag,
          what: `Created ${typeName} ticket ${newCase.id}`,
          where: "support",
          guildId,
          result: "success",
        });

        logger.info(`🎫 ${typeName} ticket ${newCase.id} created by ${interaction.user.tag} in ${guildId}`);
      } catch (error) {
        logger.error("❌ /ticket failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply("❌ Failed to create ticket. Please try again later.");
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

export function createReportCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("report")
      .setDescription("Report a user for rule violations")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("The user to report").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("reason").setDescription("Why are you reporting this user?").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("evidence").setDescription("Links, message IDs, or additional context").setRequired(false)
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        if (!interaction.guild) {
          await interaction.editReply("❌ Reports can only be made in a server.");
          return;
        }

        const guildId = interaction.guild.id;
        const config = loadGuildConfig(guildId);
        const reportsConfig = config.reports ?? { enabled: false, requireEvidence: false, aiAnalysisEnabled: true, autoEscalateHighRisk: true };

        if (!reportsConfig.enabled) {
          await interaction.editReply("❌ Reports are not enabled. Ask an admin to enable them with `/settings`.");
          return;
        }

        const targetUser = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const evidence = interaction.options.getString("evidence");

        if (targetUser.id === interaction.user.id) {
          await interaction.editReply("❌ You cannot report yourself.");
          return;
        }

        if (targetUser.bot) {
          await interaction.editReply("❌ You cannot report a bot.");
          return;
        }

        const caseManager = getSupportCaseManager();
        const newCase = caseManager.createCase({
          guildId,
          channelId: interaction.channelId,
          type: "report",
          creatorId: interaction.user.id,
          subjectUserId: targetUser.id,
          summary: reason,
          metadata: { evidence: evidence ?? undefined },
        });

        if (!newCase) {
          await interaction.editReply("❌ Failed to create report. Please try again.");
          return;
        }

        if (evidence) {
          caseManager.addMessage(newCase.id, interaction.user.id, `Evidence: ${evidence}`);
        }

        const embed = new EmbedBuilder()
          .setTitle(`🚨 Report — ${newCase.id}`)
          .setDescription(reason)
          .setColor(0xef4444)
          .addFields(
            { name: "Reported User", value: `<@${targetUser.id}>`, inline: true },
            { name: "Reporter", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Status", value: "Open", inline: true },
          )
          .setTimestamp();

        if (evidence) {
          embed.addFields({ name: "Evidence", value: evidence });
        }

        embed.setFooter({ text: `Case ID: ${newCase.id}` });

        const replyEmbed = new EmbedBuilder()
          .setTitle("🚨 Report Submitted")
          .setDescription(
            `Your report has been submitted and will be reviewed by staff.\n\n` +
            `**Case ID:** \`${newCase.id}\`\n` +
            `**Reported User:** <@${targetUser.id}>\n` +
            `**Reason:** ${reason}\n\n` +
            `Please wait for staff review. Do not ping moderators about your report.`
          )
          .setColor(0xef4444)
          .setFooter({ text: "If you have additional evidence, use /ticket and reference this case ID." });

        await interaction.editReply({ embeds: [replyEmbed] });

        recordAudit({
          who: interaction.user.id,
          whoName: interaction.user.tag,
          what: `Report submitted: ${targetUser.tag} — ${reason}`,
          where: "support",
          guildId,
          result: "success",
        });

        logger.info(`🚨 Report ${newCase.id} submitted by ${interaction.user.tag} against ${targetUser.tag} in ${guildId}`);
      } catch (error) {
        logger.error("❌ /report failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply("❌ Failed to submit report. Please try again later.");
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

export function createAppealCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("appeal")
      .setDescription("Appeal a ban or moderation action")
      .addStringOption((opt) =>
        opt.setName("reason").setDescription("Why should your action be reversed?").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("additional_context").setDescription("Any additional information for staff").setRequired(false)
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        if (!interaction.guild) {
          await interaction.editReply("❌ Appeals can only be made in a server.");
          return;
        }

        const guildId = interaction.guild.id;
        const config = loadGuildConfig(guildId);
        const appealsConfig = config.appeals ?? { enabled: false, aiAnalysisEnabled: true };

        if (!appealsConfig.enabled) {
          await interaction.editReply("❌ Appeals are not enabled. Ask an admin to enable them with `/settings`.");
          return;
        }

        const reason = interaction.options.getString("reason", true);
        const additionalContext = interaction.options.getString("additional_context");

        const caseManager = getSupportCaseManager();
        const newCase = caseManager.createCase({
          guildId,
          channelId: interaction.channelId,
          type: "appeal",
          creatorId: interaction.user.id,
          summary: reason,
          metadata: { additionalContext: additionalContext ?? undefined },
        });

        if (!newCase) {
          await interaction.editReply("❌ Failed to create appeal. Please try again.");
          return;
        }

        if (additionalContext) {
          caseManager.addMessage(newCase.id, interaction.user.id, `Additional context: ${additionalContext}`);
        }

        const embed = new EmbedBuilder()
          .setTitle(`🔨 Appeal — ${newCase.id}`)
          .setDescription(reason)
          .setColor(0xf59e0b)
          .addFields(
            { name: "Appellant", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Status", value: "Open", inline: true },
          )
          .setTimestamp();

        if (additionalContext) {
          embed.addFields({ name: "Additional Context", value: additionalContext });
        }

        embed.setFooter({ text: `Case ID: ${newCase.id}` });

        const replyEmbed = new EmbedBuilder()
          .setTitle("🔨 Appeal Submitted")
          .setDescription(
            `Your appeal has been submitted and will be reviewed by staff.\n\n` +
            `**Case ID:** \`${newCase.id}\`\n` +
            `**Reason:** ${reason}\n\n` +
            `Please wait for staff review. Do not ping moderators about your appeal.`
          )
          .setColor(0xf59e0b)
          .setFooter({ text: "If you have additional information, use /ticket and reference this case ID." });

        await interaction.editReply({ embeds: [replyEmbed] });

        recordAudit({
          who: interaction.user.id,
          whoName: interaction.user.tag,
          what: `Appeal submitted: ${reason}`,
          where: "support",
          guildId,
          result: "success",
        });

        logger.info(`🔨 Appeal ${newCase.id} submitted by ${interaction.user.tag} in ${guildId}`);
      } catch (error) {
        logger.error("❌ /appeal failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply("❌ Failed to submit appeal. Please try again later.");
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}

export function createCaseCommand(): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("case")
      .setDescription("Manage support cases")
      .addSubcommand((sub) =>
        sub.setName("view").setDescription("View a support case")
          .addStringOption((opt) => opt.setName("id").setDescription("Case ID").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List support cases")
          .addStringOption((opt) =>
            opt.setName("status").setDescription("Filter by status")
              .addChoices(
                { name: "Open", value: "open" },
                { name: "Investigating", value: "investigating" },
                { name: "Waiting User", value: "waiting_user" },
                { name: "Waiting Staff", value: "waiting_staff" },
                { name: "Escalated", value: "escalated" },
                { name: "Resolved", value: "resolved" },
                { name: "Closed", value: "closed" },
              )
          )
          .addStringOption((opt) =>
            opt.setName("type").setDescription("Filter by type")
              .addChoices(
                { name: "Support", value: "support" },
                { name: "Report", value: "report" },
                { name: "Appeal", value: "appeal" },
              )
          )
      )
      .addSubcommand((sub) =>
        sub.setName("assign").setDescription("Assign a case to a staff member")
          .addStringOption((opt) => opt.setName("id").setDescription("Case ID").setRequired(true))
          .addUserOption((opt) => opt.setName("staff").setDescription("Staff member to assign").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName("status").setDescription("Update case status")
          .addStringOption((opt) => opt.setName("id").setDescription("Case ID").setRequired(true))
          .addStringOption((opt) =>
            opt.setName("status").setDescription("New status").setRequired(true)
              .addChoices(
                { name: "Investigating", value: "investigating" },
                { name: "Waiting User", value: "waiting_user" },
                { name: "Waiting Staff", value: "waiting_staff" },
                { name: "Escalated", value: "escalated" },
                { name: "Resolved", value: "resolved" },
                { name: "Closed", value: "closed" },
              )
          )
      )
      .addSubcommand((sub) =>
        sub.setName("stats").setDescription("View case statistics")
      ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      try {
        if (!interaction.guild) {
          await interaction.editReply("❌ This command can only be used in a server.");
          return;
        }

        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();
        const caseManager = getSupportCaseManager();

        switch (subcommand) {
          case "view": {
            const id = interaction.options.getString("id", true).toUpperCase();
            const c = caseManager.getCase(id);
            if (!c || c.guildId !== guildId) {
              await interaction.editReply(`❌ Case \`${id}\` not found.`);
              return;
            }

            const statusEmoji: Record<string, string> = {
              open: "🟢", investigating: "🔍", waiting_user: "⏳", waiting_staff: "⏳",
              escalated: "🔴", resolved: "✅", closed: "⚫",
            };

            const embed = new EmbedBuilder()
              .setTitle(`📋 Case ${c.id}`)
              .setDescription(c.summary || "No summary")
              .setColor(c.type === "report" ? 0xef4444 : c.type === "appeal" ? 0xf59e0b : 0x3b82f6)
              .addFields(
                { name: "Type", value: c.type, inline: true },
                { name: "Status", value: `${statusEmoji[c.status] ?? "❓"} ${c.status}`, inline: true },
                { name: "Creator", value: `<@${c.creatorId}>`, inline: true },
                { name: "Created", value: `<t:${Math.floor(c.createdAt / 1000)}:R>`, inline: true },
                { name: "Updated", value: `<t:${Math.floor(c.updatedAt / 1000)}:R>`, inline: true },
              );

            if (c.subjectUserId) embed.addFields({ name: "Subject", value: `<@${c.subjectUserId}>`, inline: true });
            if (c.assignedStaffId) embed.addFields({ name: "Assigned", value: `<@${c.assignedStaffId}>`, inline: true });
            if (c.closedAt) embed.addFields({ name: "Closed", value: `<t:${Math.floor(c.closedAt / 1000)}:R>`, inline: true });
            if (c.aiAnalysis) {
              embed.addFields({
                name: "🤖 AI Analysis",
                value: c.aiAnalysis.conclusion || "Pending analysis",
              });
            }

            await interaction.editReply({ embeds: [embed] });
            break;
          }
          case "list": {
            const statusFilter = interaction.options.getString("status") as any;
            const typeFilter = interaction.options.getString("type") as any;
            const cases = caseManager.getGuildCases(guildId, statusFilter, typeFilter, 25);

            if (cases.length === 0) {
              await interaction.editReply("📭 No cases found matching your criteria.");
              return;
            }

            const list = cases.map((c) => {
              const emoji = c.type === "support" ? "🎫" : c.type === "report" ? "🚨" : "🔨";
              return `${emoji} \`${c.id}\` — ${c.status} — <@${c.creatorId}> — <t:${Math.floor(c.createdAt / 1000)}:R>`;
            }).join("\n");

            const embed = new EmbedBuilder()
              .setTitle("📋 Support Cases")
              .setDescription(list)
              .setColor(0x7c3aed);

            await interaction.editReply({ embeds: [embed] });
            break;
          }
          case "assign": {
            const id = interaction.options.getString("id", true).toUpperCase();
            const staff = interaction.options.getUser("staff", true);
            const result = caseManager.assignCase(id, staff.id, interaction.user.id);
            if (!result) {
              await interaction.editReply(`❌ Case \`${id}\` not found or assignment failed.`);
              return;
            }
            await interaction.editReply(`✅ Case \`${id}\` assigned to <@${staff.id}>.`);
            break;
          }
          case "status": {
            const id = interaction.options.getString("id", true).toUpperCase();
            const newStatus = interaction.options.getString("status", true) as any;
            const result = caseManager.transitionCase(id, newStatus, interaction.user.id);
            if (!result) {
              await interaction.editReply(`❌ Invalid transition or case \`${id}\` not found.`);
              return;
            }
            await interaction.editReply(`✅ Case \`${id}\` status updated to **${newStatus}**.`);
            break;
          }
          case "stats": {
            const stats = caseManager.getStats(guildId);
            const embed = new EmbedBuilder()
              .setTitle("📊 Case Statistics")
              .setColor(0x7c3aed)
              .addFields(
                { name: "Total Cases", value: `${stats.total}`, inline: true },
                { name: "Open Cases", value: `${stats.open}`, inline: true },
              );

            if (Object.keys(stats.byType).length > 0) {
              embed.addFields({
                name: "By Type",
                value: Object.entries(stats.byType).map(([t, c]) => `${t}: ${c}`).join("\n"),
              });
            }

            if (Object.keys(stats.byStatus).length > 0) {
              embed.addFields({
                name: "By Status",
                value: Object.entries(stats.byStatus).map(([s, c]) => `${s}: ${c}`).join("\n"),
              });
            }

            await interaction.editReply({ embeds: [embed] });
            break;
          }
        }
      } catch (error) {
        logger.error("❌ /case failed:", error instanceof Error ? error.message : String(error));
        try {
          await interaction.editReply("❌ Failed to process case command. Please try again.");
        } catch {
          // Interaction may have expired
        }
      }
    },
  };
}
