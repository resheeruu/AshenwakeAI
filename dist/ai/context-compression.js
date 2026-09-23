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
var context_compression_exports = {};
__export(context_compression_exports, {
  autoCompress: () => autoCompress,
  compressMessages: () => compressMessages,
  wouldCompressionHelp: () => wouldCompressionHelp
});
module.exports = __toCommonJS(context_compression_exports);
var import_memory_decay = require("./memory-decay");
var import_tokens = require("./tokens");
var import_logger = require("../logger");
const DEFAULT_CONFIG = {
  keepRecent: 6,
  minMessages: 12,
  summaryTokenBudget: 512,
  importanceThreshold: 0.6
};
const PRESERVE_PATTERNS = [
  /\b(name|user|id|channel|role|server|guild)\s*[:=]\s*\S+/i,
  /\b(decided|conclusion|final|approved|rejected|confirmed|plan is)\b/i,
  /\b(task|todo|action item|deadline|reminder)\b/i,
  /\b(error|bug|fix|issue|broken|failed|crash)\b/i,
  /\b(API|token|key|endpoint|url|config|setting)\b/i,
  /\b(prefer|like|want|need|habit|usual|always|never)\b/i,
  /\b(important|critical|urgent|priority|note|remember)\b/i
];
function isPreservedContent(content) {
  return PRESERVE_PATTERNS.some((p) => p.test(content));
}
function extractKeyFacts(messages) {
  const facts = [];
  const seen = /* @__PURE__ */ new Set();
  for (const msg of messages) {
    const content = msg.content || "";
    if (!content.trim()) continue;
    const sentences = content.split(/[.!?\n]+/).filter((s) => s.trim().length > 10);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      if (isPreservedContent(trimmed)) {
        facts.unshift(trimmed);
      } else if (/\b(error|failed|decided|plan|goal|task|bug|fix|implement|create|delete|update|change|important|note|remember|todo|deadline)\b/i.test(trimmed) || /\?/.test(trimmed) || trimmed.length > 50) {
        facts.push(trimmed);
      }
    }
  }
  return facts;
}
function buildSummary(messages, facts) {
  const parts = [];
  parts.push("[Earlier conversation]");
  const roles = new Set(messages.map((m) => m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : null).filter(Boolean));
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
function compressMessages(messages, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (messages.length < cfg.minMessages) {
    return {
      compressed: messages,
      messagesCompressed: 0,
      tokensBefore: (0, import_tokens.countChatTokens)(messages),
      tokensAfter: (0, import_tokens.countChatTokens)(messages),
      ratio: 1
    };
  }
  const tokensBefore = (0, import_tokens.countChatTokens)(messages);
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");
  const recentStart = Math.max(0, nonSystemMessages.length - cfg.keepRecent);
  const recentMessages = nonSystemMessages.slice(recentStart);
  const oldMessages = nonSystemMessages.slice(0, recentStart);
  const highImportance = [];
  const compressible = [];
  for (const msg of oldMessages) {
    const importance = msg.decay?.importance ?? (0, import_memory_decay.computeImportance)(msg);
    const hasDecayed = msg.decay ? (0, import_memory_decay.computeMemoryStrength)(
      msg.decay.encodingStrength,
      msg.decay.lastAccessedAt,
      msg.decay.stability
    ) < 0.3 : false;
    const isToolResult = msg.role === "system" && (msg.content.includes("Tool ") || msg.content.includes("Result:") || msg.content.includes("[MCP:"));
    if (isToolResult || importance >= cfg.importanceThreshold && !hasDecayed) {
      highImportance.push(msg);
    } else {
      compressible.push(msg);
    }
  }
  if (compressible.length === 0) {
    const compressed2 = [...systemMessages, ...highImportance, ...recentMessages];
    return {
      compressed: compressed2,
      messagesCompressed: 0,
      tokensBefore,
      tokensAfter: (0, import_tokens.countChatTokens)(compressed2),
      ratio: 1
    };
  }
  const facts = extractKeyFacts(compressible);
  const summaryText = buildSummary(compressible, facts);
  const summaryMessage = {
    role: "system",
    content: summaryText
  };
  const compressed = [...systemMessages, summaryMessage, ...highImportance, ...recentMessages];
  const tokensAfter = (0, import_tokens.countChatTokens)(compressed);
  const messagesCompressed = compressible.length;
  import_logger.logger.debug(
    `Context compressed: ${messagesCompressed} messages \u2192 summary (${tokensBefore} \u2192 ${tokensAfter} tokens, ratio: ${(tokensAfter / tokensBefore).toFixed(2)})`
  );
  return {
    compressed,
    messagesCompressed,
    tokensBefore,
    tokensAfter,
    ratio: tokensAfter / tokensBefore
  };
}
function wouldCompressionHelp(messages, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (messages.length < cfg.minMessages) return false;
  const result = compressMessages(messages, config);
  return result.ratio < 0.8 && result.messagesCompressed > 0;
}
function autoCompress(messages, tokenBudget, config = {}) {
  const currentTokens = (0, import_tokens.countChatTokens)(messages);
  if (currentTokens <= tokenBudget) {
    return messages;
  }
  const result = compressMessages(messages, config);
  if (result.ratio < 1) {
    return result.compressed;
  }
  return messages;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  autoCompress,
  compressMessages,
  wouldCompressionHelp
});
