import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";

import { loadGuildConfig } from "../../core/guild-config";
import { getSupportCaseManager } from "../../support/case-manager";
import {
  VALID_TRANSITIONS,
  type AiCase,
  type CaseStatus,
} from "../../support/types";
import { recordAudit } from "../../security/audit";
import { logger } from "../../logger";
import {
  BRAND,
  closedPanelEmbed,
  makeInteractionResponder,
  panelNavRow,
  type PanelResponder,
} from "./shared";

/* ================================================================
 * Staff authorization (moved from the legacy /support case*
 * subcommands — same fail-closed model: guild_configs.staff.roleIds)
 * ================================================================ */

export interface StaffContext {
  user: { id: string; tag?: string; bot?: boolean };
  guild: {
    id: string;
    members?: {
      fetch: (id: string) => Promise<unknown>;
    };
  } | null;
  member?: unknown;
}

function resolveMemberRoleIds(ctx: StaffContext): string[] | null {
  const member = ctx.member as
    | {
        roles?:
          | { cache?: { some?: (fn: (r: { id: string }) => boolean) => boolean }; some?: (fn: (r: { id: string }) => boolean) => boolean }
          | string[];
      }
    | null
    | undefined;
  if (!member?.roles) return null;
  const roles = member.roles;
  if (Array.isArray(roles)) return roles;
  const collect = (source: { some: (fn: (r: { id: string }) => boolean) => boolean }): string[] => {
    const ids: string[] = [];
    source.some((role) => {
      ids.push(role.id);
      return false;
    });
    return ids;
  };
  if (roles.cache && typeof roles.cache.some === "function") return collect(roles.cache as { some: (fn: (r: { id: string }) => boolean) => boolean });
  if (typeof roles.some === "function") return collect(roles as { some: (fn: (r: { id: string }) => boolean) => boolean });
  return null;
}

/**
 * Case management (view/list/assign/status/stats) is staff-only.
 * Authorization source of truth: guild_configs.staff.roleIds — the
 * same model used by the support-channel handler. Fails closed when
 * no staff roles are configured or the member cannot be resolved.
 */
export async function hasCaseStaffAccess(
  ctx: StaffContext,
  guildId: string,
): Promise<boolean> {
  try {
    const config = loadGuildConfig(guildId);
    const staffRoleIds = config.staff?.roleIds ?? [];
    if (staffRoleIds.length === 0) return false;

    const guild = ctx.guild;
    if (!guild || !guild.members) return false;
    if (ctx.user.bot) return false;

    const cachedIds = resolveMemberRoleIds(ctx);
    if (cachedIds) return cachedIds.some((id) => staffRoleIds.includes(id));

    const fetched = (await guild.members
      .fetch(ctx.user.id)
      .catch(() => null)) as { user?: { bot?: boolean }; roles?: { cache?: { some: (fn: (r: { id: string }) => boolean) => boolean } } } | null;
    if (!fetched || fetched.user?.bot) return false;

    return (
      typeof fetched.roles?.cache?.some === "function" &&
      fetched.roles.cache.some((role) => staffRoleIds.includes(role.id))
    );
  } catch {
    return false;
  }
}

/* ================================================================
 * Panel payloads
 * ================================================================ */

const STATUS_EMOJI: Record<string, string> = {
  open: "🟢",
  investigating: "🔍",
  waiting_user: "⏳",
  waiting_staff: "⏳",
  escalated: "🔴",
  resolved: "✅",
  closed: "⚫",
};

const TYPE_EMOJI: Record<AiCase["type"], string> = {
  support: "🎫",
  report: "🚨",
  appeal: "🔨",
};

const TYPE_NAME: Record<AiCase["type"], string> = {
  support: "Support",
  report: "Report",
  appeal: "Appeal",
};

function nav(): ActionRowBuilder<ButtonBuilder> {
  return panelNavRow("support", { back: false });
}

export function supportHomePayload(
  guildId: string,
  isStaff: boolean,
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
} {
  const embed = new EmbedBuilder()
    .setTitle("🎫 ASHENAI SUPPORT CENTER")
    .setColor(BRAND)
    .setDescription(
      "Open a ticket, report a member, appeal a moderation action, or track your own cases.\n" +
      "Everything happens right here — no subcommands needed.",
    )
    .addFields(
      { name: "🎫 New Ticket", value: "General help from staff.", inline: true },
      { name: "🚨 Report a User", value: "Report rule violations.", inline: true },
      { name: "🔨 Appeal", value: "Appeal a ban or action.", inline: true },
      { name: "📁 My Cases", value: "Track your submissions.", inline: true },
    )
    .setFooter({ text: "Case management for staff is available below." });

  const rows: ActionRowBuilder<any>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("support:ticket").setLabel("🎫 New Ticket").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("support:report").setLabel("🚨 Report a User").setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("support:appeal").setLabel("🔨 Appeal").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("support:mycases").setLabel("📁 My Cases").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("support:faq").setLabel("ℹ️ How it works").setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (isStaff) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("support:staff").setLabel("📋 Manage Cases").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("support:stats").setLabel("📊 Case Stats").setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("support:home").setLabel("🏠 Home").setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId("support:close").setLabel("✖ Close").setStyle(ButtonStyle.Danger),
    ),
  );

  return { embeds: [embed], components: rows };
}

function faqPayload(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const embed = new EmbedBuilder()
    .setTitle("ℹ️ How the Support Center works")
    .setColor(BRAND)
    .setDescription(
      "**🎫 New Ticket** — ask staff for help. Creates a case and, if configured, a ticket channel.\n\n" +
      "**🚨 Report a User** — reports a member for rule violations. Staff review it privately.\n\n" +
      "**🔨 Appeal** — appeal a ban or moderation action taken against you.\n\n" +
      "**📁 My Cases** — view the status of cases you created.\n\n" +
      "**📋 Manage Cases** (staff only) — view, assign, and update cases. Requires a configured staff role.",
    )
    .setFooter({ text: "Disabled systems are controlled by admins in /settings." });
  return { embeds: [embed], components: [nav()] };
}

function reportPromptPayload(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const selectRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("support:report_pick")
      .setPlaceholder("Select the member you want to report")
      .setMinValues(1)
      .setMaxValues(1),
  );
  const embed = new EmbedBuilder()
    .setTitle("🚨 Report a User")
    .setColor(0xef4444)
    .setDescription("Select the member you are reporting. You'll then describe what happened.");
  return { embeds: [embed], components: [selectRow, nav()] };
}

function caseDetailEmbed(c: AiCase): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📋 Case ${c.id}`)
    .setDescription(c.summary || "No summary")
    .setColor(c.type === "report" ? 0xef4444 : c.type === "appeal" ? 0xf59e0b : 0x3b82f6)
    .addFields(
      { name: "Type", value: c.type, inline: true },
      { name: "Status", value: `${STATUS_EMOJI[c.status] ?? "❓"} ${c.status}`, inline: true },
      { name: "Creator", value: `<@${c.creatorId}>`, inline: true },
      { name: "Created", value: `<t:${Math.floor(c.createdAt / 1000)}:R>`, inline: true },
      { name: "Updated", value: `<t:${Math.floor(c.updatedAt / 1000)}:R>`, inline: true },
    );

  if (c.subjectUserId) embed.addFields({ name: "Subject", value: `<@${c.subjectUserId}>`, inline: true });
  if (c.assignedStaffId) embed.addFields({ name: "Assigned", value: `<@${c.assignedStaffId}>`, inline: true });
  if (c.closedAt) embed.addFields({ name: "Closed", value: `<t:${Math.floor(c.closedAt / 1000)}:R>`, inline: true });

  return embed;
}

function caseDetailComponents(c: AiCase, staff: boolean): ActionRowBuilder<any>[] {
  if (!staff) return [nav()];
  const rows: ActionRowBuilder<any>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`support:assignme:${c.id}`).setLabel("👤 Assign to Me").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`support:status:${c.id}`).setLabel("🔄 Change Status").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`support:assignpick:${c.id}`)
        .setPlaceholder("Assign this case to a staff member")
        .setMinValues(1)
        .setMaxValues(1),
    ),
  ];
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("support:home").setLabel("🏠 Home").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("support:staff").setLabel("📋 Cases").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("support:close").setLabel("✖ Close").setStyle(ButtonStyle.Danger),
    ),
  );
  return rows;
}

function staffListPayload(
  cases: AiCase[],
  statusFilter?: string,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const filterLabel = statusFilter ? ` — filter: ${statusFilter}` : "";
  const components: ActionRowBuilder<any>[] = [];

  if (cases.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("📋 Support Cases")
      .setDescription(`📭 No cases found${filterLabel}.`)
      .setColor(BRAND);
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("support:stafffilter")
          .setPlaceholder("Filter by status")
          .addOptions(
            [{ label: "All statuses", value: "all" }, ...Object.keys(VALID_TRANSITIONS).map((s) => ({ label: s.replace("_", " "), value: s }))],
          ),
      ),
      nav(),
    );
    return { embeds: [embed], components };
  }

  const list = cases
    .map(
      (c) =>
        `${TYPE_EMOJI[c.type]} \`${c.id}\` — ${c.status} — <@${c.creatorId}> — <t:${Math.floor(c.createdAt / 1000)}:R>`,
    )
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle(`📋 Support Cases${filterLabel}`)
    .setDescription(list)
    .setColor(BRAND)
    .setFooter({ text: "Select a case below to manage it." });

  components.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("support:staffpick")
        .setPlaceholder("Select a case to view")
        .addOptions(
          cases.slice(0, 25).map((c) => ({
            label: `${TYPE_EMOJI[c.type]} ${c.id}`.slice(0, 100),
            value: c.id,
            description: `${c.status} — ${(c.summary ?? "no summary").slice(0, 90)}`.slice(0, 100),
          })),
        ),
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("support:stafffilter")
        .setPlaceholder("Filter by status")
        .addOptions(
          [{ label: "All statuses", value: "all" }, ...Object.keys(VALID_TRANSITIONS).map((s) => ({ label: s.replace("_", " "), value: s }))],
        ),
    ),
    nav(),
  );
  return { embeds: [embed], components };
}

function statusChooserPayload(c: AiCase): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const valid = VALID_TRANSITIONS[c.status] ?? [];
  const embed = new EmbedBuilder()
    .setTitle(`🔄 Case ${c.id} — set status`)
    .setDescription(
      `Current status: **${c.status}**\nAllowed transitions: ${valid.map((s) => `**${s}**`).join(", ") || "none (case is closed)"}`,
    )
    .setColor(BRAND);

  const rows: ActionRowBuilder<any>[] = [];
  if (valid.length > 0) {
    for (let i = 0; i < valid.length; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const status of valid.slice(i, i + 5)) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`support:statusset:${c.id}:${status}`)
            .setLabel(status.replace("_", " "))
            .setStyle(ButtonStyle.Success),
        );
      }
      rows.push(row);
    }
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`support:case:${c.id}`).setLabel("← Back to case").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("support:home").setLabel("🏠 Home").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("support:close").setLabel("✖ Close").setStyle(ButtonStyle.Danger),
    ),
  );
  return { embeds: [embed], components: rows };
}

/* ================================================================
 * Staff actions (gate + view/list/assign/status/stats)
 * ================================================================ */

export type StaffAction = "view" | "list" | "assign" | "status" | "stats";

export interface StaffActionParams {
  id?: string;
  staffId?: string;
  newStatus?: string;
  statusFilter?: string;
}

/**
 * Single funnel for every staff-only case action. The staff gate runs
 * FIRST on every call (fail closed), denials are audited with the
 * legacy `/support case <action>` wording, and guild scoping is
 * enforced through the case manager (`expectedGuildId`).
 */
export async function runStaffCaseAction(
  action: StaffAction,
  ctx: StaffContext & { reply?: unknown; update?: unknown },
  guildId: string,
  res: PanelResponder,
  params: StaffActionParams = {},
): Promise<void> {
  if (!(await hasCaseStaffAccess(ctx, guildId))) {
    recordAudit({
      who: ctx.user.id,
      whoName: ctx.user.tag ?? ctx.user.id,
      what: `Denied /support case ${action} (missing staff role)`,
      where: "support",
      guildId,
      result: "denied",
    });
    await res.deny("❌ You need a configured staff role to manage support cases.");
    return;
  }

  const caseManager = getSupportCaseManager();

  switch (action) {
    case "view": {
      const rawId = (params.id ?? "").trim();
      const c = caseManager.getCase(rawId);
      if (!c || c.guildId !== guildId) {
        await res.show({ content: `❌ Case \`${rawId}\` not found.` });
        return;
      }
      await res.show({ embeds: [caseDetailEmbed(c)], components: caseDetailComponents(c, true) });
      return;
    }
    case "list": {
      const cases = caseManager.getGuildCases(
        guildId,
        (params.statusFilter as CaseStatus | undefined) ?? undefined,
        undefined,
        25,
      );
      await res.show(staffListPayload(cases, params.statusFilter));
      return;
    }
    case "assign": {
      const rawId = (params.id ?? "").trim();
      const staffId = params.staffId ?? "";
      const existing = caseManager.getCase(rawId);
      if (!existing || existing.guildId !== guildId) {
        await res.show({ content: `❌ Case \`${rawId}\` not found.` });
        return;
      }
      const result = caseManager.assignCase(existing.id, staffId, ctx.user.id, guildId);
      if (!result) {
        await res.show({ content: `❌ Case \`${existing.id}\` not found or assignment failed.` });
        return;
      }
      await res.show({ content: `✅ Case \`${existing.id}\` assigned to <@${staffId}>.` });
      return;
    }
    case "status": {
      const rawId = (params.id ?? "").trim();
      const newStatus = (params.newStatus ?? "") as CaseStatus;
      const existing = caseManager.getCase(rawId);
      if (!existing || existing.guildId !== guildId) {
        await res.show({ content: `❌ Invalid transition or case \`${rawId}\` not found.` });
        return;
      }
      const result = caseManager.transitionCase(existing.id, newStatus, ctx.user.id, guildId);
      if (!result) {
        await res.show({ content: `❌ Invalid transition or case \`${existing.id}\` not found.` });
        return;
      }
      await res.show({ content: `✅ Case \`${existing.id}\` status updated to **${newStatus}**.` });
      return;
    }
    case "stats": {
      const stats = caseManager.getStats(guildId);
      const embed = new EmbedBuilder()
        .setTitle("📊 Case Statistics")
        .setColor(BRAND)
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

      await res.show({ embeds: [embed], components: [nav()] });
      return;
    }
  }
}

/* ================================================================
 * Modals (user flows)
 * ================================================================ */

function buildTicketModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("support:m:ticket")
    .setTitle("New Support Ticket")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("subject")
          .setLabel("Brief description of your issue")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(200),
      ),
    );
}

function buildReportModal(targetId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`support:m:report:${targetId}`)
    .setTitle("Report a User")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Why are you reporting this user?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("evidence")
          .setLabel("Links, message IDs, or additional context")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
}

function buildAppealModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("support:m:appeal")
    .setTitle("Appeal a Moderation Action")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Why should your action be reversed?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("context")
          .setLabel("Any additional information for staff")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
}

async function ensureModalDeferred(interaction: any): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
}

async function handleTicketModal(interaction: any): Promise<void> {
  await ensureModalDeferred(interaction);
  const guildId: string = interaction.guildId;
  const config = loadGuildConfig(guildId);
  const subjectRaw = String(interaction.fields.getTextInputValue("subject") ?? "").trim();
  const subject = subjectRaw || "No subject provided";

  const supportConfig = config.support ?? { enabled: false, allowGeneralHelp: true, allowReports: true, allowAppeals: true };

  if (!supportConfig.enabled) {
    await interaction.editReply("❌ Support tickets are not enabled. Ask an admin to enable them with `/settings`.");
    return;
  }

  const caseManager = getSupportCaseManager();
  const newCase = caseManager.createCase({
    guildId,
    channelId: interaction.channelId,
    type: "support",
    creatorId: interaction.user.id,
    summary: subject,
  });

  if (!newCase) {
    await interaction.editReply("❌ Failed to create ticket. Please try again.");
    return;
  }

  const typeEmoji = "🎫";
  const embed = new EmbedBuilder()
    .setTitle(`${typeEmoji} Support — ${newCase.id}`)
    .setDescription(subject)
    .setColor(0x3b82f6)
    .addFields(
      { name: "Created By", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Type", value: "Support", inline: true },
      { name: "Status", value: "Open", inline: true },
    )
    .setTimestamp();
  embed.setFooter({ text: `Case ID: ${newCase.id}` });

  let ticketChannel: any = null;
  const categoryId = supportConfig.categoryId;

  if (categoryId && interaction.guild) {
    try {
      const category = interaction.guild.channels.cache.get(categoryId);
      if (category && category.type === ChannelType.GuildCategory) {
        ticketChannel = await interaction.guild.channels.create({
          name: `${typeEmoji} ${newCase.id}`,
          type: ChannelType.GuildText,
          parent: categoryId,
          topic: `Support ticket — ${subject}`,
        });
        caseManager.transitionCase(newCase.id, "investigating", interaction.user.id, guildId);
      }
    } catch (error) {
      logger.warn(`⚠️ Could not create ticket channel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const replyEmbed = new EmbedBuilder()
    .setTitle(`${typeEmoji} Support Created`)
    .setDescription(
      `Your ticket has been created.\n\n**Case ID:** \`${newCase.id}\`\n**Type:** Support\n**Subject:** ${subject}`,
    )
    .setColor(0x3b82f6);

  if (ticketChannel) {
    replyEmbed.addFields({ name: "Ticket Channel", value: `<#${ticketChannel.id}>` });
    try {
      await ticketChannel.send({ embeds: [embed] });
    } catch (error) {
      logger.warn(`⚠️ Could not post ticket embed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await interaction.editReply({ embeds: [replyEmbed] });

  recordAudit({
    who: interaction.user.id,
    whoName: interaction.user.tag,
    what: `Created Support ticket ${newCase.id}`,
    where: "support",
    guildId,
    result: "success",
  });

  logger.info(`🎫 Support ticket ${newCase.id} created by ${interaction.user.tag} in ${guildId}`);
}

async function handleReportModal(interaction: any, targetId: string): Promise<void> {
  await ensureModalDeferred(interaction);
  const guildId: string = interaction.guildId;
  const config = loadGuildConfig(guildId);
  const reportsConfig = config.reports ?? { enabled: false, requireEvidence: false, aiAnalysisEnabled: true, autoEscalateHighRisk: true };

  if (!reportsConfig.enabled) {
    await interaction.editReply("❌ Reports are not enabled. Ask an admin to enable them with `/settings`.");
    return;
  }

  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!target) {
    await interaction.editReply("❌ I couldn't find that member.");
    return;
  }

  if (target.id === interaction.user.id) {
    await interaction.editReply("❌ You cannot report yourself.");
    return;
  }

  if (target.user.bot) {
    await interaction.editReply("❌ You cannot report a bot.");
    return;
  }

  const reason = String(interaction.fields.getTextInputValue("reason") ?? "").trim();
  const evidenceRaw = String(interaction.fields.getTextInputValue("evidence") ?? "").trim();
  const evidence = evidenceRaw || undefined;

  if (!reason) {
    await interaction.editReply("❌ A reason is required.");
    return;
  }

  if (reportsConfig.requireEvidence && !evidence) {
    await interaction.editReply("❌ This server requires evidence with reports. Add links or message IDs.");
    return;
  }

  const caseManager = getSupportCaseManager();
  const newCase = caseManager.createCase({
    guildId,
    channelId: interaction.channelId,
    type: "report",
    creatorId: interaction.user.id,
    subjectUserId: target.id,
    summary: reason,
    metadata: { evidence },
  });

  if (!newCase) {
    await interaction.editReply("❌ Failed to create report. Please try again.");
    return;
  }

  if (evidence) {
    caseManager.addMessage(newCase.id, interaction.user.id, `Evidence: ${evidence}`);
  }

  const replyEmbed = new EmbedBuilder()
    .setTitle("🚨 Report Submitted")
    .setDescription(
      `Your report has been submitted and will be reviewed by staff.\n\n` +
      `**Case ID:** \`${newCase.id}\`\n` +
      `**Reported User:** <@${target.id}>\n` +
      `**Reason:** ${reason}\n\n` +
      `Please wait for staff review. Do not ping moderators about your report.`,
    )
    .setColor(0xef4444)
    .setFooter({ text: "If you have additional evidence, open the Support Center (/support) and reference this case ID." });

  await interaction.editReply({ embeds: [replyEmbed] });

  recordAudit({
    who: interaction.user.id,
    whoName: interaction.user.tag,
    what: `Report submitted: ${target.user.tag} — ${reason}`,
    where: "support",
    guildId,
    result: "success",
  });

  logger.info(`🚨 Report ${newCase.id} submitted by ${interaction.user.tag} against ${target.user.tag} in ${guildId}`);
}

async function handleAppealModal(interaction: any): Promise<void> {
  await ensureModalDeferred(interaction);
  const guildId: string = interaction.guildId;
  const config = loadGuildConfig(guildId);
  const appealsConfig = config.appeals ?? { enabled: false, aiAnalysisEnabled: true };

  if (!appealsConfig.enabled) {
    await interaction.editReply("❌ Appeals are not enabled. Ask an admin to enable them with `/settings`.");
    return;
  }

  const reason = String(interaction.fields.getTextInputValue("reason") ?? "").trim();
  const contextRaw = String(interaction.fields.getTextInputValue("context") ?? "").trim();
  const additionalContext = contextRaw || undefined;

  if (!reason) {
    await interaction.editReply("❌ A reason is required.");
    return;
  }

  const caseManager = getSupportCaseManager();
  const newCase = caseManager.createCase({
    guildId,
    channelId: interaction.channelId,
    type: "appeal",
    creatorId: interaction.user.id,
    summary: reason,
    metadata: { additionalContext },
  });

  if (!newCase) {
    await interaction.editReply("❌ Failed to create appeal. Please try again.");
    return;
  }

  if (additionalContext) {
    caseManager.addMessage(newCase.id, interaction.user.id, `Additional context: ${additionalContext}`);
  }

  const replyEmbed = new EmbedBuilder()
    .setTitle("🔨 Appeal Submitted")
    .setDescription(
      `Your appeal has been submitted and will be reviewed by staff.\n\n` +
      `**Case ID:** \`${newCase.id}\`\n` +
      `**Reason:** ${reason}\n\n` +
      `Please wait for staff review. Do not ping moderators about your appeal.`,
    )
    .setColor(0xf59e0b)
    .setFooter({ text: "If you have additional information, open the Support Center (/support) and reference this case ID." });

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
}

/* ================================================================
 * Component routing
 * ================================================================ */

function isCaseStatus(value: string): value is CaseStatus {
  return Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, value);
}

async function handleComponentError(interaction: any, error: unknown): Promise<void> {
  logger.error("❌ Support panel error:", error instanceof Error ? error.message : String(error));
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply("❌ Something went wrong. Please try again.");
    } else if (!interaction.replied) {
      await interaction.reply({ content: "❌ Something went wrong. Please try again.", flags: MessageFlags.Ephemeral });
    }
  } catch {
    // Interaction may have expired
  }
}

export async function handleSupportComponent(interaction: any): Promise<void> {
  try {
    if (!interaction.guild || !interaction.guildId) {
      await interaction.reply({ content: "❌ This panel can only be used in a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const guildId: string = interaction.guild.id;
    const res = makeInteractionResponder(interaction);
    const parts = String(interaction.customId).split(":");
    const verb = parts[1] ?? "";
    const arg = parts.slice(2).join(":");

    switch (verb) {
      case "home":
      case "back": {
        const isStaff = await hasCaseStaffAccess(interaction, guildId);
        await interaction.update(supportHomePayload(guildId, isStaff));
        return;
      }
      case "close": {
        await interaction.update({ embeds: [closedPanelEmbed("Support Center")], components: [] });
        return;
      }
      case "faq": {
        await interaction.update(faqPayload());
        return;
      }
      case "ticket": {
        await interaction.showModal(buildTicketModal());
        return;
      }
      case "report": {
        await interaction.update(reportPromptPayload());
        return;
      }
      case "report_pick": {
        const targetId = interaction.values?.[0];
        if (!targetId) {
          await interaction.reply({ content: "❌ No member selected.", flags: MessageFlags.Ephemeral });
          return;
        }
        if (targetId === interaction.user.id) {
          await interaction.reply({ content: "❌ You cannot report yourself.", flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.showModal(buildReportModal(targetId));
        return;
      }
      case "appeal": {
        await interaction.showModal(buildAppealModal());
        return;
      }
      case "mycases": {
        const cases = getSupportCaseManager()
          .getGuildCases(guildId, undefined, undefined, 100)
          .filter((c) => c.creatorId === interaction.user.id)
          .slice(0, 25);

        if (cases.length === 0) {
          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("📁 My Cases")
                .setDescription("📭 You have no cases in this server.")
                .setColor(BRAND),
            ],
            components: [nav()],
          });
          return;
        }

        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("📁 My Cases")
              .setDescription(
                cases
                  .map(
                    (c) =>
                      `${TYPE_EMOJI[c.type]} \`${c.id}\` — ${c.status} — <t:${Math.floor(c.createdAt / 1000)}:R>`,
                  )
                  .join("\n"),
              )
              .setColor(BRAND),
          ],
          components: [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId("support:mycases_pick")
                .setPlaceholder("Select one of your cases")
                .addOptions(
                  cases.map((c) => ({
                    label: `${TYPE_EMOJI[c.type]} ${c.id}`.slice(0, 100),
                    value: c.id,
                    description: `${c.status} — ${(c.summary ?? "no summary").slice(0, 90)}`.slice(0, 100),
                  })),
                ),
            ),
            nav(),
          ],
        });
        return;
      }
      case "mycases_pick": {
        const caseId = interaction.values?.[0] ?? "";
        const c = getSupportCaseManager().getCase(caseId);
        const isStaff = await hasCaseStaffAccess(interaction, guildId);
        if (!c || c.guildId !== guildId || (c.creatorId !== interaction.user.id && !isStaff)) {
          await interaction.update({ content: `❌ Case \`${caseId}\` not found.`, components: [] });
          return;
        }
        await interaction.update({ embeds: [caseDetailEmbed(c)], components: [nav()] });
        return;
      }
      case "staff": {
        await runStaffCaseAction("list", interaction, guildId, res, {});
        return;
      }
      case "stafffilter": {
        const status = interaction.values?.[0] ?? "all";
        await runStaffCaseAction("list", interaction, guildId, res, {
          statusFilter: status === "all" ? undefined : status,
        });
        return;
      }
      case "staffpick": {
        const caseId = interaction.values?.[0] ?? "";
        await runStaffCaseAction("view", interaction, guildId, res, { id: caseId });
        return;
      }
      case "case": {
        await runStaffCaseAction("view", interaction, guildId, res, { id: arg });
        return;
      }
      case "assignme": {
        await runStaffCaseAction("assign", interaction, guildId, res, {
          id: arg,
          staffId: interaction.user.id,
        });
        return;
      }
      case "assignpick": {
        const staffId = interaction.values?.[0];
        if (!staffId) {
          await interaction.reply({ content: "❌ No member selected.", flags: MessageFlags.Ephemeral });
          return;
        }
        const config = loadGuildConfig(guildId);
        const staffRoleIds = config.staff?.roleIds ?? [];
        const selected = await interaction.guild.members.fetch(staffId).catch(() => null);
        const isStaffMember =
          selected &&
          !selected.user.bot &&
          staffRoleIds.length > 0 &&
          selected.roles.cache.some((role: { id: string }) => staffRoleIds.includes(role.id));
        if (!isStaffMember) {
          await interaction.reply({
            content: "❌ That member does not have a configured staff role.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await runStaffCaseAction("assign", interaction, guildId, res, { id: arg, staffId });
        return;
      }
      case "status": {
        const c = getSupportCaseManager().getCase(arg);
        if (!c || c.guildId !== guildId) {
          await res.deny(`❌ Case \`${arg}\` not found.`);
          return;
        }
        // Re-run the staff gate before revealing transition options.
        if (!(await hasCaseStaffAccess(interaction, guildId))) {
          await runStaffCaseAction("status", interaction, guildId, res, { id: arg, newStatus: "" });
          return;
        }
        await interaction.update(statusChooserPayload(c));
        return;
      }
      case "statusset": {
        const [id, newStatus] = [parts[2], parts[3]];
        if (!id || !newStatus || !isCaseStatus(newStatus)) {
          await res.deny("❌ Invalid status.");
          return;
        }
        await runStaffCaseAction("status", interaction, guildId, res, { id, newStatus });
        return;
      }
      default: {
        logger.debug(`Support panel: ignoring unknown custom id ${interaction.customId}`);
        return;
      }
    }
  } catch (error) {
    await handleComponentError(interaction, error);
  }
}

export async function handleSupportModal(interaction: any): Promise<void> {
  try {
    if (!interaction.guildId) {
      await interaction.reply({ content: "❌ Must be used in a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const parts = String(interaction.customId).split(":");
    const verb = parts[2];
    const arg = parts.slice(3).join(":");

    switch (verb) {
      case "ticket":
        await handleTicketModal(interaction);
        return;
      case "report":
        await handleReportModal(interaction, arg);
        return;
      case "appeal":
        await handleAppealModal(interaction);
        return;
      default:
        return;
    }
  } catch (error) {
    await handleComponentError(interaction, error);
  }
}

/* ================================================================
 * Command entry (bare /support)
 * ================================================================ */

export async function openSupportPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.editReply("❌ This command can only be used in a server.");
    return;
  }
  const isStaff = await hasCaseStaffAccess(interaction, interaction.guild.id);
  await interaction.editReply(supportHomePayload(interaction.guild.id, isStaff));
}
