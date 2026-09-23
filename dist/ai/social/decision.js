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
var decision_exports = {};
__export(decision_exports, {
  buildSocialContext: () => buildSocialContext,
  makeSocialDecision: () => makeSocialDecision
});
module.exports = __toCommonJS(decision_exports);
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
  /\bthink\b/i
];
const DEBATE_PATTERNS = [
  /\b(?:disagree|wrong|incorrect|not\s+true|that'?s?\s+not)\b/i,
  /\b(?:actually|fact(?:s|is)|reality|truth)\b/i,
  /\b(?:prove|evidence|source|citation)\b/i,
  /\bbut\b.*\b(?:I|you|they)\b/i,
  /\b(?:fair\s+point|good\s+point|valid)\b.*\bbut\b/i
];
const HUMAN_ONLY_PATTERNS = [
  /\b(?:brb|gtg|afk|ttyl|gn|gm|good\s+morning|good\s+night)\b/i,
  /\b(?:lol|haha|lmao|rofl|xd)\b/i,
  /\b(?:same|fr|ngl|istg|smh)\b/i,
  /^(?:yes|no|ok|okay|nice|cool|great|thanks|thx|ty|np|nvm)$/i
];
const AI_RELEVANT_PATTERNS = [
  /\b(?:bot|ai|ashen|assistant)\b/i,
  /\b(?:help|question|how\s+do|what\s+is|explain)\b/i,
  /\b(?:code|programming|developer|dev)\b/i,
  /\b(?:server|discord|mod|admin|setup)\b/i,
  /\b(?:game|play|score|leaderboard)\b/i
];
function makeSocialDecision(input) {
  if (input.isDM) {
    return { action: "skip", reason: "DM" };
  }
  if (!input.hasSocialScope) {
    return { action: "skip", reason: "no_social_scope" };
  }
  if (input.channelConfig && !input.channelConfig.enabled) {
    return { action: "skip", reason: "channel_disabled" };
  }
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
  if (input.isMention) {
    return {
      action: "respond",
      reason: "direct_mention",
      contextWindow: input.channelConfig?.contextWindow || 20
    };
  }
  if (input.isReplyToBot) {
    return {
      action: "respond",
      reason: "reply_to_bot",
      contextWindow: input.channelConfig?.contextWindow || 20
    };
  }
  const content = input.content.trim();
  if (content.length < 5) {
    return { action: "skip", reason: "message_too_short" };
  }
  if (HUMAN_ONLY_PATTERNS.some((p) => p.test(content))) {
    return { action: "skip", reason: "casual_banter" };
  }
  const minActivity = input.channelConfig?.minActivityThreshold || 3;
  if (input.recentMessageCount < minActivity) {
    return { action: "skip", reason: "below_activity_threshold" };
  }
  const isRelevant = AI_RELEVANT_PATTERNS.some((p) => p.test(content));
  const isQuestion = QUESTION_PATTERNS.some((p) => p.test(content));
  const isDebate = DEBATE_PATTERNS.some((p) => p.test(content));
  if (isDebate && !input.channelConfig?.debateEnabled) {
    return { action: "skip", reason: "debate_disabled" };
  }
  const probability = input.channelConfig?.responseProbability || 0.3;
  const random = Math.random();
  if (isQuestion && isRelevant) {
    if (random < probability * 1.5) {
      return {
        action: "respond",
        reason: "relevant_question",
        contextWindow: input.channelConfig?.contextWindow || 20
      };
    }
  }
  if (isDebate && input.channelConfig?.debateEnabled) {
    if (random < probability * 1.3) {
      return {
        action: "respond",
        reason: "debate_participation",
        contextWindow: input.channelConfig?.contextWindow || 20
      };
    }
  }
  if (isRelevant && random < probability) {
    return {
      action: "respond",
      reason: "relevant_conversation",
      contextWindow: input.channelConfig?.contextWindow || 20
    };
  }
  return { action: "skip", reason: "not_relevant" };
}
function buildSocialContext(decision, recentMessages) {
  if (decision.action !== "respond") return "";
  const lines = [
    "SOCIAL CONTEXT: You are participating in a Discord conversation.",
    "Respond naturally, like a regular community member.",
    "Do not announce yourself as an AI or bot.",
    "Keep your response concise and relevant.",
    "Do not respond to every message \u2014 only when you have something useful to add.",
    ""
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildSocialContext,
  makeSocialDecision
});
