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
var response_cache_exports = {};
__export(response_cache_exports, {
  cleanupExpiredCache: () => cleanupExpiredCache,
  clearAllCache: () => clearAllCache,
  clearCacheForModel: () => clearCacheForModel,
  computeCacheKey: () => computeCacheKey,
  enforceCacheLimit: () => enforceCacheLimit,
  getCacheStats: () => getCacheStats,
  getCachedResponse: () => getCachedResponse,
  invalidateCacheEntry: () => invalidateCacheEntry,
  isCacheEnabled: () => isCacheEnabled,
  setCacheEnabled: () => setCacheEnabled,
  setCachedResponse: () => setCachedResponse,
  shouldBypassCache: () => shouldBypassCache
});
module.exports = __toCommonJS(response_cache_exports);
var import_crypto = __toESM(require("crypto"));
var import_database = require("../database");
var import_logger = require("../logger");
const DEFAULT_TTL_MS = 36e5;
const MAX_CACHE_ENTRIES = 1e4;
const CLEANUP_INTERVAL_MS = 3e5;
let lastCleanupAt = 0;
let cacheEnabled = true;
function setCacheEnabled(enabled) {
  cacheEnabled = enabled;
}
function isCacheEnabled() {
  return cacheEnabled;
}
function computeCacheKey(systemPrompt, messages, model, guildId, userId, channelId) {
  const payload = JSON.stringify({
    s: systemPrompt,
    m: messages.map((m) => ({ r: m.role, c: m.content })),
    M: model,
    g: guildId ?? "",
    u: userId ?? "",
    c: channelId ?? ""
  });
  return import_crypto.default.createHash("sha256").update(payload).digest("hex");
}
function shouldBypassCache(systemPrompt, messages, response) {
  const combined = systemPrompt + response;
  if (/\b(your (api|access) key|password|token|secret|credential)\b/i.test(combined)) {
    return true;
  }
  if (/\b(banned?|kicked?|timed?\s*out|muted?|warned?|punishment|moderation)\b/i.test(combined)) {
    return true;
  }
  if (/\b(live|real[\s-]?time|fetched|scraped|web\s*search|url:|http[s]?:\/\/)\b/i.test(combined)) {
    return true;
  }
  if (/\b(current\s+(data|information|price|status|result|value|level|rate))\b/i.test(combined)) {
    return true;
  }
  if (/\b(tool\s*(result|output|response)|mcp\s*(result|output)|function\s*call)\b/i.test(combined)) {
    return true;
  }
  if (/\b(security|permission\s*change|role\s*change|admin|owner|trust|grant)\b/i.test(combined)) {
    return true;
  }
  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  if (lastUserMsg && /\b(my\s+(key|password|token|secret|credential))\b/i.test(lastUserMsg.content)) {
    return true;
  }
  if (response.length < 20) {
    return true;
  }
  return false;
}
function ensureTable() {
  const db = (0, import_database.getDatabase)();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_response_cache (
      cache_key TEXT PRIMARY KEY,
      response TEXT NOT NULL,
      model TEXT NOT NULL,
      guild_id TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      expires_at INTEGER NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_response_cache_expires ON ai_response_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_response_cache_model ON ai_response_cache(model);
  `);
}
function getCachedResponse(systemPrompt, messages, model, guildId, userId) {
  if (!cacheEnabled) return null;
  const cacheKey = computeCacheKey(systemPrompt, messages, model, guildId, userId);
  const now = Date.now();
  const result = (0, import_database.safeDbOperation)(() => {
    ensureTable();
    const db = (0, import_database.getDatabase)();
    const row = db.prepare(
      `SELECT response, expires_at FROM ai_response_cache WHERE cache_key = ?`
    ).get(cacheKey);
    if (!row) return null;
    if (row.expires_at < now) {
      db.prepare(`DELETE FROM ai_response_cache WHERE cache_key = ?`).run(cacheKey);
      return null;
    }
    db.prepare(
      `UPDATE ai_response_cache SET hit_count = hit_count + 1 WHERE cache_key = ?`
    ).run(cacheKey);
    return row.response;
  }, null, "response-cache-lookup");
  if (result) {
    import_logger.logger.debug(`Cache HIT for model=${model}`);
  }
  return result;
}
function setCachedResponse(systemPrompt, messages, model, response, tokenCount, ttlMs = DEFAULT_TTL_MS, guildId, userId) {
  if (!cacheEnabled) return;
  if (shouldBypassCache(systemPrompt, messages, response)) {
    return;
  }
  const cacheKey = computeCacheKey(systemPrompt, messages, model, guildId, userId);
  const now = Date.now();
  const expiresAt = now + ttlMs;
  (0, import_database.safeDbOperation)(() => {
    ensureTable();
    const db = (0, import_database.getDatabase)();
    db.prepare(`
      INSERT OR REPLACE INTO ai_response_cache
        (cache_key, response, model, guild_id, user_id, token_count, created_at, expires_at, hit_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(cacheKey, response, model, guildId ?? "", userId ?? "", tokenCount, now, expiresAt);
    import_logger.logger.debug(`Cache SET for model=${model}, ttl=${ttlMs}ms`);
  }, void 0, "response-cache-set");
  if (now - lastCleanupAt > CLEANUP_INTERVAL_MS) {
    cleanupExpiredCache();
    enforceCacheLimit();
    lastCleanupAt = now;
  }
}
function invalidateCacheEntry(systemPrompt, messages, model, guildId, userId) {
  const cacheKey = computeCacheKey(systemPrompt, messages, model, guildId, userId);
  (0, import_database.safeDbOperation)(() => {
    ensureTable();
    (0, import_database.getDatabase)().prepare(
      `DELETE FROM ai_response_cache WHERE cache_key = ?`
    ).run(cacheKey);
  }, void 0, "response-cache-invalidate");
}
function clearCacheForModel(model) {
  return (0, import_database.safeDbOperation)(() => {
    ensureTable();
    const result = (0, import_database.getDatabase)().prepare(
      `DELETE FROM ai_response_cache WHERE model = ?`
    ).run(model);
    return result.changes;
  }, 0, "response-cache-clear-model");
}
function clearAllCache() {
  return (0, import_database.safeDbOperation)(() => {
    ensureTable();
    const result = (0, import_database.getDatabase)().prepare(
      `DELETE FROM ai_response_cache`
    ).run();
    return result.changes;
  }, 0, "response-cache-clear-all");
}
function cleanupExpiredCache() {
  return (0, import_database.safeDbOperation)(() => {
    ensureTable();
    const result = (0, import_database.getDatabase)().prepare(
      `DELETE FROM ai_response_cache WHERE expires_at < ?`
    ).run(Date.now());
    if (result.changes > 0) {
      import_logger.logger.debug(`Cleaned up ${result.changes} expired cache entries`);
    }
    return result.changes;
  }, 0, "response-cache-cleanup");
}
function getCacheStats() {
  return (0, import_database.safeDbOperation)(() => {
    ensureTable();
    const db = (0, import_database.getDatabase)();
    const totals = db.prepare(
      `SELECT COUNT(*) as total, COALESCE(SUM(hit_count), 0) as hits, COALESCE(SUM(LENGTH(response)), 0) as size FROM ai_response_cache`
    ).get();
    const models = db.prepare(
      `SELECT model, COUNT(*) as count FROM ai_response_cache GROUP BY model`
    ).all();
    const modelBreakdown = {};
    for (const row of models) {
      modelBreakdown[row.model] = row.count;
    }
    return {
      totalEntries: totals.total,
      totalHits: totals.hits,
      totalSizeEstimate: totals.size,
      modelBreakdown
    };
  }, { totalEntries: 0, totalHits: 0, totalSizeEstimate: 0, modelBreakdown: {} }, "response-cache-stats");
}
function enforceCacheLimit(maxEntries = MAX_CACHE_ENTRIES) {
  return (0, import_database.safeDbOperation)(() => {
    ensureTable();
    const db = (0, import_database.getDatabase)();
    const count = db.prepare(
      `SELECT COUNT(*) as c FROM ai_response_cache`
    ).get();
    if (count.c <= maxEntries) return 0;
    const toDelete = count.c - maxEntries;
    const result = db.prepare(
      `DELETE FROM ai_response_cache WHERE cache_key IN (
        SELECT cache_key FROM ai_response_cache
        ORDER BY hit_count ASC, created_at ASC
        LIMIT ?
      )`
    ).run(toDelete);
    import_logger.logger.debug(`Evicted ${result.changes} cache entries to enforce limit`);
    return result.changes;
  }, 0, "response-cache-enforce-limit");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanupExpiredCache,
  clearAllCache,
  clearCacheForModel,
  computeCacheKey,
  enforceCacheLimit,
  getCacheStats,
  getCachedResponse,
  invalidateCacheEntry,
  isCacheEnabled,
  setCacheEnabled,
  setCachedResponse,
  shouldBypassCache
});
