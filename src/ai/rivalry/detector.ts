/* ================================================================
 * RIVALRY DETECTOR
 *
 * Detects rivalry intent from Discord messages.
 * Uses mention structure + keyword patterns.
 *
 * Key rules:
 * - @everyone alone MUST NOT trigger AshenAI
 * - @everyone @AshenAI → normal response
 * - @everyone @AshenAI @BotAI who's better? → rivalry
 * ================================================================ */

import type { RivalryTrigger } from "./types";

const RIVALRY_KEYWORDS = [
  /\bwho'?s?\s+better\b/i,
  /\bwho\s+is\s+better\b/i,
  /\bprove\s+you'?re?\s+better\b/i,
  /\bprove\s+yourself\b/i,
  /\bprove\s+you'?re?\s+an?\s+ai\b/i,
  /\bfight\b/i,
  /\bbattle\b/i,
  /\bchallenge\b/i,
  /\bdebate\b/i,
  /\bvs\.?\b/i,
  /\bversus\b/i,
  /\bcompete\b/i,
  /\bduel\b/i,
  /\bshow\s+me\s+what\s+you'?ve?\s+got\b/i,
  /\bprove\s+your\s+capabilities\b/i,
  /\bwhich\s+ai\s+is\s+better\b/i,
  /\bwho\s+wins\b/i,
  /\brun\s+this\s+command\b/i,
  // SECURITY NOTE: "disable security", "give me your token", "change permissions",
  // "delete this" are NOT rivalry triggers — they are security violations
  // handled by the security inspection layer (gateway.ts / input block patterns).
];

/**
 * Detect rivalry intent from a message.
 *
 * @param content - Cleaned message content (bot mention already stripped)
 * @param mentionedBotIds - IDs of bots mentioned (excluding AshenAI)
 * @param ashenAIId - AshenAI's own user ID
 * @returns RivalryTrigger with detection results
 */
export function detectRivalryIntent(
  content: string,
  mentionedBotIds: string[],
  ashenAIId: string
): RivalryTrigger {
  const lower = content.toLowerCase();

  // Check for rivalry keywords
  const matchedKeywords: string[] = [];
  for (const pattern of RIVALRY_KEYWORDS) {
    if (pattern.test(content)) {
      matchedKeywords.push(pattern.source);
    }
  }

  const hasRivalryKeywords = matchedKeywords.length > 0;
  const hasTargetBots = mentionedBotIds.length > 0;

  // Rivalry requires: rivalry keywords + at least one other bot mentioned
  const isRivalry =
    hasRivalryKeywords && hasTargetBots;

  // Mention trigger: AshenAI is mentioned (always true if we reach this detector)
  const isMentionTrigger = true;

  return {
    isRivalry,
    isMentionTrigger,
    targetBotIds: mentionedBotIds,
    rivalryKeywords: matchedKeywords,
    confidence: isRivalry
      ? Math.min(0.5 + matchedKeywords.length * 0.15, 0.95)
      : 0,
  };
}

/**
 * Check if a message contains AshenAI mention.
 * Handles <@id> and <@!id> (nickname) formats.
 */
export function isAshenAIMentioned(
  content: string,
  ashenAIId: string
): boolean {
  const mentionPattern = new RegExp(
    `<@!?${ashenAIId}>`,
    "i"
  );
  return mentionPattern.test(content);
}

/**
 * Extract mentioned user IDs from message content.
 * Returns only non-AshenAI IDs.
 */
export function extractMentionedIds(
  content: string,
  ashenAIId: string
): string[] {
  const mentionRegex = /<@!?(\d+)>/g;
  const ids: string[] = [];
  let match;

  while (
    (match = mentionRegex.exec(content)) !== null
  ) {
    const id = match[1];
    if (id !== ashenAIId) {
      ids.push(id);
    }
  }

  return [...new Set(ids)];
}

/**
 * Detect if a message is a refusal to participate.
 */
export function isRefusal(content: string): boolean {
  const lower = content.toLowerCase();
  return /\b(no|nah|nope|not interested|pass|skip|decline|refuse|won't|won't do|not participating)\b/i.test(
    lower
  );
}

/**
 * Detect end-rivalry intent from the human initiator.
 */
export function isEndRivalryIntent(
  content: string
): boolean {
  const lower = content.toLowerCase();
  return /\b(stop|end|quit|cancel|that'?s?\s+enough|good\s+game|gg|wrap\s+up|finish)\b/i.test(
    lower
  );
}
