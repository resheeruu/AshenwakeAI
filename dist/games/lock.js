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
var lock_exports = {};
__export(lock_exports, {
  lockManager: () => lockManager,
  withGlobalLock: () => withGlobalLock,
  withLock: () => withLock,
  withPlayerLock: () => withPlayerLock
});
module.exports = __toCommonJS(lock_exports);
class KeyedLockManager {
  queues = /* @__PURE__ */ new Map();
  active = /* @__PURE__ */ new Set();
  /**
   * Acquire a lock for the specified key and run the provided function.
   * Ensures strictly sequential execution per key.
   */
  async acquire(key, fn, timeoutMs = 15e3) {
    await this.lock(key, timeoutMs);
    try {
      return await fn();
    } finally {
      this.unlock(key);
    }
  }
  /**
   * Internal lock acquisition with timeout protection.
   */
  lock(key, timeoutMs) {
    if (!this.active.has(key)) {
      this.active.add(key);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const queue2 = this.queues.get(key);
        if (queue2) {
          const index = queue2.findIndex((item) => item.timer === timer);
          if (index !== -1) {
            queue2.splice(index, 1);
            if (queue2.length === 0) {
              this.queues.delete(key);
            }
          }
        }
        reject(
          new Error(
            `LOCK_TIMEOUT: Failed to acquire lock for '${key}' within ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
      const queue = this.queues.get(key) ?? [];
      queue.push({ resolve, reject, timer });
      this.queues.set(key, queue);
    });
  }
  /**
   * Release the lock for the specified key and dispatch next queued operation.
   */
  unlock(key) {
    const queue = this.queues.get(key);
    if (queue && queue.length > 0) {
      const next = queue.shift();
      clearTimeout(next.timer);
      if (queue.length === 0) {
        this.queues.delete(key);
      }
      next.resolve();
    } else {
      this.active.delete(key);
      this.queues.delete(key);
    }
  }
  /**
   * Check if a given key is currently locked.
   */
  isLocked(key) {
    return this.active.has(key);
  }
  /**
   * Get count of pending operations waiting for a key.
   */
  getQueueLength(key) {
    return this.queues.get(key)?.length ?? 0;
  }
}
const lockManager = new KeyedLockManager();
async function withLock(key, fn, timeoutMs = 15e3) {
  return lockManager.acquire(key, fn, timeoutMs);
}
async function withPlayerLock(userId, fn, timeoutMs = 15e3) {
  return withLock(`player:${userId}`, fn, timeoutMs);
}
async function withGlobalLock(resource, fn, timeoutMs = 15e3) {
  return withLock(`global:${resource}`, fn, timeoutMs);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  lockManager,
  withGlobalLock,
  withLock,
  withPlayerLock
});
