"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var listener_exports = {};
__export(listener_exports, {
  handleSocialMessage: () => handleSocialMessage,
  startSocialCleanup: () => startSocialCleanup,
  stopSocialCleanup: () => stopSocialCleanup
});
module.exports = __toCommonJS(listener_exports);
var import_logger = require("../../logger");
var import_guild_config = require("../../core/guild-config");
var import_cooldown = require("./cooldown");
var import_decision = require("./decision");
const socialContextCache = /* @__PURE__ */ new Map();
const MAX_CONTEXT_MESSAGES = 50;
const CONTEXT_TTL_MS = 30 * 60 * 1e3;
function addMessageToContext(channelId, author, content) {
  const messages = socialContextCache.get(channelId) || [];
  messages.push({ author, content, timestamp: Date.now() });
  const cutoff = Date.now() - CONTEXT_TTL_MS;
  const trimmed = messages.filter((m) => m.timestamp > cutoff).slice(-MAX_CONTEXT_MESSAGES);
  socialContextCache.set(channelId, trimmed);
}
function getRecentMessages(channelId, limit) {
  const messages = socialContextCache.get(channelId) || [];
  const cutoff = Date.now() - CONTEXT_TTL_MS;
  return messages.filter((m) => m.timestamp > cutoff).slice(-limit);
}
async function handleSocialMessage(message, client, options) {
  const { author, channel, guild, content } = message;
  if (!guild || !channel || !("id" in channel)) return false;
  if (author.bot) return false;
  const channelId = channel.id;
  const guildId = guild.id;
  const authorId = author.id;
  const guildConfig = (0, import_guild_config.loadGuildConfig)(guildId);
  if (!guildConfig.social?.enabled) return false;
  const channelConfig = guildConfig.social.channels?.[channelId];
  if (!channelConfig?.enabled) return false;
  addMessageToContext(channelId, author.displayName || author.username, content);
  const cooldown = (0, import_cooldown.getSocialCooldown)();
  const recentMessages = getRecentMessages(channelId, 20);
  const decisionInput = {
    content,
    authorId,
    channelId,
    guildId,
    isMention: false,
    // Already handled by normal flow
    isReplyToBot: false,
    // Already handled by normal flow
    isDM: false,
    recentMessageCount: recentMessages.length,
    hasSocialScope: true,
    // We already checked social.enabled
    channelConfig,
    isOnCooldown: cooldown.isChannelOnCooldown(channelId, channelConfig.cooldownMs),
    isGlobalCooldownActive: cooldown.isGlobalOnCooldown(
      guildId,
      guildConfig.social.globalCooldownMs || 3e4
    ),
    isHourlyLimitReached: cooldown.isHourlyLimitReached(
      guildId,
      guildConfig.social.maxResponsesPerHour || 10
    ),
    isUserOnCooldown: cooldown.isUserOnCooldown(authorId, 5e3),
    isDuplicate: cooldown.isDuplicateResponse(guildId, content)
  };
  const decision = (0, import_decision.makeSocialDecision)(decisionInput);
  if (decision.action === "skip") {
    import_logger.logger.debug(
      `Social skip: channel=${channelId} reason=${decision.reason}`
    );
    return true;
  }
  const socialContext = (0, import_decision.buildSocialContext)(decision, recentMessages);
  let conversationContext = "";
  try {
    const { ConversationMemory } = await import("../../ai/memory");
    const memory = globalThis.__ashenai_memory;
    if (memory && typeof memory.get === "function") {
      const history = memory.get(authorId, channelId);
      if (history && history.length > 0) {
        conversationContext = history.slice(-5).map((h) => h.content).join("\n");
      }
    }
  } catch {
  }
  const messages = [
    {
      role: "system",
      content: [
        socialContext,
        conversationContext ? `
Recent conversation context:
${conversationContext}` : ""
      ].filter(Boolean).join("\n")
    },
    {
      role: "user",
      content: `The following message was posted in a Discord channel. If you have something useful to contribute, respond naturally. If not, respond with exactly "SKIP" (no other text).

Message from ${author.displayName || author.username}: "${content}"`
    }
  ];
  try {
    const response = await options.generateAI(messages);
    if (!response || response.trim().toUpperCase() === "SKIP" || response.trim().length === 0) {
      import_logger.logger.debug(
        `Social AI decided not to respond: channel=${channelId}`
      );
      return true;
    }
    const truncated = response.length > 500 ? response.slice(0, 497) + "..." : response;
    await message.reply(truncated);
    cooldown.recordResponse(channelId, guildId, authorId, truncated);
    import_logger.logger.info(
      `Social response sent: channel=${channelId} reason=${decision.reason} len=${truncated.length}`
    );
    return true;
  } catch (error) {
    import_logger.logger.warn(
      `Social AI generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return true;
  }
}
let cleanupTimer = null;
function startSocialCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - CONTEXT_TTL_MS;
    for (const [channelId, messages] of socialContextCache) {
      const filtered = messages.filter((m) => m.timestamp > cutoff);
      if (filtered.length === 0) {
        socialContextCache.delete(channelId);
      } else {
        socialContextCache.set(channelId, filtered);
      }
    }
  }, 5 * 60 * 1e3);
  cleanupTimer.unref();
}
function stopSocialCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  socialContextCache.clear();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handleSocialMessage,
  startSocialCleanup,
  stopSocialCleanup
});
