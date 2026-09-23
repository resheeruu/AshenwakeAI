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
var cooldown_exports = {};
__export(cooldown_exports, {
  SocialCooldown: () => SocialCooldown,
  getSocialCooldown: () => getSocialCooldown
});
module.exports = __toCommonJS(cooldown_exports);
class SocialCooldown {
  /** channelId -> cooldown state */
  channelCooldowns = /* @__PURE__ */ new Map();
  /** Global response tracking (per guild) */
  globalCooldowns = /* @__PURE__ */ new Map();
  /** Recent response hashes for duplicate prevention */
  recentResponses = /* @__PURE__ */ new Map();
  /** Per-user cooldown tracking */
  userCooldowns = /* @__PURE__ */ new Map();
  cleanupTimer;
  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1e3);
    this.cleanupTimer.unref();
  }
  /**
   * Check if a channel is on cooldown.
   * Returns true if the channel should NOT respond.
   */
  isChannelOnCooldown(channelId, cooldownMs) {
    const entry = this.channelCooldowns.get(channelId);
    if (!entry) return false;
    const elapsed = Date.now() - entry.lastResponseAt;
    return elapsed < cooldownMs;
  }
  /**
   * Check if the guild global cooldown is active.
   * Returns true if the guild should NOT respond.
   */
  isGlobalOnCooldown(guildId, globalCooldownMs) {
    const entry = this.globalCooldowns.get(guildId);
    if (!entry) return false;
    const elapsed = Date.now() - entry.lastResponseAt;
    return elapsed < globalCooldownMs;
  }
  /**
   * Check if the guild has exceeded its hourly response limit.
   */
  isHourlyLimitReached(guildId, maxPerHour) {
    const entry = this.globalCooldowns.get(guildId);
    if (!entry) return false;
    const windowElapsed = Date.now() - entry.windowStart;
    const HOUR_MS = 60 * 60 * 1e3;
    if (windowElapsed > HOUR_MS) {
      entry.responseCount = 0;
      entry.windowStart = Date.now();
      return false;
    }
    return entry.responseCount >= maxPerHour;
  }
  /**
   * Check if a user is on cooldown (prevents rapid-fire from one user).
   */
  isUserOnCooldown(userId, cooldownMs) {
    const lastResponse = this.userCooldowns.get(userId);
    if (!lastResponse) return false;
    return Date.now() - lastResponse < cooldownMs;
  }
  /**
   * Check if a response is a duplicate of a recent one.
   * Uses simple content similarity (lowercased word overlap).
   */
  isDuplicateResponse(guildId, content) {
    const hash = this.contentHash(content);
    const recent = this.recentResponses.get(guildId) || [];
    const cutoff = Date.now() - 5 * 60 * 1e3;
    const recentHashes = recent.filter((r) => r.timestamp > cutoff).map((r) => r.contentHash);
    return recentHashes.includes(hash);
  }
  /**
   * Record a response for cooldown tracking.
   */
  recordResponse(channelId, guildId, userId, content) {
    const now = Date.now();
    this.channelCooldowns.set(channelId, {
      lastResponseAt: now,
      responseCount: 0,
      windowStart: now
    });
    const globalEntry = this.globalCooldowns.get(guildId);
    if (globalEntry) {
      globalEntry.lastResponseAt = now;
      globalEntry.responseCount++;
    } else {
      this.globalCooldowns.set(guildId, {
        lastResponseAt: now,
        responseCount: 1,
        windowStart: now
      });
    }
    this.userCooldowns.set(userId, now);
    const hash = this.contentHash(content);
    const recent = this.recentResponses.get(guildId) || [];
    recent.push({ contentHash: hash, timestamp: now });
    const cutoff = Date.now() - 10 * 60 * 1e3;
    const trimmed = recent.filter((r) => r.timestamp > cutoff).slice(-20);
    this.recentResponses.set(guildId, trimmed);
  }
  /**
   * Simple content hash for duplicate detection.
   * Normalizes text and extracts key words.
   */
  contentHash(content) {
    return content.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 3).sort().join(" ");
  }
  cleanup() {
    const cutoff = Date.now() - 30 * 60 * 1e3;
    for (const [key, entry] of this.channelCooldowns) {
      if (entry.lastResponseAt < cutoff) {
        this.channelCooldowns.delete(key);
      }
    }
    for (const [key, entry] of this.globalCooldowns) {
      if (entry.lastResponseAt < cutoff) {
        this.globalCooldowns.delete(key);
      }
    }
    for (const [key, timestamp] of this.userCooldowns) {
      if (timestamp < cutoff) {
        this.userCooldowns.delete(key);
      }
    }
    for (const [key, entries] of this.recentResponses) {
      const filtered = entries.filter((e) => e.timestamp > cutoff);
      if (filtered.length === 0) {
        this.recentResponses.delete(key);
      } else {
        this.recentResponses.set(key, filtered);
      }
    }
  }
  destroy() {
    clearInterval(this.cleanupTimer);
    this.channelCooldowns.clear();
    this.globalCooldowns.clear();
    this.recentResponses.clear();
    this.userCooldowns.clear();
  }
}
let instance = null;
function getSocialCooldown() {
  if (!instance) instance = new SocialCooldown();
  return instance;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SocialCooldown,
  getSocialCooldown
});
