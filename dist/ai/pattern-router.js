"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var pattern_router_exports = {};
__export(pattern_router_exports, {
  PatternRouter: () => PatternRouter,
  builtInHandlers: () => builtInHandlers,
  exactMatch: () => exactMatch,
  regexMatch: () => regexMatch
});
module.exports = __toCommonJS(pattern_router_exports);
var import_logger = require("../logger");
const MAX_MATCH_COUNTS = 1e3;
const MAX_MATCH_ENTRIES = MAX_MATCH_COUNTS;
class PatternRouter {
  handlers = [];
  matchCounts = /* @__PURE__ */ new Map();
  register(handler) {
    if (handler.pattern instanceof RegExp && handler.pattern.global) {
      handler.pattern.lastIndex = 0;
    }
    this.handlers.push(handler);
  }
  registerAll(handlers) {
    for (const handler of handlers) {
      this.register(handler);
    }
  }
  /**
   * Try to match input against registered patterns.
   * Returns the first matching handler's result, or null if no match.
   */
  async route(input, context) {
    const trimmed = input.trim();
    for (const handler of this.handlers) {
      const matched = this.testMatch(trimmed, handler);
      if (matched) {
        if (this.matchCounts.size >= MAX_MATCH_ENTRIES) {
          this.matchCounts.clear();
        }
        const count = this.matchCounts.get(handler.name) ?? 0;
        this.matchCounts.set(handler.name, count + 1);
        import_logger.logger.debug(`\u{1F3AF} Pattern match: "${handler.name}" for input: "${trimmed.substring(0, 50)}..."`);
        try {
          const result = await handler.handler(trimmed, context);
          return result;
        } catch (error) {
          import_logger.logger.warn(`\u26A0\uFE0F Pattern handler "${handler.name}" failed: ${error instanceof Error ? error.message : String(error)}`);
          return { handled: false };
        }
      }
    }
    return null;
  }
  /**
   * Test if input matches a pattern, with false-positive prevention.
   */
  testMatch(input, handler) {
    const { pattern, strict } = handler;
    if (typeof pattern === "string") {
      return input.toLowerCase() === pattern.toLowerCase();
    }
    if (pattern.global) {
      pattern.lastIndex = 0;
    }
    const matched = pattern.test(input);
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
  preventFalsePositive(input, pattern) {
    const lower = input.toLowerCase();
    const source = pattern.source;
    if (source.length < 10 && !source.includes("\\b")) {
      const words = lower.split(/\s+/);
      const firstWord = words[0];
      if (pattern.test(firstWord) || pattern.test(lower.slice(0, 20))) {
        return true;
      }
      return false;
    }
    return true;
  }
  getStats() {
    const stats = {};
    for (const [name, count] of this.matchCounts) {
      stats[name] = count;
    }
    return stats;
  }
  getHandlers() {
    return this.handlers.map((h) => ({
      name: h.name,
      pattern: h.pattern instanceof RegExp ? h.pattern.source : h.pattern,
      description: h.description,
      category: h.category
    }));
  }
  hasMatch(input) {
    const trimmed = input.trim();
    return this.handlers.some((h) => this.testMatch(trimmed, h));
  }
}
function exactMatch(name, pattern, handler, description) {
  return { name, pattern, handler, description, strict: true };
}
function regexMatch(name, pattern, handler, description, strict = false) {
  return { name, pattern, handler, description, strict };
}
const builtInHandlers = [
  exactMatch(
    "help",
    "!help",
    () => ({
      handled: true,
      response: "Available commands: /ask, /prompt, /game, /status, /server, /moderation, /support, /access, /personality, /settings, /reset. Use /help for detailed info.",
      ephemeral: true
    }),
    "Show available commands"
  ),
  exactMatch(
    "status",
    "!status",
    () => ({
      handled: true,
      response: "Bot is online and operational.",
      ephemeral: true
    }),
    "Check bot status"
  ),
  exactMatch(
    "ping",
    "!ping",
    () => ({
      handled: true,
      response: "Pong!",
      ephemeral: true
    }),
    "Latency check"
  )
];
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PatternRouter,
  builtInHandlers,
  exactMatch,
  regexMatch
});
