/* ================================================================
 * AI SOCIAL — Participation Decision Engine
 *
 * Determines whether AshenAI should participate in a conversation.
 * Uses lightweight heuristics before invoking the AI to minimize
 * unnecessary API calls.
 * ================================================================ */

import { logger } from "../../logger";

export interface SocialDecisionInput {
  /** The message content */
  content: string;
  /** User ID of the message author */
  authorId: string;
  /** Channel ID */
  channelId: string;
  /** Guild ID */
  guildId: string;
  /** Whether the message mentions the bot */
  isMention: boolean;
  /** Whether the message is a reply to the bot */
  isReplyToBot: boolean;
  /** Whether the message is in a DM */
  isDM: boolean;
  /** Number of messages in channel recently */
  recentMessageCount: number;
  /** Whether the channel has the AI_SOCIAL scope */
  hasSocialScope: boolean;
  /** Channel-specific config */
  channelConfig?: {
    enabled: boolean;
    cooldownMs: number;
    responseProbability: number;
    debateEnabled: boolean;
    contextWindow: number;
    minActivityThreshold: number;
  };
  /** Whether the bot is on cooldown */
  isOnCooldown: boolean;
  /** Whether the global cooldown is active */
  isGlobalCooldownActive: boolean;
  /** Whether the hourly limit is reached */
  isHourlyLimitReached: boolean;
  /** Whether the user is on cooldown */
  isUserOnCooldown: boolean;
  /** Whether this is a duplicate response */
  isDuplicate: boolean;
}

export type SocialDecision =
  | { action: "respond"; reason: string; contextWindow: number }
  | { action: "skip"; reason: string };

/* ================================================================
 * HEURISTIC CHECKS (lightweight, no AI calls)
 * ================================================================ */

/** Words/patterns that indicate a question directed at the group */
const QUESTION_PATTERNS = [
  /\?$/,
  /\bwhat\b/i,
  /\bhow\b/i,
  /\bwhy\b/i,
  /\bwhen\b/i,
  /\bwhere\b/i,
  /\bwho\b/i,
  /\bcan\s+(?:someone|anyone|you)\b/i,
  /\bdoes\s+anyone\b/i,
  /\bany\s+ideas\b/i,
  /\bthoughts\b/i,
  /\bopinion\b/i,
  /\bthink\b/i,
];

/** Patterns that indicate a debate/disagreement */
const DEBATE_PATTERNS = [
  /\b(?:disagree|wrong|incorrect|not\s+true|that'?s?\s+not)\b/i,
  /\b(?:actually|fact(?:s|is)|reality|truth)\b/i,
  /\b(?:prove|evidence|source|citation)\b/i,
  /\bbut\b.*\b(?:I|you|they)\b/i,
  /\b(?:fair\s+point|good\s+point|valid)\b.*\bbut\b/i,
];

/** Patterns that indicate the conversation is between humans (stay quiet) */
const HUMAN_ONLY_PATTERNS = [
  /\b(?:brb|gtg|afk|ttyl|gn|gm|good\s+morning|good\s+night)\b/i,
  /\b(?:lol|haha|lmao|rofl|xd)\b/i,
  /\b(?:same|fr|ngl|istg|smh)\b/i,
  /^(?:yes|no|ok|okay|nice|cool|great|thanks|thx|ty|np|nvm)$/i,
];

/** Words that suggest the topic is relevant to an AI assistant */
const AI_RELEVANT_PATTERNS = [
  /\b(?:bot|ai|ashen|assistant)\b/i,
  /\b(?:help|question|how\s+do|what\s+is|explain)\b/i,
  /\b(?:code|programming|developer|dev)\b/i,
  /\b(?:server|discord|mod|admin|setup)\b/i,
  /\b(?:game|play|score|leaderboard)\b/i,
];

/**
 * Make a participation decision using lightweight heuristics.
 * This does NOT call the AI — it uses local checks only.
 */
export function makeSocialDecision(input: SocialDecisionInput): SocialDecision {
  // === HARD BLOCKS (always skip) ===

  // DMs — AI Social is only for guild channels
  if (input.isDM) {
    return { action: "skip", reason: "DM" };
  }

  // No social scope — channel not configured
  if (!input.hasSocialScope) {
    return { action: "skip", reason: "no_social_scope" };
  }

  // Channel not enabled in social config
  if (input.channelConfig && !input.channelConfig.enabled) {
    return { action: "skip", reason: "channel_disabled" };
  }

  // Cooldowns
  if (input.isOnCooldown) {
    return { action: "skip", reason: "channel_cooldown" };
  }
  if (input.isGlobalCooldownActive) {
    return { action: "skip", reason: "global_cooldown" };
  }
  if (input.isHourlyLimitReached) {
    return { action: "skip", reason: "hourly_limit" };
  }
  if (input.isUserOnCooldown) {
    return { action: "skip", reason: "user_cooldown" };
  }
  if (input.isDuplicate) {
    return { action: "skip", reason: "duplicate_response" };
  }

  // === PRIORITY PATHS (always respond) ===

  // Direct mention — always respond
  if (input.isMention) {
    return {
      action: "respond",
      reason: "direct_mention",
      contextWindow: input.channelConfig?.contextWindow || 20,
    };
  }

  // Reply to bot — always respond
  if (input.isReplyToBot) {
    return {
      action: "respond",
      reason: "reply_to_bot",
      contextWindow: input.channelConfig?.contextWindow || 20,
    };
  }

  // === HEURISTIC CHECKS ===

  const content = input.content.trim();

  // Empty or very short messages — skip
  if (content.length < 5) {
    return { action: "skip", reason: "message_too_short" };
  }

  // Human-only patterns (casual banter) — skip
  if (HUMAN_ONLY_PATTERNS.some((p) => p.test(content))) {
    return { action: "skip", reason: "casual_banter" };
  }

  // Minimum activity threshold — need enough conversation to participate
  const minActivity = input.channelConfig?.minActivityThreshold || 3;
  if (input.recentMessageCount < minActivity) {
    return { action: "skip", reason: "below_activity_threshold" };
  }

  // Check if the topic is relevant to AI
  const isRelevant = AI_RELEVANT_PATTERNS.some((p) => p.test(content));

  // Check if it's a question
  const isQuestion = QUESTION_PATTERNS.some((p) => p.test(content));

  // Check if it's a debate
  const isDebate = DEBATE_PATTERNS.some((p) => p.test(content));

  // If it's a debate but debate is disabled — skip
  if (isDebate && !input.channelConfig?.debateEnabled) {
    return { action: "skip", reason: "debate_disabled" };
  }

  // Apply response probability
  const probability = input.channelConfig?.responseProbability || 0.3;
  const random = Math.random();

  // Questions get a boost
  if (isQuestion && isRelevant) {
    if (random < probability * 1.5) {
      return {
        action: "respond",
        reason: "relevant_question",
        contextWindow: input.channelConfig?.contextWindow || 20,
      };
    }
  }

  // Debate gets a boost if enabled
  if (isDebate && input.channelConfig?.debateEnabled) {
    if (random < probability * 1.3) {
      return {
        action: "respond",
        reason: "debate_participation",
        contextWindow: input.channelConfig?.contextWindow || 20,
      };
    }
  }

  // General relevance check
  if (isRelevant && random < probability) {
    return {
      action: "respond",
      reason: "relevant_conversation",
      contextWindow: input.channelConfig?.contextWindow || 20,
    };
  }

  // Default: skip (don't participate)
  return { action: "skip", reason: "not_relevant" };
}

/**
 * Build a social context prompt for the AI.
 * This is used when the decision is to respond.
 */
export function buildSocialContext(
  decision: SocialDecision,
  recentMessages: Array<{ author: string; content: string; timestamp: number }>,
): string {
  if (decision.action !== "respond") return "";

  const lines: string[] = [
    "SOCIAL CONTEXT: You are participating in a Discord conversation.",
    "Respond naturally, like a regular community member.",
    "Do not announce yourself as an AI or bot.",
    "Keep your response concise and relevant.",
    "Do not respond to every message — only when you have something useful to add.",
    "",
  ];

  if (recentMessages.length > 0) {
    lines.push("Recent conversation:");
    for (const msg of recentMessages.slice(-10)) {
      lines.push(`  ${msg.author}: ${msg.content}`);
    }
    lines.push("");
  }

  switch (decision.reason) {
    case "relevant_question":
      lines.push("Someone asked a question you can help with. Answer naturally.");
      break;
    case "debate_participation":
      lines.push("There's a discussion with differing viewpoints. Share your perspective if you have something meaningful to add.");
      break;
    case "relevant_conversation":
      lines.push("The conversation is on a topic you can contribute to. Add something useful.");
      break;
    default:
      lines.push("Join the conversation naturally if you have something to add.");
  }

  return lines.join("\n");
}
