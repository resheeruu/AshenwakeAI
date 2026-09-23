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
var rate_limit_exports = {};
__export(rate_limit_exports, {
  UserRateLimiter: () => UserRateLimiter
});
module.exports = __toCommonJS(rate_limit_exports);
class UserRateLimiter {
  users = /* @__PURE__ */ new Map();
  maxRequests;
  windowMs;
  maxUsers;
  constructor(maxRequests = 10, windowMs = 6e4, maxUsers = 1e4) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.maxUsers = maxUsers;
    setInterval(
      () => this.cleanup(),
      windowMs
    ).unref();
  }
  check(userId) {
    const now = Date.now();
    let state = this.users.get(userId);
    if (!state) {
      state = {
        timestamps: []
      };
      if (this.users.size >= this.maxUsers) {
        this.cleanup();
      }
      this.users.set(
        userId,
        state
      );
    }
    state.timestamps = state.timestamps.filter(
      (timestamp) => now - timestamp < this.windowMs
    );
    if (state.timestamps.length >= this.maxRequests) {
      const oldest = state.timestamps[0] ?? now;
      const retryAfterMs = Math.max(
        0,
        this.windowMs - (now - oldest)
      );
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs
      };
    }
    state.timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxRequests - state.timestamps.length,
      retryAfterMs: 0
    };
  }
  reset(userId) {
    this.users.delete(userId);
  }
  cleanup() {
    const now = Date.now();
    for (const [
      userId,
      state
    ] of this.users) {
      state.timestamps = state.timestamps.filter(
        (timestamp) => now - timestamp < this.windowMs
      );
      if (state.timestamps.length === 0) {
        this.users.delete(userId);
      }
    }
  }
  getUserCount() {
    return this.users.size;
  }
  getConfig() {
    return {
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      windowSeconds: Math.floor(
        this.windowMs / 1e3
      )
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UserRateLimiter
});
