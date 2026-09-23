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
var memory_decay_exports = {};
__export(memory_decay_exports, {
  computeImportance: () => computeImportance,
  computeMemoryStrength: () => computeMemoryStrength,
  computeRetrievalScore: () => computeRetrievalScore,
  computeStability: () => computeStability,
  createDecayMeta: () => createDecayMeta,
  findDecayedMessages: () => findDecayedMessages,
  rankMessagesByDecay: () => rankMessagesByDecay,
  selectMessagesWithDecay: () => selectMessagesWithDecay,
  updateOnRetrieval: () => updateOnRetrieval
});
module.exports = __toCommonJS(memory_decay_exports);
const IMPORTANCE_SIGNALS = {
  /** Message contains a question */
  question: 0.15,
  /** Message contains a decision or conclusion */
  decision: 0.12,
  /** Message contains an error or problem report */
  error: 0.1,
  /** Message contains a name or entity reference */
  entity: 0.05,
  /** Message is longer than average (more content = more important) */
  length: 0.08,
  /** Message contains explicit action words */
  action: 0.1,
  /** Message is a system message */
  system: 0.3,
  /** Message contains code or technical content */
  technical: 0.08
};
const QUESTION_PATTERN = /\?|^(what|how|why|when|where|who|can|could|would|should|do|does|is|are|was|were|will|have|has|had)\b/i;
const DECISION_PATTERN = /\b(decided|conclusion|final|approved|rejected|confirmed|go with|choose|pick|select|plan is)\b/i;
const ERROR_PATTERN = /\b(error|failed|failure|bug|issue|broken|crash|exception|wrong|problem|cannot|can't|unable)\b/i;
const ACTION_PATTERN = /\b(implement|create|add|remove|fix|update|deploy|build|test|run|execute|install|configure|setup|migrate)\b/i;
const TECHNICAL_PATTERN = /\b(database|api|server|function|class|interface|type|module|import|export|async|await|promise|sql|http|json)\b/i;
function computeImportance(message) {
  if (message.role === "system") {
    return IMPORTANCE_SIGNALS.system;
  }
  const content = message.content || "";
  let importance = 0.3;
  if (QUESTION_PATTERN.test(content)) {
    importance += IMPORTANCE_SIGNALS.question;
  }
  if (DECISION_PATTERN.test(content)) {
    importance += IMPORTANCE_SIGNALS.decision;
  }
  if (ERROR_PATTERN.test(content)) {
    importance += IMPORTANCE_SIGNALS.error;
  }
  if (ACTION_PATTERN.test(content)) {
    importance += IMPORTANCE_SIGNALS.action;
  }
  if (TECHNICAL_PATTERN.test(content)) {
    importance += IMPORTANCE_SIGNALS.technical;
  }
  if (content.length > 200) {
    importance += IMPORTANCE_SIGNALS.length;
  } else if (content.length > 100) {
    importance += IMPORTANCE_SIGNALS.length * 0.5;
  }
  const entityMatches = content.match(/\b[A-Z][a-z]{2,}\b/g);
  if (entityMatches && entityMatches.length > 1) {
    importance += IMPORTANCE_SIGNALS.entity;
  }
  return Math.min(1, importance);
}
function computeMemoryStrength(encodingStrength, lastAccessedAt, stability, now = Date.now()) {
  const elapsed = Math.max(0, now - lastAccessedAt);
  return encodingStrength * Math.exp(-elapsed / stability);
}
function computeStability(importance, retrievalCount, baseStabilityMs = 36e5) {
  const importanceMultiplier = 0.5 + importance * 2.5;
  const retrievalMultiplier = 1 + Math.log2(1 + retrievalCount) * 0.5;
  return baseStabilityMs * importanceMultiplier * retrievalMultiplier;
}
function computeRetrievalScore(importance, encodingStrength, lastAccessedAt, retrievalCount, now = Date.now()) {
  const stability = computeStability(importance, retrievalCount);
  const strength = computeMemoryStrength(encodingStrength, lastAccessedAt, stability, now);
  const recencyHalfLife = 6 * 36e5;
  const recency = Math.exp(-(now - lastAccessedAt) / recencyHalfLife);
  return strength * 0.4 + importance * 0.3 + recency * 0.2 + Math.min(1, retrievalCount / 10) * 0.1;
}
function createDecayMeta(message) {
  const importance = computeImportance(message);
  const stability = computeStability(importance, 0);
  const now = Date.now();
  return {
    importance,
    encodingStrength: importance,
    retrievalCount: 0,
    lastAccessedAt: now,
    stability
  };
}
function updateOnRetrieval(meta) {
  const now = Date.now();
  const newRetrievalCount = meta.retrievalCount + 1;
  const newStability = computeStability(meta.importance, newRetrievalCount);
  return {
    ...meta,
    retrievalCount: newRetrievalCount,
    lastAccessedAt: now,
    stability: newStability,
    encodingStrength: Math.min(1, meta.encodingStrength + 0.05)
  };
}
function rankMessagesByDecay(messages, now = Date.now()) {
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");
  const ranked = nonSystemMessages.map((m) => ({
    message: m,
    score: m.decay ? computeRetrievalScore(
      m.decay.importance,
      m.decay.encodingStrength,
      m.decay.lastAccessedAt,
      m.decay.retrievalCount,
      now
    ) : computeImportance(m)
    // fallback for messages without decay meta
  })).sort((a, b) => b.score - a.score);
  return [...systemMessages, ...ranked.map((r) => r.message)];
}
function findDecayedMessages(messages, threshold = 0.1, now = Date.now()) {
  return messages.filter((m) => {
    if (m.role === "system") return false;
    if (!m.decay) return false;
    const strength = computeMemoryStrength(
      m.decay.encodingStrength,
      m.decay.lastAccessedAt,
      m.decay.stability,
      now
    );
    return strength < threshold;
  });
}
function selectMessagesWithDecay(messages, tokenBudget, countTokens, now = Date.now()) {
  if (messages.length === 0) return [];
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");
  const systemTokens = countTokens(systemMessages);
  const availableForHistory = tokenBudget - systemTokens;
  if (availableForHistory <= 0) return systemMessages;
  const ranked = nonSystemMessages.map((m) => ({
    message: m,
    score: m.decay ? computeRetrievalScore(
      m.decay.importance,
      m.decay.encodingStrength,
      m.decay.lastAccessedAt,
      m.decay.retrievalCount,
      now
    ) : 0.5
    // default for messages without decay meta
  })).sort((a, b) => b.score - a.score);
  const selected = [...systemMessages];
  let usedTokens = systemTokens;
  for (const { message } of ranked) {
    const msgTokens = message.content.length / 4;
    if (usedTokens + msgTokens > availableForHistory) break;
    usedTokens += msgTokens;
    selected.push(message);
  }
  const order = new Map(messages.map((m, i) => [m, i]));
  selected.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return selected;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  computeImportance,
  computeMemoryStrength,
  computeRetrievalScore,
  computeStability,
  createDecayMeta,
  findDecayedMessages,
  rankMessagesByDecay,
  selectMessagesWithDecay,
  updateOnRetrieval
});
