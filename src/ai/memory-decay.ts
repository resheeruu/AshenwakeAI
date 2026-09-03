/**
 * Memory Decay — Ebbinghaus forgetting curve + importance scoring.
 *
 * Inspired by AgentOS's cognitive memory system. Adds importance tracking
 * and decay-based relevance scoring to conversation messages without
 * replacing the existing ConversationMemory architecture.
 *
 * Key concepts:
 * - Each message gets an importance score (0-1) based on content analysis
 * - Messages decay over time following the Ebbinghaus forgetting curve
 * - Retrieval (being included in context) strengthens memory
 * - High-importance messages decay slower
 * - Used by memory.ts to prioritize which messages to keep
 */

import { ChatMessage } from "./types";
import { logger } from "../logger";

/**
 * Importance signals that boost a message's base importance.
 */
const IMPORTANCE_SIGNALS = {
  /** Message contains a question */
  question: 0.15,
  /** Message contains a decision or conclusion */
  decision: 0.12,
  /** Message contains an error or problem report */
  error: 0.10,
  /** Message contains a name or entity reference */
  entity: 0.05,
  /** Message is longer than average (more content = more important) */
  length: 0.08,
  /** Message contains explicit action words */
  action: 0.10,
  /** Message is a system message */
  system: 0.30,
  /** Message contains code or technical content */
  technical: 0.08,
} as const;

/**
 * Patterns that signal importance in message content.
 */
const QUESTION_PATTERN = /\?|^(what|how|why|when|where|who|can|could|would|should|do|does|is|are|was|were|will|have|has|had)\b/i;
const DECISION_PATTERN = /\b(decided|conclusion|final|approved|rejected|confirmed|go with|choose|pick|select|plan is)\b/i;
const ERROR_PATTERN = /\b(error|failed|failure|bug|issue|broken|crash|exception|wrong|problem|cannot|can't|unable)\b/i;
const ACTION_PATTERN = /\b(implement|create|add|remove|fix|update|deploy|build|test|run|execute|install|configure|setup|migrate)\b/i;
const TECHNICAL_PATTERN = /\b(database|api|server|function|class|interface|type|module|import|export|async|await|promise|sql|http|json)\b/i;

/**
 * Calculate the base importance of a message (0-1).
 * Pure function — no side effects.
 */
export function computeImportance(message: ChatMessage): number {
  if (message.role === "system") {
    return IMPORTANCE_SIGNALS.system;
  }

  const content = message.content || "";
  let importance = 0.3; // base importance

  // Question detection
  if (QUESTION_PATTERN.test(content)) {
    importance += IMPORTANCE_SIGNALS.question;
  }

  // Decision detection
  if (DECISION_PATTERN.test(content)) {
    importance += IMPORTANCE_SIGNALS.decision;
  }

  // Error detection
  if (ERROR_PATTERN.test(content)) {
    importance += IMPORTANCE_SIGNALS.error;
  }

  // Action detection
  if (ACTION_PATTERN.test(content)) {
    importance += IMPORTANCE_SIGNALS.action;
  }

  // Technical content
  if (TECHNICAL_PATTERN.test(content)) {
    importance += IMPORTANCE_SIGNALS.technical;
  }

  // Length bonus (longer messages tend to be more substantive)
  if (content.length > 200) {
    importance += IMPORTANCE_SIGNALS.length;
  } else if (content.length > 100) {
    importance += IMPORTANCE_SIGNALS.length * 0.5;
  }

  // Entity detection (simple: capitalized words that aren't at sentence start)
  const entityMatches = content.match(/\b[A-Z][a-z]{2,}\b/g);
  if (entityMatches && entityMatches.length > 1) {
    importance += IMPORTANCE_SIGNALS.entity;
  }

  return Math.min(1.0, importance);
}

/**
 * Ebbinghaus forgetting curve: compute current strength of a memory.
 *
 * S(t) = S0 * e^(-Δt / stability)
 *
 * Where:
 * - S0 = initial encoding strength (importance at creation)
 * - Δt = time since last access (ms)
 * - stability = time constant (ms) — grows with retrieval count
 *
 * Pure function — no side effects.
 */
export function computeMemoryStrength(
  encodingStrength: number,
  lastAccessedAt: number,
  stability: number,
  now: number = Date.now(),
): number {
  const elapsed = Math.max(0, now - lastAccessedAt);
  return encodingStrength * Math.exp(-elapsed / stability);
}

/**
 * Compute stability (time constant) based on importance and retrieval count.
 * Higher importance = slower decay. More retrievals = slower decay.
 *
 * Pure function — no side effects.
 */
export function computeStability(
  importance: number,
  retrievalCount: number,
  baseStabilityMs: number = 3600_000, // 1 hour base
): number {
  // Importance scales stability: 0.3 importance = 1x, 1.0 importance = 3x
  const importanceMultiplier = 0.5 + importance * 2.5;

  // Each retrieval increases stability with diminishing returns
  const retrievalMultiplier = 1 + Math.log2(1 + retrievalCount) * 0.5;

  return baseStabilityMs * importanceMultiplier * retrievalMultiplier;
}

/**
 * Compute a retrieval score for ranking messages in context selection.
 * Combines strength, recency, and importance into a single score.
 *
 * Pure function — no side effects.
 */
export function computeRetrievalScore(
  importance: number,
  encodingStrength: number,
  lastAccessedAt: number,
  retrievalCount: number,
  now: number = Date.now(),
): number {
  const stability = computeStability(importance, retrievalCount);
  const strength = computeMemoryStrength(encodingStrength, lastAccessedAt, stability, now);

  // Recency boost: decays with half-life of 6 hours
  const recencyHalfLife = 6 * 3600_000;
  const recency = Math.exp(-(now - lastAccessedAt) / recencyHalfLife);

  // Weighted combination
  return (
    strength * 0.40 +
    importance * 0.30 +
    recency * 0.20 +
    Math.min(1.0, retrievalCount / 10) * 0.10
  );
}

/**
 * Metadata attached to each message for decay tracking.
 * Stored alongside the message in the conversation.
 */
export interface MessageDecayMeta {
  /** Base importance at creation (0-1) */
  importance: number;
  /** Encoding strength — starts equal to importance, updated on retrieval */
  encodingStrength: number;
  /** Number of times this message was retrieved into context */
  retrievalCount: number;
  /** Timestamp of last retrieval (ms) */
  lastAccessedAt: number;
  /** Stability (time constant) — recomputed on each access */
  stability: number;
}

/**
 * Create decay metadata for a new message.
 */
export function createDecayMeta(message: ChatMessage): MessageDecayMeta {
  const importance = computeImportance(message);
  const stability = computeStability(importance, 0);
  const now = Date.now();

  return {
    importance,
    encodingStrength: importance,
    retrievalCount: 0,
    lastAccessedAt: now,
    stability,
  };
}

/**
 * Update decay metadata when a message is retrieved into context.
 * Strengthens the memory (spaced repetition effect).
 */
export function updateOnRetrieval(meta: MessageDecayMeta): MessageDecayMeta {
  const now = Date.now();

  // Strengthen on retrieval
  const newRetrievalCount = meta.retrievalCount + 1;
  const newStability = computeStability(meta.importance, newRetrievalCount);

  return {
    ...meta,
    retrievalCount: newRetrievalCount,
    lastAccessedAt: now,
    stability: newStability,
    encodingStrength: Math.min(1.0, meta.encodingStrength + 0.05),
  };
}

/**
 * Enhanced ChatMessage with decay metadata.
 */
export interface DecayAwareMessage extends ChatMessage {
  decay?: MessageDecayMeta;
}

/**
 * Rank messages by retrieval score, preserving system messages at the top.
 * Used for intelligent context selection instead of simple recency.
 *
 * Pure function — no side effects.
 */
export function rankMessagesByDecay(
  messages: DecayAwareMessage[],
  now: number = Date.now(),
): DecayAwareMessage[] {
  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");

  const ranked = nonSystemMessages
    .map(m => ({
      message: m,
      score: m.decay
        ? computeRetrievalScore(
            m.decay.importance,
            m.decay.encodingStrength,
            m.decay.lastAccessedAt,
            m.decay.retrievalCount,
            now,
          )
        : computeImportance(m), // fallback for messages without decay meta
    }))
    .sort((a, b) => b.score - a.score);

  return [...systemMessages, ...ranked.map(r => r.message)];
}

/**
 * Find messages that have decayed below a threshold and are candidates
 * for pruning or summarization.
 *
 * Pure function — no side effects.
 */
export function findDecayedMessages(
  messages: DecayAwareMessage[],
  threshold: number = 0.1,
  now: number = Date.now(),
): DecayAwareMessage[] {
  return messages.filter(m => {
    if (m.role === "system") return false;
    if (!m.decay) return false;

    const strength = computeMemoryStrength(
      m.decay.encodingStrength,
      m.decay.lastAccessedAt,
      m.decay.stability,
      now,
    );

    return strength < threshold;
  });
}

/**
 * Select messages for context using decay-aware scoring.
 * Falls back to simple recency if no decay metadata is available.
 *
 * This is the main integration point for the memory system.
 */
export function selectMessagesWithDecay(
  messages: DecayAwareMessage[],
  tokenBudget: number,
  countTokens: (msgs: ChatMessage[]) => number,
  now: number = Date.now(),
): DecayAwareMessage[] {
  if (messages.length === 0) return [];

  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");

  const systemTokens = countTokens(systemMessages);
  const availableForHistory = tokenBudget - systemTokens;

  if (availableForHistory <= 0) return systemMessages;

  // Rank by decay score
  const ranked = nonSystemMessages
    .map(m => ({
      message: m,
      score: m.decay
        ? computeRetrievalScore(
            m.decay.importance,
            m.decay.encodingStrength,
            m.decay.lastAccessedAt,
            m.decay.retrievalCount,
            now,
          )
        : 0.5, // default for messages without decay meta
    }))
    .sort((a, b) => b.score - a.score);

  // Greedy selection by score, respecting token budget
  const selected: DecayAwareMessage[] = [...systemMessages];
  let usedTokens = systemTokens;

  for (const { message } of ranked) {
    const msgTokens = message.content.length / 4; // rough estimate
    if (usedTokens + msgTokens > availableForHistory) break;
    usedTokens += msgTokens;
    selected.push(message);
  }

  // Re-sort by original order (chronological)
  const order = new Map(messages.map((m, i) => [m, i]));
  selected.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  return selected;
}
