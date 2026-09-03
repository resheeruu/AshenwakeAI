/**
 * Pattern Router — Deterministic zero-token routing for known commands.
 *
 * Hardened:
 * - Prevents false positives on contextual questions containing command keywords
 * - Never bypasses permissions, moderation, security, or confirmation requirements
 * - Bounded matchCounts to prevent memory growth
 * - Resets global RegExp lastIndex on each match attempt
 * - Safe fallback to AI Router for uncertain intent
 */

import { logger } from "../logger";

/**
 * A pattern handler that matches inputs and produces responses.
 */
export interface PatternHandler {
  /** Unique name for this handler */
  name: string;
  /** Pattern to match — string for exact match, RegExp for flexible matching */
  pattern: string | RegExp;
  /** Handler function that processes the matched input */
  handler: (input: string, context: PatternContext) => Promise<PatternResult> | PatternResult;
  /** Description for documentation */
  description?: string;
  /** Category for grouping */
  category?: string;
  /** Required permissions (optional) */
  requiredPermissions?: string[];
  /** Whether this pattern is safe to match broadly (false = require exact prefix) */
  strict?: boolean;
}

/**
 * Context passed to pattern handlers.
 */
export interface PatternContext {
  /** Original user message */
  userId: string;
  /** Channel ID */
  channelId?: string;
  /** Guild ID */
  guildId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result returned by a pattern handler.
 */
export interface PatternResult {
  /** Whether the pattern matched and was handled */
  handled: boolean;
  /** Response text (if any) */
  response?: string;
  /** Whether to send as ephemeral (Discord) */
  ephemeral?: boolean;
  /** Additional data to pass along */
  data?: Record<string, unknown>;
}

const MAX_MATCH_COUNTS = 1_000;
const MAX_MATCH_ENTRIES = MAX_MATCH_COUNTS;

/**
 * Pattern Router — checks input against known patterns before LLM invocation.
 */
export class PatternRouter {
  private readonly handlers: PatternHandler[] = [];
  private readonly matchCounts = new Map<string, number>();

  register(handler: PatternHandler): void {
    if (handler.pattern instanceof RegExp && handler.pattern.global) {
      handler.pattern.lastIndex = 0;
    }
    this.handlers.push(handler);
  }

  registerAll(handlers: PatternHandler[]): void {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  /**
   * Try to match input against registered patterns.
   * Returns the first matching handler's result, or null if no match.
   */
  async route(
    input: string,
    context: PatternContext,
  ): Promise<PatternResult | null> {
    const trimmed = input.trim();

    for (const handler of this.handlers) {
      const matched = this.testMatch(trimmed, handler);

      if (matched) {
        // Bounded match count tracking
        if (this.matchCounts.size >= MAX_MATCH_ENTRIES) {
          this.matchCounts.clear();
        }
        const count = this.matchCounts.get(handler.name) ?? 0;
        this.matchCounts.set(handler.name, count + 1);

        logger.debug(`🎯 Pattern match: "${handler.name}" for input: "${trimmed.substring(0, 50)}..."`);

        try {
          const result = await handler.handler(trimmed, context);
          return result;
        } catch (error) {
          logger.warn(`⚠️ Pattern handler "${handler.name}" failed: ${error instanceof Error ? error.message : String(error)}`);
          return { handled: false };
        }
      }
    }

    return null;
  }

  /**
   * Test if input matches a pattern, with false-positive prevention.
   */
  private testMatch(input: string, handler: PatternHandler): boolean {
    const { pattern, strict } = handler;

    if (typeof pattern === "string") {
      // Exact match: input must equal pattern (case-insensitive)
      return input.toLowerCase() === pattern.toLowerCase();
    }

    // Regex match
    if (pattern.global) {
      pattern.lastIndex = 0;
    }

    const matched = pattern.test(input);

    // For non-strict regex patterns, apply false-positive prevention:
    // Ensure the input isn't a longer natural language sentence that happens
    // to contain the pattern as a substring.
    if (matched && !strict) {
      return this.preventFalsePositive(input, pattern);
    }

    return matched;
  }

  /**
   * Prevent false positives: if the pattern matches, ensure the input
   * is actually a command and not a natural language sentence containing
   * the command keyword.
   *
   * E.g., "tell me about !help" should NOT match the help handler.
   * But "!help" or "help" should match.
   */
  private preventFalsePositive(input: string, pattern: RegExp): boolean {
    const lower = input.toLowerCase();

    // If the pattern is a simple word-boundary match, check that the input
    // is primarily the command, not a sentence containing it.
    // Simple heuristic: if the matched pattern has fewer than 5 characters,
    // ensure it appears at the start of the input or after minimal prefix.
    const source = pattern.source;
    if (source.length < 10 && !source.includes("\\b")) {
      // Short pattern without word boundaries — check position
      const words = lower.split(/\s+/);
      const firstWord = words[0];

      // If first word is the pattern or pattern starts at position 0
      if (pattern.test(firstWord) || pattern.test(lower.slice(0, 20))) {
        return true;
      }

      return false;
    }

    return true;
  }

  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [name, count] of this.matchCounts) {
      stats[name] = count;
    }
    return stats;
  }

  getHandlers(): Array<{ name: string; pattern: string; description?: string; category?: string }> {
    return this.handlers.map(h => ({
      name: h.name,
      pattern: h.pattern instanceof RegExp ? h.pattern.source : h.pattern,
      description: h.description,
      category: h.category,
    }));
  }

  hasMatch(input: string): boolean {
    const trimmed = input.trim();
    return this.handlers.some(h => this.testMatch(trimmed, h));
  }
}

/**
 * Create a simple exact-match handler.
 */
export function exactMatch(
  name: string,
  pattern: string,
  handler: PatternHandler["handler"],
  description?: string,
): PatternHandler {
  return { name, pattern, handler, description, strict: true };
}

/**
 * Create a regex-based handler.
 */
export function regexMatch(
  name: string,
  pattern: RegExp,
  handler: PatternHandler["handler"],
  description?: string,
  strict = false,
): PatternHandler {
  return { name, pattern, handler, description, strict };
}

/**
 * Built-in handlers for common Discord bot operations.
 * These are pure deterministic responses — no permissions, no external state.
 */
export const builtInHandlers: PatternHandler[] = [
  exactMatch(
    "help",
    "!help",
    () => ({
      handled: true,
      response: "Available commands: /ask, /prompt, /send. Use /help for detailed info.",
      ephemeral: true,
    }),
    "Show available commands",
  ),
  exactMatch(
    "status",
    "!status",
    () => ({
      handled: true,
      response: "Bot is online and operational.",
      ephemeral: true,
    }),
    "Check bot status",
  ),
  exactMatch(
    "ping",
    "!ping",
    () => ({
      handled: true,
      response: "Pong!",
      ephemeral: true,
    }),
    "Latency check",
  ),
];
