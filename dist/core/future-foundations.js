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
var future_foundations_exports = {};
__export(future_foundations_exports, {
  DEFAULT_AI_TO_AI_CONFIG: () => DEFAULT_AI_TO_AI_CONFIG,
  DEFAULT_AWARENESS_CONFIG: () => DEFAULT_AWARENESS_CONFIG,
  DEFAULT_TTS_CONFIG: () => DEFAULT_TTS_CONFIG,
  detectBotLoop: () => detectBotLoop,
  isBotLoopPreventionActive: () => isBotLoopPreventionActive
});
module.exports = __toCommonJS(future_foundations_exports);
const DEFAULT_AWARENESS_CONFIG = {
  mode: "MENTION_ONLY",
  passiveRateLimit: 20,
  perUserPassiveRateLimit: 5,
  perChannelPassiveRateLimit: 10,
  triggerKeywords: [],
  maxConversationTurns: 5,
  userCooldownMs: 3e4,
  channelCooldownMs: 1e4,
  guildDailyLimit: 200,
  globalDailyLimit: 2e3
};
const DEFAULT_TTS_CONFIG = {
  maxCharacters: 500,
  perUserCooldownMs: 1e4,
  guildDailyCharacterLimit: 1e4,
  globalDailyCharacterLimit: 1e5,
  cacheTtlMs: 36e5
};
const DEFAULT_AI_TO_AI_CONFIG = {
  enabled: false,
  maxTurns: 6,
  perUserCooldownMs: 6e4,
  maxConcurrent: 3,
  turnTimeoutMs: 3e4,
  maxTokensPerResponse: 500
};
const recentBotResponses = /* @__PURE__ */ new Map();
const BOT_LOOP_WINDOW_MS = 1e4;
const BOT_LOOP_THRESHOLD = 3;
function detectBotLoop(botId, channelId) {
  const key = `${botId}:${channelId}`;
  const now = Date.now();
  const lastResponse = recentBotResponses.get(key) || 0;
  if (now - lastResponse < BOT_LOOP_WINDOW_MS) {
    const count = recentBotResponses.get(`${key}:count`) || 0;
    if (count >= BOT_LOOP_THRESHOLD) {
      return true;
    }
    recentBotResponses.set(`${key}:count`, count + 1);
  } else {
    recentBotResponses.set(`${key}:count`, 1);
  }
  recentBotResponses.set(key, now);
  return false;
}
function isBotLoopPreventionActive() {
  return recentBotResponses.size > 0;
}
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentBotResponses) {
    if (now - timestamp > BOT_LOOP_WINDOW_MS * 2) {
      recentBotResponses.delete(key);
    }
  }
}, 6e4);
cleanupInterval.unref?.();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_AI_TO_AI_CONFIG,
  DEFAULT_AWARENESS_CONFIG,
  DEFAULT_TTS_CONFIG,
  detectBotLoop,
  isBotLoopPreventionActive
});
