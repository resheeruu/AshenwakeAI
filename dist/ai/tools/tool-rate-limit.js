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
var tool_rate_limit_exports = {};
__export(tool_rate_limit_exports, {
  ToolRateLimiter: () => ToolRateLimiter,
  toolRateLimiter: () => toolRateLimiter
});
module.exports = __toCommonJS(tool_rate_limit_exports);
const ROLE_MULTIPLIERS = {
  owner: Infinity,
  admin: 2,
  moderator: 1,
  member: 0.5,
  guest: 0.25
};
function getEffectiveLimit(baseLimit, role) {
  const multiplier = ROLE_MULTIPLIERS[role] ?? 1;
  if (!isFinite(multiplier)) return Infinity;
  return Math.max(1, Math.floor(baseLimit * multiplier));
}
class ToolRateLimiter {
  /** Global buckets: key = "guildId:requesterId" */
  globalBuckets = /* @__PURE__ */ new Map();
  /** Per-tool buckets: key = "guildId:requesterId:toolName" */
  toolBuckets = /* @__PURE__ */ new Map();
  /** Active reservations: key = "guildId:requesterId:planId" */
  reservations = /* @__PURE__ */ new Map();
  globalConfig;
  perToolLimits = /* @__PURE__ */ new Map();
  cleanupInterval;
  constructor(globalConfig = {
    maxRequests: 20,
    windowMs: 6e4
  }) {
    this.globalConfig = globalConfig;
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      globalConfig.windowMs
    );
    this.cleanupInterval.unref();
  }
  /* ==============================================================
   * CHECK — Verify rate limit and CONSUME a token if allowed.
   *
   * Uses trusted guildId + requesterId from ToolContext.
   * NEVER uses user-controlled tool arguments for the key.
   *
   * Returns { allowed: false } if over limit.
   * Owner role always returns { allowed: true }.
   * ============================================================== */
  check(guildId, requesterId, role, toolName) {
    if (role === "owner") {
      return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
    }
    const now = Date.now();
    const globalResult = this.checkBucket(
      this.globalBuckets,
      `${guildId}:${requesterId}`,
      getEffectiveLimit(this.globalConfig.maxRequests, role),
      this.globalConfig.windowMs,
      now
    );
    if (!globalResult.allowed) {
      return globalResult;
    }
    if (toolName) {
      const toolConfig = this.perToolLimits.get(toolName);
      if (toolConfig) {
        const toolResult = this.checkBucket(
          this.toolBuckets,
          `${guildId}:${requesterId}:${toolName}`,
          getEffectiveLimit(toolConfig.maxRequests, role),
          toolConfig.windowMs,
          now
        );
        if (!toolResult.allowed) {
          return toolResult;
        }
        return {
          allowed: true,
          remaining: Math.min(globalResult.remaining, toolResult.remaining),
          retryAfterMs: 0
        };
      }
    }
    return globalResult;
  }
  /* ==============================================================
   * IS LIMITED — Check rate limit WITHOUT consuming a token.
   *
   * Used by validateRateLimit for validation-only checks that
   * must not consume tokens (consumption happens in reserve/check).
   * ============================================================== */
  isLimited(guildId, requesterId, role, toolName) {
    if (role === "owner") {
      return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
    }
    const now = Date.now();
    const globalResult = this.peekBucket(
      this.globalBuckets,
      `${guildId}:${requesterId}`,
      getEffectiveLimit(this.globalConfig.maxRequests, role),
      this.globalConfig.windowMs,
      now
    );
    if (!globalResult.allowed) {
      return globalResult;
    }
    if (toolName) {
      const toolConfig = this.perToolLimits.get(toolName);
      if (toolConfig) {
        const toolResult = this.peekBucket(
          this.toolBuckets,
          `${guildId}:${requesterId}:${toolName}`,
          getEffectiveLimit(toolConfig.maxRequests, role),
          toolConfig.windowMs,
          now
        );
        if (!toolResult.allowed) {
          return toolResult;
        }
        return {
          allowed: true,
          remaining: Math.min(globalResult.remaining, toolResult.remaining),
          retryAfterMs: 0
        };
      }
    }
    return globalResult;
  }
  /* ==============================================================
   * RESERVE — Create a rate-limit reservation for a plan.
   *
   * Called during plan creation (executor step 5). Consumes a
   * token and stores the reservation so confirmation can verify
   * without double-consuming.
   *
   * Returns true if reservation was created, false if rate-limited.
   * ============================================================== */
  reserve(guildId, requesterId, role, planId, toolName) {
    const result = this.check(guildId, requesterId, role, toolName);
    if (!result.allowed) return false;
    const key = `${guildId}:${requesterId}:${planId}`;
    this.reservations.set(key, {
      toolName,
      createdAt: Date.now()
    });
    return true;
  }
  /* ==============================================================
   * CONFIRM RESERVATION — Verify a reservation exists for the plan.
   *
   * Called during confirmation execution. Does NOT consume another
   * token — the token was already consumed at reserve() time.
   *
   * Returns true if reservation is valid (not expired).
   * ============================================================== */
  confirmReservation(guildId, requesterId, planId) {
    const key = `${guildId}:${requesterId}:${planId}`;
    const reservation = this.reservations.get(key);
    if (!reservation) return false;
    const RESERVATION_TTL = 5 * 60 * 1e3;
    if (Date.now() - reservation.createdAt > RESERVATION_TTL) {
      this.reservations.delete(key);
      return false;
    }
    return true;
  }
  /* ==============================================================
   * RELEASE — Remove a reservation (e.g., on plan cancellation).
   * ============================================================== */
  release(guildId, requesterId, planId) {
    const key = `${guildId}:${requesterId}:${planId}`;
    this.reservations.delete(key);
  }
  /* ==============================================================
   * CONFIGURATION
   * ============================================================== */
  setPerToolLimit(toolName, config) {
    this.perToolLimits.set(toolName, config);
  }
  removePerToolLimit(toolName) {
    this.perToolLimits.delete(toolName);
  }
  getGlobalConfig() {
    return { ...this.globalConfig };
  }
  getPerToolConfig(toolName) {
    const config = this.perToolLimits.get(toolName);
    return config ? { ...config } : void 0;
  }
  /* ==============================================================
   * RESET — Clear all state for a user in a guild.
   * ============================================================== */
  reset(guildId, requesterId) {
    const prefix = `${guildId}:${requesterId}`;
    for (const key of this.globalBuckets.keys()) {
      if (key.startsWith(prefix)) {
        this.globalBuckets.delete(key);
      }
    }
    for (const key of this.toolBuckets.keys()) {
      if (key.startsWith(prefix)) {
        this.toolBuckets.delete(key);
      }
    }
    for (const key of this.reservations.keys()) {
      if (key.startsWith(prefix)) {
        this.reservations.delete(key);
      }
    }
  }
  /* ==============================================================
   * CLEANUP — Remove expired entries to prevent memory leaks.
   * ============================================================== */
  cleanup() {
    const now = Date.now();
    for (const [key, bucket] of this.globalBuckets) {
      bucket.timestamps = bucket.timestamps.filter(
        (ts) => now - ts < this.globalConfig.windowMs
      );
      if (bucket.timestamps.length === 0) {
        this.globalBuckets.delete(key);
      }
    }
    for (const [key, bucket] of this.toolBuckets) {
      const toolName = key.split(":").pop();
      const config = this.perToolLimits.get(toolName);
      const windowMs = config?.windowMs ?? this.globalConfig.windowMs;
      bucket.timestamps = bucket.timestamps.filter(
        (ts) => now - ts < windowMs
      );
      if (bucket.timestamps.length === 0) {
        this.toolBuckets.delete(key);
      }
    }
    const RESERVATION_TTL = 5 * 60 * 1e3;
    for (const [key, entry] of this.reservations) {
      if (now - entry.createdAt > RESERVATION_TTL) {
        this.reservations.delete(key);
      }
    }
  }
  /* ==============================================================
   * STATS — For testing and monitoring.
   * ============================================================== */
  getStats() {
    return {
      globalBuckets: this.globalBuckets.size,
      toolBuckets: this.toolBuckets.size,
      reservations: this.reservations.size
    };
  }
  /* ==============================================================
   * INTERNAL — Check a single bucket (consume token).
   * ============================================================== */
  checkBucket(buckets, key, maxRequests, windowMs, now) {
    if (!isFinite(maxRequests)) {
      return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
    }
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }
    bucket.timestamps = bucket.timestamps.filter(
      (ts) => now - ts < windowMs
    );
    if (bucket.timestamps.length >= maxRequests) {
      const oldest = bucket.timestamps[0] ?? now;
      const retryAfterMs = Math.max(0, windowMs - (now - oldest));
      return { allowed: false, remaining: 0, retryAfterMs };
    }
    bucket.timestamps.push(now);
    return {
      allowed: true,
      remaining: maxRequests - bucket.timestamps.length,
      retryAfterMs: 0
    };
  }
  /* ==============================================================
   * INTERNAL — Peek at a single bucket without consuming.
   * ============================================================== */
  peekBucket(buckets, key, maxRequests, windowMs, now) {
    if (!isFinite(maxRequests)) {
      return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
    }
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }
    const activeTimestamps = bucket.timestamps.filter(
      (ts) => now - ts < windowMs
    );
    if (activeTimestamps.length >= maxRequests) {
      const oldest = activeTimestamps[0] ?? now;
      const retryAfterMs = Math.max(0, windowMs - (now - oldest));
      return { allowed: false, remaining: 0, retryAfterMs };
    }
    return {
      allowed: true,
      remaining: maxRequests - activeTimestamps.length,
      retryAfterMs: 0
    };
  }
}
const toolRateLimiter = new ToolRateLimiter();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ToolRateLimiter,
  toolRateLimiter
});
