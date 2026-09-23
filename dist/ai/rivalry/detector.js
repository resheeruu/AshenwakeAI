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
var detector_exports = {};
__export(detector_exports, {
  detectRivalryIntent: () => detectRivalryIntent,
  extractMentionedIds: () => extractMentionedIds,
  isAshenAIMentioned: () => isAshenAIMentioned,
  isEndRivalryIntent: () => isEndRivalryIntent,
  isRefusal: () => isRefusal
});
module.exports = __toCommonJS(detector_exports);
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
  /\brun\s+this\s+command\b/i
  // SECURITY NOTE: "disable security", "give me your token", "change permissions",
  // "delete this" are NOT rivalry triggers — they are security violations
  // handled by the security inspection layer (gateway.ts / input block patterns).
];
function detectRivalryIntent(content, mentionedBotIds, ashenAIId) {
  const lower = content.toLowerCase();
  const matchedKeywords = [];
  for (const pattern of RIVALRY_KEYWORDS) {
    if (pattern.test(content)) {
      matchedKeywords.push(pattern.source);
    }
  }
  const hasRivalryKeywords = matchedKeywords.length > 0;
  const hasTargetBots = mentionedBotIds.length > 0;
  const isRivalry = hasRivalryKeywords && hasTargetBots;
  const isMentionTrigger = true;
  return {
    isRivalry,
    isMentionTrigger,
    targetBotIds: mentionedBotIds,
    rivalryKeywords: matchedKeywords,
    confidence: isRivalry ? Math.min(0.5 + matchedKeywords.length * 0.15, 0.95) : 0
  };
}
function isAshenAIMentioned(content, ashenAIId) {
  const mentionPattern = new RegExp(
    `<@!?${ashenAIId}>`,
    "i"
  );
  return mentionPattern.test(content);
}
function extractMentionedIds(content, ashenAIId) {
  const mentionRegex = /<@!?(\d+)>/g;
  const ids = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    const id = match[1];
    if (id !== ashenAIId) {
      ids.push(id);
    }
  }
  return [...new Set(ids)];
}
function isRefusal(content) {
  const lower = content.toLowerCase();
  return /\b(no|nah|nope|not interested|pass|skip|decline|refuse|won't|won't do|not participating)\b/i.test(
    lower
  );
}
function isEndRivalryIntent(content) {
  const lower = content.toLowerCase();
  return /\b(stop|end|quit|cancel|that'?s?\s+enough|good\s+game|gg|wrap\s+up|finish)\b/i.test(
    lower
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  detectRivalryIntent,
  extractMentionedIds,
  isAshenAIMentioned,
  isEndRivalryIntent,
  isRefusal
});
