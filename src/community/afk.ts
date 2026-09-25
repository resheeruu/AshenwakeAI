/* ================================================================
 * AFK SYSTEM (prefix-only)
 *
 * Commands (literal "!" — no prefix abstraction exists yet):
 *   !afk                 → set AFK with the default message
 *   !afk <free-form>     → set AFK with a sanitized message (≤100, one line)
 *   !afk off             → clear AFK (exact trimmed, case-insensitive)
 *
 * State lives in SQLite (afk_states, PK(guild_id, user_id)) — the
 * database is authoritative and survives restarts. In-memory state
 * here is ONLY the notification dedup cache and the command rate
 * limiter (both reset on process restart).
 *
 * Every reply goes through the shared safeReply helper
 * (allowedMentions: { parse: [] }) — AFK can never ping
 * @everyone/@here/@role/@user.
 *
 * Auto-clear (social.afkAutoClear, default true): a normal guild
 * message from an AFK user clears their state with a single
 * "welcome back" reply. The AFK command itself returns before
 * auto-clear so it never clears freshly-set state.
 * ================================================================ */

import type { Message } from "discord.js";
import { LRUCache } from "lru-cache";
import { logger } from "../logger";
import { UserRateLimiter } from "../security/rate-limit";
import { loadGuildConfig } from "../core/guild-config";
import {
  safeReply,
  buildDiscordResponse,
  type ActionResult,
} from "../games/anime-actions";
import {
  setAfk,
  clearAfk,
  listAfkByUserIds,
  type AfkState,
} from "../database/afk-repo";
import {
  resolveLocalGif,
  type AfkCategory,
  type LocalGifAsset,
} from "../media/local-gifs";

/* ================================================================
 * CONSTANTS
 * ================================================================ */

/** Literal prefix for this phase — the repo has no prefix abstraction. */
export const AFK_COMMAND_PREFIX = "!";
/** Hard maximum length of a persisted AFK message. */
export const AFK_MAX_MESSAGE_LENGTH = 100;
/** Used when `!afk` is invoked without a message. */
export const AFK_DEFAULT_MESSAGE = "AFK";
/** Dedicated AFK command limiter — Ash's limiter is never reused. */
export const AFK_RATE_LIMIT_MAX = 5;
export const AFK_RATE_LIMIT_WINDOW_MS = 60_000;

const NOTICE_DEDUP_MAX_ENTRIES = 500;
const NOTICE_DEDUP_TTL_MS = 60_000;
const MAX_NOTICE_LINES = 8;
const MAX_NOTICE_CONTENT_LENGTH = 1800;
const DM_NOTICE =
  "🌙 AFK works in servers only — I can't track you here.";

const afkCommandRateLimiter = new UserRateLimiter(
  AFK_RATE_LIMIT_MAX,
  AFK_RATE_LIMIT_WINDOW_MS,
);

/** Bounded dedup: keyed by channel + AFK user, never grows past max. */
const noticeDedup = new LRUCache<string, true>({
  max: NOTICE_DEDUP_MAX_ENTRIES,
  ttl: NOTICE_DEDUP_TTL_MS,
});

/* ================================================================
 * PARSING
 * ================================================================ */

export type AfkCommand =
  | { kind: "set"; message: string }
  | { kind: "off" };

/** Single-line, control-char-free, length-capped sanitization. */
export function sanitizeAfkMessage(
  raw: string,
  maxLen: number = AFK_MAX_MESSAGE_LENGTH,
): string {
  if (typeof raw !== "string") return "";
  const oneLine = raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Code-point slice so surrogate pairs are never split.
  return Array.from(oneLine).slice(0, maxLen).join("").trim();
}

/**
 * Parse an AFK command from a raw message.
 * Returns null when the message is not an AFK command.
 *
 * Exact semantics:
 *  - the message must START with "!afk" followed by whitespace or EOL
 *    (case-insensitive command word; "!afkx" is not a command)
 *  - rest === ""            → set with AFK_DEFAULT_MESSAGE
 *  - rest === "off" (exact, trimmed, case-insensitive) → clear
 *    ("!afk off to the races" is FREE-FORM text, not a clear)
 *  - anything else          → set with the sanitized free-form text
 */
export function parseAfkCommand(content: string): AfkCommand | null {
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  if (!/^!afk(\s|$)/i.test(trimmed)) return null;

  const rest = trimmed.slice(4).trim();
  if (rest === "") return { kind: "set", message: AFK_DEFAULT_MESSAGE };
  if (rest.toLowerCase() === "off") return { kind: "off" };

  const sanitized = sanitizeAfkMessage(rest);
  if (!sanitized) return { kind: "set", message: AFK_DEFAULT_MESSAGE };
  return { kind: "set", message: sanitized };
}

/* ================================================================
 * CLASSIFICATION (media-selection hint only)
 * ================================================================ */

interface CategoryRule {
  category: AfkCategory;
  patterns: RegExp[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "eating",
    patterns: [
      /\beating\b/i,
      /\bfood\b/i,
      /\blunch\b/i,
      /\bdinner\b/i,
      /\bbreakfast\b/i,
      /\bsnack/i,
      /\bpizza\b/i,
      /\bgrub\b/i,
      /\bcook(ing)?\b/i,
    ],
  },
  {
    category: "sleep",
    patterns: [
      /\bsleep/i,
      /\bnap\b/i,
      /\bnapping\b/i,
      /\bbed\b/i,
      /\bsnooz/i,
      /\bdream/i,
      /\btired\b/i,
      /\bzz+/i,
    ],
  },
  {
    category: "grass",
    patterns: [
      /\btouch(ing)? grass\b/i,
      /\bgrass\b/i,
      /\boutside\b/i,
      /\bwalk(ing)?\b/i,
    ],
  },
  {
    category: "work",
    patterns: [
      /\bwork/i,
      /\boffice\b/i,
      /\bjob\b/i,
      /\bmeeting\b/i,
      /\bshift\b/i,
      /\bemployment\b/i,
    ],
  },
  {
    category: "gaming",
    patterns: [
      /\bgam(e|es|ing)\b/i,
      /\bplaying\b/i,
      /\bvideogames?\b/i,
      /\bstream(ing)?\b/i,
      /\branked\b/i,
    ],
  },
  {
    category: "study",
    patterns: [
      /\bstudy/i,
      /\bhomework\b/i,
      /\bexam\b/i,
      /\bschool\b/i,
      /\bclass\b/i,
      /\brevision\b/i,
      /\breading\b/i,
    ],
  },
  {
    category: "break",
    patterns: [/\bbreak\b/i, /\brest(ing)?\b/i, /\bpause\b/i],
  },
  {
    category: "away",
    patterns: [
      /\baway\b/i,
      /\bback later\b/i,
      /\bbe right back\b/i,
      /\bbrb\b/i,
      /\bout (for|of)\b/i,
      /\bgone\b/i,
      /\bnot around\b/i,
    ],
  },
];

const TRAVERSAL_LIKE = /(\.\.[/\\])/;

/**
 * Deterministic keyword classification into the fixed category
 * allowlist. The raw user message is NEVER used as a path —
 * traversal-like text short-circuits to "generic" before any
 * keyword rule can match.
 */
export function classifyAfkCategory(message: string): AfkCategory {
  if (typeof message !== "string" || message.length === 0) return "generic";
  if (TRAVERSAL_LIKE.test(message)) return "generic";
  for (const rule of CATEGORY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(message)) return rule.category;
    }
  }
  return "generic";
}

/* ================================================================
 * ELAPSED TIME
 * ================================================================ */

export function formatElapsed(
  startedAt: number,
  now: number = Date.now(),
): string {
  const diff = Math.max(0, (Number(now) || 0) - (Number(startedAt) || 0));
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/* ================================================================
 * MEDIA (local only — specific → away → generic → text)
 * ================================================================ */

async function resolveAfkMedia(
  category: AfkCategory,
): Promise<LocalGifAsset | null> {
  // Approved chain: specific → away → generic → text.
  // category "away" skips itself (already the middle step);
  // category "generic" is the last step (never falls back to away).
  const chain: string[] = [];
  if (category !== "generic") {
    if (category !== "away") chain.push(`afk:${category}`);
    chain.push("afk:away");
    chain.push("afk:generic");
  } else {
    chain.push("afk:generic");
  }

  for (const key of chain) {
    try {
      const asset = await resolveLocalGif(key);
      if (asset) return asset;
    } catch (error) {
      logger.warn(
        `afk_media result=local_error key=${key} detail=${error instanceof Error ? error.message : "unknown"}`,
      );
      return null; // Fail closed to text — no remote fallback for AFK.
    }
  }
  return null;
}

function localActionResult(
  text: string,
  asset: LocalGifAsset | null,
): ActionResult {
  if (!asset) return { text };
  return {
    text,
    animationSource: "local",
    localMediaPath: asset.relPath,
    localMediaAsset: asset,
  };
}

/* ================================================================
 * COMMAND HANDLING
 * ================================================================ */

function inlineText(raw: string, maxLen: number): string {
  return sanitizeAfkMessage(raw, maxLen);
}

function autoClearEnabled(guildId: string): boolean {
  try {
    const cfg = loadGuildConfig(guildId);
    // Documented default is ON; a failed read falls back to it too
    // so users are never permanently stuck AFK by a config outage.
    return cfg?.social?.afkAutoClear ?? true;
  } catch (error) {
    logger.warn(
      `afk config_read_failed guild=${guildId} detail=${error instanceof Error ? error.message : "unknown"} fallback=autoClear_on`,
    );
    return true;
  }
}

/**
 * Handle a parsed AFK command. Always replies through safeReply.
 * Uses the dedicated 5/60s AFK limiter (never Ash's).
 */
export async function handleAfkCommand(
  message: Message,
  command: AfkCommand,
): Promise<void> {
  const rate = afkCommandRateLimiter.check(message.author.id);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs || 1000) / 1000);
    await safeReply(message, `Slow down! Try again in ${retrySeconds}s.`);
    return;
  }

  // AFK is guild-scoped — never create rows without a real guild id.
  if (!message.guildId) {
    await safeReply(message, DM_NOTICE);
    return;
  }

  if (command.kind === "off") {
    const removed = clearAfk(message.guildId, message.author.id);
    await safeReply(
      message,
      removed
        ? "👋 Welcome back — your AFK has been cleared."
        : "You weren't AFK, so there was nothing to clear.",
    );
    return;
  }

  const afkMessage = sanitizeAfkMessage(command.message) || AFK_DEFAULT_MESSAGE;
  const saved = setAfk(message.guildId, message.author.id, afkMessage);

  if (!saved) {
    // Never claim AFK protection that was not persisted.
    await safeReply(
      message,
      "⚠️ I couldn't save your AFK state — please try `!afk` again in a moment.",
    );
    return;
  }

  const clears = autoClearEnabled(message.guildId);
  await safeReply(
    message,
    `🌙 You are now AFK: "${afkMessage}" —${
      clears
        ? " I'll announce it if someone mentions you, and clear it when you send a normal message."
        : " auto-clear is OFF in this server, so say `!afk off` when you're back."
    }`,
  );
}

/* ================================================================
 * MESSAGE PROCESSING (auto-clear + mention notifications)
 * ================================================================ */

function displayNameFor(message: Message, userId: string): string {
  const member = message.mentions.members?.get(userId);
  const user = message.mentions.users.get(userId);
  const raw = member?.displayName ?? user?.displayName ?? user?.username ?? "Someone";
  return inlineText(raw, 64) || "Someone";
}

interface NoticeBuild {
  content: string;
  included: AfkState[];
}

function buildNotice(
  states: AfkState[],
  nameOf: (userId: string) => string,
  now: number,
): NoticeBuild {
  const lines: string[] = [];
  const included: AfkState[] = [];

  for (const state of states) {
    const reason = inlineText(state.message, AFK_MAX_MESSAGE_LENGTH) || AFK_DEFAULT_MESSAGE;
    const line = `🌙 ${nameOf(state.userId)} is AFK: "${reason}" — ${formatElapsed(state.startedAt, now)}.`;
    const candidate = lines.length > 0 ? `${lines.join("\n")}\n${line}` : line;
    if (lines.length >= MAX_NOTICE_LINES) break;
    if (candidate.length > MAX_NOTICE_CONTENT_LENGTH) break;
    lines.push(line);
    included.push(state);
  }

  return { content: lines.join("\n"), included };
}

/**
 * Called for every non-command guild message (after the bot filter
 * and assistant-channel gate, before the Ash intercept):
 *  1) auto-clear the author's own AFK (if enabled) + one reply
 *  2) consolidated mention notice for other AFK users mentioned
 *
 * Never mutates AFK state through mentions, never notifies self,
 * dedupes per channel + AFK user, guild-isolated throughout.
 */
export async function processAfkOnMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  const guildId = message.guildId;
  if (!guildId) return;

  const authorId = message.author.id;

  // 1) AUTO-CLEAR (before mention scan: a returning user who mentions
  //    themselves must not get a notice of their own AFK).
  if (autoClearEnabled(guildId)) {
    const removed = clearAfk(guildId, authorId);
    if (removed) {
      await safeReply(message, "👋 Welcome back! Your AFK has been cleared.");
    }
  }

  // 2) MENTION NOTICES — read-only against afk_states.
  const mentionedIds = [...message.mentions.users.keys()].filter(
    (id) => id !== authorId,
  );
  if (mentionedIds.length === 0) return;

  const states = listAfkByUserIds(guildId, mentionedIds);
  if (states.length === 0) return;

  // Preserve mention order for deterministic notice rendering.
  states.sort(
    (a, b) => mentionedIds.indexOf(a.userId) - mentionedIds.indexOf(b.userId),
  );

  const now = Date.now();
  const fresh = states.filter(
    (state) =>
      !noticeDedup.has(`${message.channel.id}:${state.userId}`),
  );
  if (fresh.length === 0) return;

  const notice = buildNotice(fresh, (userId) => displayNameFor(message, userId), now);
  if (!notice.content) return;

  // Mark dedup BEFORE replying so a failing reply cannot cause repeats.
  for (const state of notice.included) {
    noticeDedup.set(`${message.channel.id}:${state.userId}`, true);
  }

  try {
    const category = classifyAfkCategory(notice.included[0]?.message ?? "");
    const asset = await resolveAfkMedia(category);
    const payload = await buildDiscordResponse(
      localActionResult(notice.content, asset),
    );
    await safeReply(message, payload);
  } catch (error) {
    logger.warn(
      `afk notify_failed guild=${guildId} detail=${error instanceof Error ? error.message : "unknown"}`,
    );
    // The notice itself is worth delivering even if media failed.
    await safeReply(message, { content: notice.content });
  }
}

/* ================================================================
 * TEST HOOKS
 * ================================================================ */

/**
 * Reset in-memory AFK state: the notice dedup cache (and nothing
 * else — the database is untouched, and the command rate limiter
 * keeps its 5/60s window, exactly as it does across a restart).
 * Test-only.
 */
export function resetAfkInMemoryForTests(): void {
  noticeDedup.clear();
}

/** Current notice-dedup size (test/bounds assertions). */
export function afkNoticeDedupSize(): number {
  return noticeDedup.size;
}
