/* ================================================================
 * FUTURE AWARENESS EXTENSION POINTS
 *
 * Provides type definitions and interfaces for future features:
 * - Passive awareness (MENTION_ONLY / PASSIVE / ACTIVE)
 * - TTS (text-to-speech)
 * - AI-to-AI interaction
 *
 * These are TYPE-ONLY foundations. No behavioral changes.
 * The default awareness mode remains MENTION_ONLY.
 * ================================================================ */

/* ================================================================
 * AWARENESS MODE
 *
 * Controls how AshenAI responds to Discord messages.
 * ================================================================ */

export type AwarenessMode = "MENTION_ONLY" | "PASSIVE" | "ACTIVE";

export interface AwarenessConfig {
  /** Current mode. Default: MENTION_ONLY */
  mode: AwarenessMode;

  /** Maximum messages to process per minute in PASSIVE mode */
  passiveRateLimit: number;

  /** Maximum messages to process per minute per user in PASSIVE mode */
  perUserPassiveRateLimit: number;

  /** Maximum messages to process per minute per channel in PASSIVE mode */
  perChannelPassiveRateLimit: number;

  /** Keywords/phrases that trigger response even in PASSIVE mode */
  triggerKeywords: string[];

  /** Maximum conversation turns before forced cooldown */
  maxConversationTurns: number;

  /** Cooldown between AI responses to the same user (ms) */
  userCooldownMs: number;

  /** Cooldown between AI responses in the same channel (ms) */
  channelCooldownMs: number;

  /** Guild-wide daily limit on passive AI interactions */
  guildDailyLimit: number;

  /** Global daily limit on passive AI interactions */
  globalDailyLimit: number;
}

export const DEFAULT_AWARENESS_CONFIG: AwarenessConfig = {
  mode: "MENTION_ONLY",
  passiveRateLimit: 20,
  perUserPassiveRateLimit: 5,
  perChannelPassiveRateLimit: 10,
  triggerKeywords: [],
  maxConversationTurns: 5,
  userCooldownMs: 30_000,
  channelCooldownMs: 10_000,
  guildDailyLimit: 200,
  globalDailyLimit: 2000,
};

export interface PassiveFilterResult {
  /** Whether the message should trigger an AI response */
  shouldRespond: boolean;

  /** Reason for the decision */
  reason:
    | "mention"
    | "keyword"
    | "cooldown_user"
    | "cooldown_channel"
    | "rate_limit"
    | "guild_limit"
    | "global_limit"
    | "bot_loop"
    | "irrelevant"
    | "mode_disabled";

  /** Cooldown remaining in ms, if applicable */
  cooldownRemainingMs?: number;
}

/* ================================================================
 * TTS (TEXT-TO-SPEECH) FOUNDATION
 * ================================================================ */

export interface TTSConfig {
  /** Maximum characters per TTS request */
  maxCharacters: number;

  /** Per-user cooldown between TTS requests (ms) */
  perUserCooldownMs: number;

  /** Per-guild daily TTS character limit */
  guildDailyCharacterLimit: number;

  /** Global daily TTS character limit */
  globalDailyCharacterLimit: number;

  /** Cache TTL for identical TTS requests (ms) */
  cacheTtlMs: number;
}

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  maxCharacters: 500,
  perUserCooldownMs: 10_000,
  guildDailyCharacterLimit: 10_000,
  globalDailyCharacterLimit: 100_000,
  cacheTtlMs: 3_600_000,
};

export interface TTSRequest {
  userId: string;
  guildId: string;
  channelId: string;
  text: string;
  /** If true, use user-supplied text directly. If false, AI may rewrite. */
  directText: boolean;
}

export interface TTSResult {
  success: boolean;
  audioBuffer?: Buffer;
  format?: string;
  characterCount: number;
  cached: boolean;
  error?: string;
}

/* ================================================================
 * AI-TO-AI SAFETY FOUNDATION
 * ================================================================ */

export interface AIToAIConfig {
  /** Whether AI-to-AI interaction is enabled at all */
  enabled: boolean;

  /** Maximum conversation turns between bots */
  maxTurns: number;

  /** Cooldown between AI-to-AI sessions per user (ms) */
  perUserCooldownMs: number;

  /** Maximum concurrent AI-to-AI conversations */
  maxConcurrent: number;

  /** Timeout for a single AI-to-AI turn (ms) */
  turnTimeoutMs: number;

  /** Maximum tokens per AI-to-AI response */
  maxTokensPerResponse: number;
}

export const DEFAULT_AI_TO_AI_CONFIG: AIToAIConfig = {
  enabled: false,
  maxTurns: 6,
  perUserCooldownMs: 60_000,
  maxConcurrent: 3,
  turnTimeoutMs: 30_000,
  maxTokensPerResponse: 500,
};

export interface AIToAISession {
  id: string;
  initiatorUserId: string;
  guildId: string;
  channelId: string;
  targetBotId: string;
  startedAt: number;
  turns: number;
  lastTurnAt: number;
  active: boolean;
}

/* ================================================================
 * BOT-LOOP PREVENTION
 *
 * Detects and prevents uncontrolled bot-to-bot conversations.
 * ================================================================ */

const recentBotResponses = new Map<string, number>();
const BOT_LOOP_WINDOW_MS = 10_000;
const BOT_LOOP_THRESHOLD = 3;

export function detectBotLoop(
  botId: string,
  channelId: string
): boolean {
  const key = `${botId}:${channelId}`;
  const now = Date.now();
  const lastResponse = recentBotResponses.get(key) || 0;

  if (now - lastResponse < BOT_LOOP_WINDOW_MS) {
    const count = (recentBotResponses.get(`${key}:count`) as number) || 0;
    if (count >= BOT_LOOP_THRESHOLD) {
      return true;
    }
    recentBotResponses.set(`${key}:count`, count + 1);
  } else {
    recentBotResponses.set(`${key}:count`, 1);
  }

  recentBotResponses.set(key, now);
  return false;
}

export function isBotLoopPreventionActive(): boolean {
  return recentBotResponses.size > 0;
}

// Cleanup stale entries periodically
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentBotResponses) {
    if (now - timestamp > BOT_LOOP_WINDOW_MS * 2) {
      recentBotResponses.delete(key);
    }
  }
}, 60_000);

cleanupInterval.unref?.();
