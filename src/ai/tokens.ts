import { encode, encodeChat } from "gpt-tokenizer";
import type { ChatMessage } from "./types";

/**
 * Token counting utilities using exact BPE tokenization.
 * Uses gpt-tokenizer for accurate OpenAI-model token counts.
 */

const MAX_CONTEXT_TOKENS = 4096;
const RESERVE_TOKENS = 512;

/**
 * Count tokens in a text string.
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}

/**
 * Count tokens in a chat message array.
 */
export function countChatTokens(messages: ChatMessage[]): number {
  if (!messages.length) return 0;
  try {
    const encoded = encodeChat(
      messages.map((m) => ({ role: m.role, content: m.content })),
    );
    return encoded.length;
  } catch {
    return messages.reduce((sum, m) => sum + countTokens(m.content) + 4, 0);
  }
}

/**
 * Check if text is within a token limit.
 */
export function isWithinTokenLimit(text: string, limit: number): boolean {
  return countTokens(text) <= limit;
}

/**
 * Truncate text to fit within a token limit.
 * Preserves the beginning of the text (most relevant for conversation context).
 */
export function truncateToTokenLimit(text: string, limit: number): string {
  const tokens = encode(text);
  if (tokens.length <= limit) return text;
  return decode(tokens.slice(0, limit));
}

/**
 * Get available tokens for response given the messages and model limit.
 */
export function getAvailableResponseTokens(
  messages: ChatMessage[],
  modelLimit = MAX_CONTEXT_TOKENS,
): number {
  const used = countChatTokens(messages);
  return Math.max(256, modelLimit - used - RESERVE_TOKENS);
}

/**
 * Select the most relevant messages to fit within a token budget.
 * Keeps the most recent messages and the system prompt.
 */
export function selectMessagesForTokenBudget(
  messages: ChatMessage[],
  tokenBudget: number,
): ChatMessage[] {
  if (messages.length === 0) return [];

  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const systemTokens = countChatTokens(systemMessages);
  const availableForHistory = tokenBudget - systemTokens;

  if (availableForHistory <= 0) return systemMessages;

  const selected: ChatMessage[] = [...systemMessages];
  let usedTokens = 0;

  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msg = nonSystemMessages[i];
    const msgTokens = countTokens(msg.content) + 4;
    if (usedTokens + msgTokens > availableForHistory) break;
    usedTokens += msgTokens;
    selected.splice(systemMessages.length, 0, msg);
  }

  return selected;
}

/**
 * Decode tokens back to text (re-export from gpt-tokenizer).
 */
function decode(tokens: number[]): string {
  try {
    const mod = require("gpt-tokenizer");
    return mod.decode(tokens);
  } catch {
    return tokens.join(" ");
  }
}
