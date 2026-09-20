import type { Client, Message, TextChannel } from "discord.js";
import { logger } from "../logger";
import { loadGuildConfig } from "../core/guild-config";
import { getSupportCaseManager } from "../support/case-manager";
import {
  orchestrateCaseConversation,
  startConversationCleanup,
  stopConversationCleanup,
} from "../support/ai-orchestrator";
import type { AiCase } from "../support/types";

/* ================================================================
 * SUPPORT CHANNEL HANDLER
 *
 * Detects messages in support ticket channels and routes them
 * to the AI orchestrator for case conversation management.
 *
 * Flow:
 *   Message → Check if in support channel → Find case for channel →
 *   Load case context → Route to AI orchestrator → Reply
 * ================================================================ */

/* ================================================================
 * CHANNEL → CASE MAPPING CACHE
 * ================================================================ */

const channelCaseCache = new Map<string, { caseId: string; guildId: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedCaseForChannel(channelId: string): { caseId: string; guildId: string } | null {
  const cached = channelCaseCache.get(channelId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    channelCaseCache.delete(channelId);
    return null;
  }
  return { caseId: cached.caseId, guildId: cached.guildId };
}

function setCachedCaseForChannel(channelId: string, caseId: string, guildId: string): void {
  channelCaseCache.set(channelId, {
    caseId,
    guildId,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/* ================================================================
 * ESCALATION NOTIFICATION IDEMPOTENCY
 *
 * Tracks which cases have been notified to prevent duplicate
 * staff notifications on repeated escalations.
 * ================================================================ */

const escalationNotifiedCases = new Map<string, number>(); // caseId → timestamp
const ESCALATION_NOTIFICATION_TTL_MS = 60 * 60 * 1000; // 1 hour

function wasEscalationNotified(caseId: string): boolean {
  const ts = escalationNotifiedCases.get(caseId);
  if (!ts) return false;
  if (Date.now() - ts > ESCALATION_NOTIFICATION_TTL_MS) {
    escalationNotifiedCases.delete(caseId);
    return false;
  }
  return true;
}

function markEscalationNotified(caseId: string): void {
  escalationNotifiedCases.set(caseId, Date.now());
}

/* ================================================================
 * FIND CASE FOR CHANNEL
 * ================================================================ */

function findCaseForChannel(channelId: string): AiCase | null {
  const cached = getCachedCaseForChannel(channelId);
  if (cached) {
    const caseManager = getSupportCaseManager();
    return caseManager.getCase(cached.caseId);
  }

  // Search for case with this channel ID
  const caseManager = getSupportCaseManager();
  const cases = caseManager.getChannelCases(channelId);

  // Find the most recent open/investigating case
  const activeCase = cases.find(c =>
    c.status !== "closed" && c.status !== "resolved"
  ) || cases[0];

  if (activeCase) {
    setCachedCaseForChannel(channelId, activeCase.id, activeCase.guildId);
    return activeCase;
  }

  return null;
}

/* ================================================================
 * IS SUPPORT CHANNEL
 * ================================================================ */

function isSupportChannel(channelId: string, guildId: string): boolean {
  const config = loadGuildConfig(guildId);
  const supportConfig = config.support;

  // Check if this channel has an active support case
  const cached = getCachedCaseForChannel(channelId);
  if (cached) return true;

  // Check configured support channels
  if (supportConfig?.channelId === channelId) return true;
  if (supportConfig?.categoryId) {
    // We'd need to check if the channel is in this category
    // but that requires the guild object. For now, rely on case lookup.
  }

  // Check if there's a case for this channel
  const caseManager = getSupportCaseManager();
  const cases = caseManager.getChannelCases(channelId);
  return cases.length > 0;
}

/* ================================================================
 * CHECK STAFF ROLE
 *
 * Resolves whether a user has any of the configured staff roles
 * by checking their Discord guild member roles.
 * ================================================================ */

function checkStaffRole(userId: string, guildId: string, client: Client): boolean {
  const staffRoleIds = getStaffRoleIds(guildId);
  if (staffRoleIds.length === 0) return false;

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;
    const member = guild.members.cache.get(userId);
    if (!member) return false;
    return member.roles.cache.some(role => staffRoleIds.includes(role.id));
  } catch {
    return false;
  }
}

function getStaffRoleIds(guildId: string): string[] {
  const config = loadGuildConfig(guildId);
  return config.staff?.roleIds ?? [];
}

/* ================================================================
 * HANDLE SUPPORT CHANNEL MESSAGE
 *
 * Called when a message is received in a potential support channel.
 * Returns true if the message was handled (should not be processed further).
 * ================================================================ */

export async function handleSupportChannelMessage(
  client: Client,
  message: Message,
): Promise<boolean> {
  // Skip bot messages
  if (message.author.bot) return false;

  const channelId = message.channel.id;
  const guildId = message.guild?.id;
  if (!guildId) return false;

  // Quick check: is this channel associated with a support case?
  const aiCase = findCaseForChannel(channelId);
  if (!aiCase) return false;

  // Guild isolation
  if (aiCase.guildId !== guildId) return false;

  // Don't process if case is fully closed
  if (aiCase.status === "closed") {
    try {
      await message.reply("This case has been closed. If you need further assistance, please create a new ticket.");
    } catch {
      // Channel might be read-only
    }
    return true;
  }

  // Extract mentioned user IDs (excluding the bot)
  const mentionedUserIds = message.mentions.users
    .filter(u => u.id !== client.user?.id)
    .map(u => u.id);

  // Get user name
  const userName = message.author.tag;

  // Resolve staff role from Discord membership (not from DB case assignment)
  const isStaff = checkStaffRole(message.author.id, guildId, client);

  try {
    // Route to AI orchestrator
    const result = await orchestrateCaseConversation(
      aiCase.id,
      channelId,
      message.author.id,
      userName,
      message.content,
      guildId,
      mentionedUserIds,
      {
        isStaff,
        discordMessageId: message.id,
      },
    );

    if (!result.shouldReply) return false;

    // Send reply
    try {
      await message.reply(result.reply);
    } catch (error) {
      logger.warn(`Failed to reply in support channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`);
      // Try sending to the channel directly
      try {
        const channel = message.channel as TextChannel;
        if (channel.send) {
          await channel.send(result.reply);
        }
      } catch {
        // Give up
      }
    }

    // Handle escalation notifications (idempotent — won't double-notify)
    if (result.escalateToStaff && !wasEscalationNotified(aiCase.id)) {
      await notifyStaffOfEscalation(client, aiCase, guildId, result.reply);
      markEscalationNotified(aiCase.id);
    }

    return true;
  } catch (error) {
    logger.error(`Error in support channel handler: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/* ================================================================
 * STAFF NOTIFICATION
 * ================================================================ */

async function notifyStaffOfEscalation(
  client: Client,
  aiCase: AiCase,
  guildId: string,
  summary: string,
): Promise<void> {
  try {
    const config = loadGuildConfig(guildId);
    const logChannelId = config.supportLogging?.channelId || config.logChannelId;

    if (!logChannelId) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
    if (!logChannel || !logChannel.isTextBased()) return;

    const typeEmoji = aiCase.type === "report" ? "🚨" : aiCase.type === "appeal" ? "🔨" : "🎫";
    const typeName = aiCase.type === "report" ? "Report" : aiCase.type === "appeal" ? "Appeal" : "Support";

    const staffMentions = (config.staff?.roleIds ?? [])
      .map(id => `<@&${id}>`)
      .join(" ");

    const embed = {
      title: `${typeEmoji} ${typeName} Case — ${aiCase.id}`,
      description: summary.substring(0, 2000),
      color: aiCase.type === "report" ? 0xef4444 : aiCase.type === "appeal" ? 0xf59e0b : 0x3b82f6,
      fields: [
        { name: "Status", value: aiCase.status, inline: true },
        { name: "Creator", value: `<@${aiCase.creatorId}>`, inline: true },
        { name: "Channel", value: `<#${aiCase.channelId}>`, inline: true },
      ],
      footer: { text: `Case ID: ${aiCase.id}` },
      timestamp: new Date().toISOString(),
    };

    const content = staffMentions ? `⚡ **Escalation** ${staffMentions}` : "⚡ **Case Escalation**";

    await logChannel.send({
      content,
      embeds: [embed],
    }).catch(() => {});

    // Update case flags
    const caseManager = getSupportCaseManager();
    caseManager.addMessage(aiCase.id, "system", `Case escalated to staff. Notified: ${logChannelId}`, true);

  } catch (error) {
    logger.warn(`Failed to notify staff of escalation: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/* ================================================================
 * START/STOP LIFECYCLE
 * ================================================================ */

export function initializeSupportChannelHandler(): void {
  startConversationCleanup();
  logger.info("🎫 Support channel handler initialized");
}

export function destroySupportChannelHandler(): void {
  stopConversationCleanup();
  channelCaseCache.clear();
}
