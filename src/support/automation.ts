import type { Client, TextChannel } from "discord.js";
import { logger } from "../logger";
import { loadGuildConfig } from "../core/guild-config";
import { getSupportCaseManager } from "./case-manager";
import type { AiCase, CaseStatus } from "./types";

/* ================================================================
 * SUPPORT AUTOMATION
 *
 * Periodic background tasks for the support system:
 * - Detect stale cases (no activity for too long)
 * - Send reminders for cases awaiting user/staff response
 * - Auto-escalate cases stuck in certain states
 * - Auto-close resolved cases after timeout
 * ================================================================ */

/* ================================================================
 * CONFIGURATION
 * ================================================================ */

interface AutomationConfig {
  staleCaseHours: number;           // Hours without activity before considered stale
  reminderIntervalHours: number;    // Hours between reminders
  autoCloseDays: number;            // Days after resolution before auto-close
  autoEscalateDays: number;         // Days stuck before auto-escalation
  enabled: boolean;
}

const DEFAULT_CONFIG: AutomationConfig = {
  staleCaseHours: 48,
  reminderIntervalHours: 24,
  autoCloseDays: 7,
  autoEscalateDays: 3,
  enabled: true,
};

/* ================================================================
 * TIMERS
 * ================================================================ */

let automationInterval: ReturnType<typeof setInterval> | null = null;
const REMINDER_COOLDOWN = new Map<string, number>(); // caseId → last reminder timestamp

/* ================================================================
 * PRUNE STALE COOLDOWN ENTRIES
 * ================================================================ */

function pruneReminderCooldown(intervalMs: number): void {
  const now = Date.now();
  for (const [caseId, ts] of REMINDER_COOLDOWN) {
    if (now - ts > intervalMs * 2) {
      REMINDER_COOLDOWN.delete(caseId);
    }
  }
}

/* ================================================================
 * STALE CASE DETECTION
 * ================================================================ */

function findStaleCases(allCases: AiCase[], config: AutomationConfig): AiCase[] {
  const now = Date.now();
  const staleThreshold = config.staleCaseHours * 60 * 60 * 1000;

  return allCases.filter(c => {
    if (c.status === "closed" || c.status === "resolved") return false;
    const lastActivity = Math.max(c.updatedAt, c.createdAt);
    return (now - lastActivity) > staleThreshold;
  });
}

/* ================================================================
 * REMINDER LOGIC
 * ================================================================ */

function shouldSendReminder(
  aiCase: AiCase,
  config: AutomationConfig,
): boolean {
  if (aiCase.status === "closed" || aiCase.status === "resolved") return false;
  if (aiCase.status !== "waiting_user" && aiCase.status !== "waiting_staff") return false;

  const now = Date.now();
  const cooldownMs = config.reminderIntervalHours * 60 * 60 * 1000;
  const lastReminder = REMINDER_COOLDOWN.get(aiCase.id) ?? 0;

  return (now - lastReminder) > cooldownMs;
}

function markReminderSent(caseId: string): void {
  REMINDER_COOLDOWN.set(caseId, Date.now());
}

/* ================================================================
 * AUTO-ESCALATION
 * ================================================================ */

function findEscalationCandidates(allCases: AiCase[], config: AutomationConfig): AiCase[] {
  const now = Date.now();
  const threshold = config.autoEscalateDays * 24 * 60 * 60 * 1000;

  return allCases.filter(c => {
    if (c.status === "closed" || c.status === "resolved" || c.status === "escalated") return false;
    const lastActivity = Math.max(c.updatedAt, c.createdAt);
    return (now - lastActivity) > threshold;
  });
}

/* ================================================================
 * AUTO-CLOSE
 * ================================================================ */

function findAutoCloseCandidates(allCases: AiCase[], config: AutomationConfig): AiCase[] {
  const now = Date.now();
  const threshold = config.autoCloseDays * 24 * 60 * 60 * 1000;

  return allCases.filter(c => {
    if (c.status !== "resolved") return false;
    return c.updatedAt && (now - c.updatedAt) > threshold;
  });
}

/* ================================================================
 * SEND NOTIFICATIONS
 * ================================================================ */

async function sendStaleReminder(
  client: Client,
  aiCase: AiCase,
  reason: string,
): Promise<void> {
  try {
    const guild = client.guilds.cache.get(aiCase.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(aiCase.channelId) as TextChannel | undefined;
    if (!channel || !channel.isTextBased()) return;

    const typeName = aiCase.type === "report" ? "Report" : aiCase.type === "appeal" ? "Appeal" : "Support";

    const mention = aiCase.status === "waiting_user"
      ? `<@${aiCase.creatorId}>`
      : aiCase.assignedStaffId
        ? `<@${aiCase.assignedStaffId}>`
        : "";

    const embed = {
      title: `⏰ ${typeName} Case — ${reason}`,
      description: `Case \`${aiCase.id}\` has been ${reason}.\n\n${
        aiCase.status === "waiting_user"
          ? "We're waiting for your response. Please provide the requested information."
          : "This case needs staff attention. Please review and take action."
      }`,
      color: 0xf59e0b,
      fields: [
        { name: "Status", value: aiCase.status, inline: true },
        { name: "Creator", value: `<@${aiCase.creatorId}>`, inline: true },
      ],
      footer: { text: `Case ID: ${aiCase.id}` },
      timestamp: new Date().toISOString(),
    };

    await channel.send({
      content: mention || undefined,
      embeds: [embed],
    }).catch(() => {});

    markReminderSent(aiCase.id);
  } catch (error) {
    logger.warn(`Failed to send stale reminder for case ${aiCase.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function sendAutoEscalation(
  client: Client,
  aiCase: AiCase,
): Promise<void> {
  try {
    const config = loadGuildConfig(aiCase.guildId);
    const logChannelId = config.supportLogging?.channelId || config.logChannelId;
    if (!logChannelId) return;

    const guild = client.guilds.cache.get(aiCase.guildId);
    if (!guild) return;

    const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
    if (!logChannel || !logChannel.isTextBased()) return;

    const staffMentions = (config.staff?.roleIds ?? [])
      .map(id => `<@&${id}>`)
      .join(" ");

    const typeName = aiCase.type === "report" ? "Report" : aiCase.type === "appeal" ? "Appeal" : "Support";

    await logChannel.send({
      content: staffMentions ? `⚡ **Auto-Escalation** ${staffMentions}` : "⚡ **Auto-Escalation**",
      embeds: [{
        title: `${typeName} Case — Auto-Escalated`,
        description: `Case \`${aiCase.id}\` has been inactive for too long and is being auto-escalated for staff review.`,
        color: 0xef4444,
        fields: [
          { name: "Status", value: aiCase.status, inline: true },
          { name: "Creator", value: `<@${aiCase.creatorId}>`, inline: true },
          { name: "Channel", value: `<#${aiCase.channelId}>`, inline: true },
        ],
        footer: { text: `Case ID: ${aiCase.id}` },
        timestamp: new Date().toISOString(),
      }],
    }).catch(() => {});
  } catch (error) {
    logger.warn(`Failed to send auto-escalation for case ${aiCase.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function sendAutoClose(
  client: Client,
  aiCase: AiCase,
): Promise<void> {
  try {
    const caseManager = getSupportCaseManager();
    caseManager.transitionCase(aiCase.id, "closed", "system");

    const guild = client.guilds.cache.get(aiCase.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(aiCase.channelId) as TextChannel | undefined;
    if (!channel || !channel.isTextBased()) return;

    await channel.send({
      embeds: [{
        title: "✅ Case Auto-Closed",
        description: `This case has been automatically closed after ${DEFAULT_CONFIG.autoCloseDays} days of inactivity. If you need further assistance, please create a new ticket.`,
        color: 0x22c55e,
        footer: { text: `Case ID: ${aiCase.id}` },
        timestamp: new Date().toISOString(),
      }],
    }).catch(() => {});
  } catch (error) {
    logger.warn(`Failed to auto-close case ${aiCase.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/* ================================================================
 * MAIN AUTOMATION TICK
 * ================================================================ */

async function runAutomationTick(client: Client): Promise<void> {
  try {
    // Prune stale reminder cooldown entries
    pruneReminderCooldown(DEFAULT_CONFIG.reminderIntervalHours * 60 * 60 * 1000);

    const caseManager = getSupportCaseManager();

    // Get all non-closed cases across all guilds
    // We iterate guilds from the client cache
    const allCases: AiCase[] = [];
    for (const [, guild] of client.guilds.cache) {
      const guildCases = caseManager.getGuildCases(guild.id);
      allCases.push(...guildCases);
    }

    if (allCases.length === 0) return;

    const activeCases = allCases.filter(c => c.status !== "closed");

    // Stale case reminders
    const staleCases = findStaleCases(activeCases, DEFAULT_CONFIG);
    for (const c of staleCases) {
      const reason = c.status === "waiting_user" || c.status === "waiting_staff"
        ? "awaiting response"
        : "inactive";
      await sendStaleReminder(client, c, reason);
    }

    // Auto-escalation
    const escalationCandidates = findEscalationCandidates(activeCases, DEFAULT_CONFIG);
    for (const c of escalationCandidates) {
      await sendAutoEscalation(client, c);
    }

    // Auto-close resolved cases
    const closeCandidates = findAutoCloseCandidates(allCases, DEFAULT_CONFIG);
    for (const c of closeCandidates) {
      await sendAutoClose(client, c);
    }

    if (staleCases.length > 0 || escalationCandidates.length > 0 || closeCandidates.length > 0) {
      logger.info(`🎫 Support automation: ${staleCases.length} stale, ${escalationCandidates.length} escalated, ${closeCandidates.length} closed`);
    }
  } catch (error) {
    logger.error(`Support automation tick failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/* ================================================================
 * START / STOP
 * ================================================================ */

export function startSupportAutomation(client: Client): void {
  if (automationInterval) return;

  // Run every 30 minutes
  automationInterval = setInterval(() => {
    runAutomationTick(client).catch(() => {});
  }, 30 * 60 * 1000);

  // Don't keep process alive
  if (automationInterval && typeof automationInterval === "object" && "unref" in automationInterval) {
    automationInterval.unref();
  }

  // Run once after a short delay
  setTimeout(() => {
    runAutomationTick(client).catch(() => {});
  }, 60_000);

  logger.info("🎫 Support automation started (interval: 30min)");
}

export function stopSupportAutomation(): void {
  if (automationInterval) {
    clearInterval(automationInterval);
    automationInterval = null;
  }
  REMINDER_COOLDOWN.clear();
}
