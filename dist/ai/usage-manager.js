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
var usage_manager_exports = {};
__export(usage_manager_exports, {
  UsageManager: () => UsageManager
});
module.exports = __toCommonJS(usage_manager_exports);
var import_data_store = require("../core/data-store");
const DEFAULT_COSTS = {
  simple: 1,
  normal: 1,
  long: 3,
  vision: 3,
  document: 5,
  agent: 10
};
const DEFAULT_LIMITS = {
  dailyLimit: 100,
  monthlyLimit: 2e3,
  rateLimitPerMinute: 10,
  burstLimit: 3,
  cooldownMs: 5e3,
  maxPromptSize: 4e3,
  maxOutputSize: 2e3,
  maxConcurrent: 3
};
const defaultConcurrent = { count: 0, waiters: [] };
const DATA_FILE = "usage-data.json";
function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}
function monthKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 7);
}
class UsageManager {
  data;
  limits;
  costs;
  concurrent = { count: 0, waiters: [] };
  rateLimitBuckets = /* @__PURE__ */ new Map();
  burstBuckets = /* @__PURE__ */ new Map();
  constructor(limits, costs) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.costs = { ...DEFAULT_COSTS, ...costs };
    this.data = (0, import_data_store.readJSON)(DATA_FILE, {
      users: {},
      guilds: {},
      global: { totalRequests: 0, totalCredits: 0, totalTokens: 0, failures: 0, providerUsage: {} }
    });
    setInterval(() => this.cleanupRateLimits(), 6e4).unref();
  }
  cleanupRateLimits() {
    const now = Date.now();
    for (const [key, timestamps] of this.rateLimitBuckets) {
      const filtered = timestamps.filter((t) => now - t < 6e4);
      if (filtered.length === 0) this.rateLimitBuckets.delete(key);
      else this.rateLimitBuckets.set(key, filtered);
    }
    for (const [key, timestamps] of this.burstBuckets) {
      const filtered = timestamps.filter((t) => now - t < 1e4);
      if (filtered.length === 0) this.burstBuckets.delete(key);
      else this.burstBuckets.set(key, filtered);
    }
  }
  getUser(userId) {
    if (!this.data.users[userId]) {
      this.data.users[userId] = {
        records: [],
        dailyCredits: 0,
        monthlyCredits: 0,
        lastResetDay: dayKey(),
        lastResetMonth: monthKey(),
        cooldownUntil: 0
      };
    }
    const user = this.data.users[userId];
    const today = dayKey();
    const thisMonth = monthKey();
    if (user.lastResetDay !== today) {
      user.dailyCredits = 0;
      user.lastResetDay = today;
    }
    if (user.lastResetMonth !== thisMonth) {
      user.monthlyCredits = 0;
      user.lastResetMonth = thisMonth;
    }
    return user;
  }
  getGuild(guildId) {
    if (!this.data.guilds[guildId]) {
      this.data.guilds[guildId] = {
        records: [],
        dailyCredits: 0,
        monthlyCredits: 0,
        lastResetDay: dayKey(),
        lastResetMonth: monthKey()
      };
    }
    const guild = this.data.guilds[guildId];
    const today = dayKey();
    const thisMonth = monthKey();
    if (guild.lastResetDay !== today) {
      guild.dailyCredits = 0;
      guild.lastResetDay = today;
    }
    if (guild.lastResetMonth !== thisMonth) {
      guild.monthlyCredits = 0;
      guild.lastResetMonth = thisMonth;
    }
    return guild;
  }
  estimateCredits(feature, inputLength) {
    if (feature === "vision") return this.costs.vision;
    if (feature === "ai_agent") return this.costs.agent;
    if (inputLength > 2e3) return this.costs.long;
    if (inputLength > 500) return this.costs.normal;
    return this.costs.simple;
  }
  check(userId, guildId, feature, inputLength = 0) {
    const credits = this.estimateCredits(feature, inputLength);
    const now = Date.now();
    const user = this.getUser(userId);
    if (user.cooldownUntil > now) {
      return {
        allowed: false,
        reason: "cooldown",
        credits,
        retryAfterMs: user.cooldownUntil - now
      };
    }
    if (user.dailyCredits + credits > this.limits.dailyLimit) {
      return {
        allowed: false,
        reason: "daily_limit",
        credits,
        retryAfterMs: this.msUntilMidnight()
      };
    }
    if (user.monthlyCredits + credits > this.limits.monthlyLimit) {
      return {
        allowed: false,
        reason: "monthly_limit",
        credits,
        retryAfterMs: this.msUntilMonthEnd()
      };
    }
    if (guildId) {
      const guild = this.getGuild(guildId);
      if (guild.dailyCredits + credits > this.limits.dailyLimit * 5) {
        return { allowed: false, reason: "guild_daily_limit", credits };
      }
    }
    const rlKey = `rate:${userId}`;
    const rlBucket = this.rateLimitBuckets.get(rlKey) || [];
    const recentRl = rlBucket.filter((t) => now - t < 6e4);
    if (recentRl.length >= this.limits.rateLimitPerMinute) {
      const oldest = recentRl[0];
      return {
        allowed: false,
        reason: "rate_limit",
        credits,
        retryAfterMs: 6e4 - (now - oldest)
      };
    }
    const burstKey = `burst:${userId}`;
    const burstBucket = this.burstBuckets.get(burstKey) || [];
    const recentBurst = burstBucket.filter((t) => now - t < 1e4);
    if (recentBurst.length >= this.limits.burstLimit) {
      return {
        allowed: false,
        reason: "burst_limit",
        credits,
        retryAfterMs: 1e4 - (now - recentBurst[0])
      };
    }
    if (this.concurrent.count >= this.limits.maxConcurrent) {
      return {
        allowed: false,
        reason: "concurrent_limit",
        credits
      };
    }
    return { allowed: true, credits };
  }
  writePending = false;
  record(params) {
    this.recordInternal(params);
    (0, import_data_store.writeJSON)(DATA_FILE, this.data);
  }
  /**
   * Record usage without writing to disk immediately.
   * Call flush() after response delivery to persist.
   * In-memory state is updated immediately so check() stays accurate.
   */
  recordDeferred(params) {
    this.recordInternal(params);
    this.writePending = true;
  }
  /**
   * Flush any deferred record to disk. Call after response delivery.
   */
  flush() {
    if (this.writePending) {
      this.writePending = false;
      (0, import_data_store.writeJSON)(DATA_FILE, this.data);
    }
  }
  recordInternal(params) {
    const { userId, guildId, feature, credits, tokens, inputTokens, outputTokens, provider, latencyMs, success } = params;
    const record = {
      feature,
      timestamp: Date.now(),
      credits,
      tokens,
      inputTokens,
      outputTokens,
      provider,
      latencyMs,
      success
    };
    const user = this.getUser(userId);
    user.records.push(record);
    if (user.records.length > 200) user.records = user.records.slice(-200);
    if (success) {
      user.dailyCredits += credits;
      user.monthlyCredits += credits;
    }
    if (guildId) {
      const guild = this.getGuild(guildId);
      guild.records.push(record);
      if (guild.records.length > 500) guild.records = guild.records.slice(-500);
      if (success) {
        guild.dailyCredits += credits;
        guild.monthlyCredits += credits;
      }
    }
    this.data.global.totalRequests++;
    if (success) {
      this.data.global.totalCredits += credits;
      this.data.global.totalTokens += tokens || 0;
    } else {
      this.data.global.failures++;
    }
    if (provider) {
      if (!this.data.global.providerUsage[provider]) {
        this.data.global.providerUsage[provider] = { requests: 0, credits: 0, latency: 0 };
      }
      const pu = this.data.global.providerUsage[provider];
      pu.requests++;
      pu.credits += credits;
      pu.latency = latencyMs || 0;
    }
    if (!success) {
      user.cooldownUntil = Date.now() + this.limits.cooldownMs;
    }
  }
  acquire() {
    if (this.concurrent.count >= this.limits.maxConcurrent) return false;
    this.concurrent.count++;
    return true;
  }
  release() {
    this.concurrent.count = Math.max(0, this.concurrent.count - 1);
    const waiter = this.concurrent.waiters.shift();
    if (waiter) waiter();
  }
  getUserUsage(userId) {
    const user = this.getUser(userId);
    const now = Date.now();
    const recent = user.records.filter((r) => now - r.timestamp < 6e4).length;
    const features = {};
    for (const r of user.records.filter((r2) => now - r2.timestamp < 864e5)) {
      features[r.feature] = (features[r.feature] || 0) + 1;
    }
    return {
      dailyCredits: user.dailyCredits,
      monthlyCredits: user.monthlyCredits,
      dailyLimit: this.limits.dailyLimit,
      monthlyLimit: this.limits.monthlyLimit,
      recentRequests: recent,
      features
    };
  }
  getGuildUsage(guildId) {
    const guild = this.getGuild(guildId);
    const features = {};
    for (const r of guild.records) {
      features[r.feature] = (features[r.feature] || 0) + 1;
    }
    return {
      dailyCredits: guild.dailyCredits,
      monthlyCredits: guild.monthlyCredits,
      totalRequests: guild.records.length,
      topFeatures: Object.entries(features).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([feature, count]) => ({ feature, count }))
    };
  }
  getGlobalUsage() {
    return { ...this.data.global };
  }
  getProviderUsage() {
    return { ...this.data.global.providerUsage };
  }
  detectSuspicious(userId) {
    const user = this.getUser(userId);
    const now = Date.now();
    const recentRecords = user.records.filter((r) => now - r.timestamp < 36e5);
    if (recentRecords.length > 50) return true;
    const failures = recentRecords.filter((r) => !r.success).length;
    if (failures > 10) return true;
    const uniqueFeatures = new Set(recentRecords.map((r) => r.feature));
    if (uniqueFeatures.size > 8) return true;
    return false;
  }
  msUntilMidnight() {
    const now = /* @__PURE__ */ new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }
  msUntilMonthEnd() {
    const now = /* @__PURE__ */ new Date();
    const end = new Date(now);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    end.setUTCHours(23, 59, 59, 999);
    return end.getTime() - now.getTime();
  }
  updateLimits(limits) {
    Object.assign(this.limits, limits);
  }
  updateCosts(costs) {
    Object.assign(this.costs, costs);
  }
  getLimits() {
    return { ...this.limits };
  }
  getCosts() {
    return { ...this.costs };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UsageManager
});
