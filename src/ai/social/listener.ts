/* ================================================================
 * AI SOCIAL — Message Listener
 *
 * Processes messages in AI Social-enabled channels and determines
 * whether AshenAI should participate. Integrates with the existing
 * AI router, memory, and cooldown systems.
 * ================================================================ */

import type { Client, Message } from "discord.js";
import { logger } from "../../logger";
import { loadGuildConfig } from "../../core/guild-config";
import { getSocialCooldown } from "./cooldown";
import { makeSocialDecision, buildSocialContext, type SocialDecisionInput } from "./decision";

/* ================================================================
 * SOCIAL CONTEXT CACHE
 *
 * Stores recent messages per channel for context building.
 * Bounded to prevent memory growth.
 * ================================================================ */

interface CachedMessage {
  author: string;
  content: string;
  timestamp: number;
}

const socialContextCache = new Map<string, CachedMessage[]>();
const MAX_CONTEXT_MESSAGES = 50;
const CONTEXT_TTL_MS = 30 * 60 * 1000; // 30 minutes

function addMessageToContext(
  channelId: string,
  author: string,
  content: string,
): void {
  const messages = socialContextCache.get(channelId) || [];
  messages.push({ author, content, timestamp: Date.now() });

  // Trim old messages
  const cutoff = Date.now() - CONTEXT_TTL_MS;
  const trimmed = messages.filter((m) => m.timestamp > cutoff).slice(-MAX_CONTEXT_MESSAGES);
  socialContextCache.set(channelId, trimmed);
}

function getRecentMessages(channelId: string, limit: number): CachedMessage[] {
  const messages = socialContextCache.get(channelId) || [];
  const cutoff = Date.now() - CONTEXT_TTL_MS;
  return messages.filter((m) => m.timestamp > cutoff).slice(-limit);
}

/* ================================================================
 * MAIN SOCIAL MESSAGE HANDLER
 *
 * Called from the main message handler for messages that:
 * - Are in a guild channel (not DM)
 * - Are not from a bot
 * - Did not trigger the normal mention/reply flow
 *
 * Returns true if the message was handled (response sent or skipped).
 * Returns false if the normal flow should continue.
 * ================================================================ */

export async function handleSocialMessage(
  message: Message,
  client: Client,
  options: {
    generateAI: (messages: Array<{ role: string; content: string }>) => Promise<string | null>;
  },
): Promise<boolean> {
  const { author, channel, guild, content } = message;

  // Safety checks
  if (!guild || !channel || !("id" in channel)) return false;
  if (author.bot) return false;

  const channelId = channel.id;
  const guildId = guild.id;
  const authorId = author.id;

  // Load guild config
  const guildConfig = loadGuildConfig(guildId);

  // Check if social is enabled for this guild
  if (!guildConfig.social?.enabled) return false;

  // Get channel config
  const channelConfig = guildConfig.social.channels?.[channelId];
  if (!channelConfig?.enabled) return false;

  // Add message to context cache
  addMessageToContext(channelId, author.displayName || author.username, content);

  // Get cooldown manager
  const cooldown = getSocialCooldown();

  // Build decision input
  const recentMessages = getRecentMessages(channelId, 20);
  const decisionInput: SocialDecisionInput = {
    content,
    authorId,
    channelId,
    guildId,
    isMention: false, // Already handled by normal flow
    isReplyToBot: false, // Already handled by normal flow
    isDM: false,
    recentMessageCount: recentMessages.length,
    hasSocialScope: true, // We already checked social.enabled
    channelConfig,
    isOnCooldown: cooldown.isChannelOnCooldown(channelId, channelConfig.cooldownMs),
    isGlobalCooldownActive: cooldown.isGlobalOnCooldown(
      guildId,
      guildConfig.social.globalCooldownMs || 30_000
    ),
    isHourlyLimitReached: cooldown.isHourlyLimitReached(
      guildId,
      guildConfig.social.maxResponsesPerHour || 10
    ),
    isUserOnCooldown: cooldown.isUserOnCooldown(authorId, 5_000),
    isDuplicate: cooldown.isDuplicateResponse(guildId, content),
  };

  // Make participation decision
  const decision = makeSocialDecision(decisionInput);

  if (decision.action === "skip") {
    logger.debug(
      `Social skip: channel=${channelId} reason=${decision.reason}`
    );
    return true; // Handled (skipped)
  }

  // Build context for AI
  const socialContext = buildSocialContext(decision, recentMessages);

  // Get conversation memory for this channel
  // (Uses existing memory system if available)
  let conversationContext = "";
  try {
    // Import memory system dynamically to avoid circular deps
    const { ConversationMemory } = await import("../../ai/memory");
    // Use the singleton memory instance from the main module
    // If not available, skip memory context
    const memory = (globalThis as any).__ashenai_memory;
    if (memory && typeof memory.get === "function") {
      const history = memory.get(authorId, channelId);
      if (history && history.length > 0) {
        conversationContext = history
          .slice(-5)
          .map((h: { content: string }) => h.content)
          .join("\n");
      }
    }
  } catch {
    // Memory not available — continue without it
  }

  // Build the AI prompt
  const messages = [
    {
      role: "system",
      content: [
        socialContext,
        conversationContext ? `\nRecent conversation context:\n${conversationContext}` : "",
      ].filter(Boolean).join("\n"),
    },
    {
      role: "user",
      content: `The following message was posted in a Discord channel. If you have something useful to contribute, respond naturally. If not, respond with exactly "SKIP" (no other text).\n\nMessage from ${author.displayName || author.username}: "${content}"`,
    },
  ];

  try {
    const response = await options.generateAI(messages);

    // If AI says SKIP, don't send anything
    if (!response || response.trim().toUpperCase() === "SKIP" || response.trim().length === 0) {
      logger.debug(
        `Social AI decided not to respond: channel=${channelId}`
      );
      return true;
    }

    // Truncate long responses for social mode
    const truncated = response.length > 500
      ? response.slice(0, 497) + "..."
      : response;

    // Send the response
    await message.reply(truncated);

    // Record cooldown
    cooldown.recordResponse(channelId, guildId, authorId, truncated);

    logger.info(
      `Social response sent: channel=${channelId} reason=${decision.reason} len=${truncated.length}`
    );

    return true;
  } catch (error) {
    logger.warn(
      `Social AI generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return true; // Don't fall through to normal flow
  }
}

/* ================================================================
 * CONTEXT CLEANUP
 * ================================================================ */

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startSocialCleanup(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - CONTEXT_TTL_MS;
    for (const [channelId, messages] of socialContextCache) {
      const filtered = messages.filter((m) => m.timestamp > cutoff);
      if (filtered.length === 0) {
        socialContextCache.delete(channelId);
      } else {
        socialContextCache.set(channelId, filtered);
      }
    }
  }, 5 * 60 * 1000);

  cleanupTimer.unref();
}

export function stopSocialCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  socialContextCache.clear();
}
