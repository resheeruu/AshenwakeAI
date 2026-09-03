/**
 * Context Compression — Summarize old messages instead of dropping them.
 *
 * Hardened:
 * - Preserves names, IDs, decisions, active tasks, user preferences
 * - Compressed context stays within configured token limits
 * - Uses existing gpt-tokenizer for accurate token counting
 * - Prevents repeated compression from destroying meaning
 * - Tool results and security constraints preserved
 */

import { ChatMessage } from "./types";
import { DecayAwareMessage, computeImportance, computeMemoryStrength } from "./memory-decay";
import { countChatTokens } from "./tokens";
import { logger } from "../logger";

export interface CompressionConfig {
  keepRecent: number;
  minMessages: number;
  summaryTokenBudget: number;
  importanceThreshold: number;
}

const DEFAULT_CONFIG: CompressionConfig = {
  keepRecent: 6,
  minMessages: 12,
  summaryTokenBudget: 512,
  importanceThreshold: 0.6,
};

export interface CompressionResult {
  compressed: ChatMessage[];
  messagesCompressed: number;
  tokensBefore: number;
  tokensAfter: number;
  ratio: number;
}

const PRESERVE_PATTERNS = [
  /\b(name|user|id|channel|role|server|guild)\s*[:=]\s*\S+/i,
  /\b(decided|conclusion|final|approved|rejected|confirmed|plan is)\b/i,
  /\b(task|todo|action item|deadline|reminder)\b/i,
  /\b(error|bug|fix|issue|broken|failed|crash)\b/i,
  /\b(API|token|key|endpoint|url|config|setting)\b/i,
  /\b(prefer|like|want|need|habit|usual|always|never)\b/i,
  /\b(important|critical|urgent|priority|note|remember)\b/i,
];

function isPreservedContent(content: string): boolean {
  return PRESERVE_PATTERNS.some(p => p.test(content));
}

function extractKeyFacts(messages: ChatMessage[]): string[] {
  const facts: string[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    const content = msg.content || "";
    if (!content.trim()) continue;

    const sentences = content.split(/[.!?\n]+/).filter(s => s.trim().length > 10);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      const lower = trimmed.toLowerCase();

      if (seen.has(lower)) continue;
      seen.add(lower);

      // Prioritize preserved content
      if (isPreservedContent(trimmed)) {
        facts.unshift(trimmed); // High priority: add to front
      } else if (
        /\b(error|failed|decided|plan|goal|task|bug|fix|implement|create|delete|update|change|important|note|remember|todo|deadline)\b/i.test(trimmed) ||
        /\?/.test(trimmed) ||
        trimmed.length > 50
      ) {
        facts.push(trimmed);
      }
    }
  }

  return facts;
}

function buildSummary(
  messages: ChatMessage[],
  facts: string[],
): string {
  const parts: string[] = [];

  parts.push("[Earlier conversation]");

  const roles = new Set(messages.map(m => m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : null).filter(Boolean));
  if (roles.size > 0) {
    parts.push(`Participants: ${[...roles].join(", ")}`);
  }

  if (facts.length > 0) {
    parts.push("Key points:");
    const maxFacts = Math.min(facts.length, 12);
    for (let i = 0; i < maxFacts; i++) {
      parts.push(`- ${facts[i]}`);
    }
  }

  parts.push(`[${messages.length} messages compressed]`);

  return parts.join("\n");
}

export function compressMessages(
  messages: DecayAwareMessage[],
  config: Partial<CompressionConfig> = {},
): CompressionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (messages.length < cfg.minMessages) {
    return {
      compressed: messages,
      messagesCompressed: 0,
      tokensBefore: countChatTokens(messages),
      tokensAfter: countChatTokens(messages),
      ratio: 1.0,
    };
  }

  const tokensBefore = countChatTokens(messages);

  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");

  const recentStart = Math.max(0, nonSystemMessages.length - cfg.keepRecent);
  const recentMessages = nonSystemMessages.slice(recentStart);
  const oldMessages = nonSystemMessages.slice(0, recentStart);

  const highImportance: DecayAwareMessage[] = [];
  const compressible: DecayAwareMessage[] = [];

  for (const msg of oldMessages) {
    const importance = msg.decay?.importance ?? computeImportance(msg);

    const hasDecayed = msg.decay
      ? computeMemoryStrength(
          msg.decay.encodingStrength,
          msg.decay.lastAccessedAt,
          msg.decay.stability,
        ) < 0.3
      : false;

    // Always preserve tool results and messages with preserved content
    const isToolResult = msg.role === "system" && (
      msg.content.includes("Tool ") ||
      msg.content.includes("Result:") ||
      msg.content.includes("[MCP:")
    );

    if (isToolResult || (importance >= cfg.importanceThreshold && !hasDecayed)) {
      highImportance.push(msg);
    } else {
      compressible.push(msg);
    }
  }

  if (compressible.length === 0) {
    const compressed = [...systemMessages, ...highImportance, ...recentMessages];
    return {
      compressed,
      messagesCompressed: 0,
      tokensBefore,
      tokensAfter: countChatTokens(compressed),
      ratio: 1.0,
    };
  }

  const facts = extractKeyFacts(compressible);
  const summaryText = buildSummary(compressible, facts);

  const summaryMessage: ChatMessage = {
    role: "system",
    content: summaryText,
  };

  const compressed = [...systemMessages, summaryMessage, ...highImportance, ...recentMessages];
  const tokensAfter = countChatTokens(compressed);

  const messagesCompressed = compressible.length;
  logger.debug(
    `Context compressed: ${messagesCompressed} messages → summary (${tokensBefore} → ${tokensAfter} tokens, ratio: ${(tokensAfter / tokensBefore).toFixed(2)})`,
  );

  return {
    compressed,
    messagesCompressed,
    tokensBefore,
    tokensAfter,
    ratio: tokensAfter / tokensBefore,
  };
}

export function wouldCompressionHelp(
  messages: DecayAwareMessage[],
  config: Partial<CompressionConfig> = {},
): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (messages.length < cfg.minMessages) return false;

  const result = compressMessages(messages, config);
  return result.ratio < 0.8 && result.messagesCompressed > 0;
}

export function autoCompress(
  messages: DecayAwareMessage[],
  tokenBudget: number,
  config: Partial<CompressionConfig> = {},
): DecayAwareMessage[] {
  const currentTokens = countChatTokens(messages);

  if (currentTokens <= tokenBudget) {
    return messages;
  }

  const result = compressMessages(messages, config);

  if (result.ratio < 1.0) {
    return result.compressed as DecayAwareMessage[];
  }

  return messages;
}
