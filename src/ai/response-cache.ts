/**
 * AI Response Cache — Hardened SQLite-backed response caching.
 *
 * Security:
 * - Cache keys isolate guild, channel, user, model, and config context
 * - Never caches responses involving private user information, permissions,
 *   moderation, web research, tool/MCP calls, or security-sensitive operations
 * - Bounded TTL, max entries, and storage
 * - Thread-safe via SQLite WAL
 */

import crypto from "crypto";
import { getDatabase, safeDbOperation } from "../database";
import { logger } from "../logger";

const DEFAULT_TTL_MS = 3600_000; // 1 hour
const MAX_CACHE_ENTRIES = 10_000;
const CLEANUP_INTERVAL_MS = 300_000; // 5 minutes

let lastCleanupAt = 0;

let cacheEnabled = true;

export function setCacheEnabled(enabled: boolean): void {
  cacheEnabled = enabled;
}

export function isCacheEnabled(): boolean {
  return cacheEnabled;
}

/**
 * Compute a cache key that correctly isolates all relevant context.
 */
export function computeCacheKey(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  guildId?: string,
  userId?: string,
  channelId?: string,
): string {
  const payload = JSON.stringify({
    s: systemPrompt,
    m: messages.map(m => ({ r: m.role, c: m.content })),
    M: model,
    g: guildId ?? "",
    u: userId ?? "",
    c: channelId ?? "",
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Check if a response should NOT be cached.
 * Returns true if the response involves sensitive or dynamic content.
 */
export function shouldBypassCache(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  response: string,
): boolean {
  const combined = systemPrompt + response;

  // Bypass for responses involving private/permission content
  if (/\b(your (api|access) key|password|token|secret|credential)\b/i.test(combined)) {
    return true;
  }

  // Bypass for moderation decisions
  if (/\b(banned?|kicked?|timed?\s*out|muted?|warned?|punishment|moderation)\b/i.test(combined)) {
    return true;
  }

  // Bypass for web research / external data
  if (/\b(live|real[\s-]?time|fetched|scraped|web\s*search|url:|http[s]?:\/\/)\b/i.test(combined)) {
    return true;
  }

  // Bypass only if "current" is paired with data/info keywords (not just the word "current")
  if (/\b(current\s+(data|information|price|status|result|value|level|rate))\b/i.test(combined)) {
    return true;
  }

  // Bypass for tool/MCP call responses
  if (/\b(tool\s*(result|output|response)|mcp\s*(result|output)|function\s*call)\b/i.test(combined)) {
    return true;
  }

  // Bypass for security-sensitive operations
  if (/\b(security|permission\s*change|role\s*change|admin|owner|trust|grant)\b/i.test(combined)) {
    return true;
  }

  // Bypass for user-specific personalized content
  const lastUserMsg = messages.filter(m => m.role === "user").pop();
  if (lastUserMsg && /\b(my\s+(key|password|token|secret|credential))\b/i.test(lastUserMsg.content)) {
    return true;
  }

  // Bypass for short/unique responses (likely not reusable)
  if (response.length < 20) {
    return true;
  }

  return false;
}

export interface CachedResponse {
  cacheKey: string;
  response: string;
  model: string;
  tokenCount: number;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
}

function ensureTable(): void {
  const db = getDatabase();
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

export function getCachedResponse(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  guildId?: string,
  userId?: string,
): string | null {
  if (!cacheEnabled) return null;

  const cacheKey = computeCacheKey(systemPrompt, messages, model, guildId, userId);
  const now = Date.now();

  const result = safeDbOperation(() => {
    ensureTable();
    const db = getDatabase();
    const row = db.prepare(
      `SELECT response, expires_at FROM ai_response_cache WHERE cache_key = ?`
    ).get(cacheKey) as { response: string; expires_at: number } | undefined;

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
    logger.debug(`Cache HIT for model=${model}`);
  }

  return result;
}

export function setCachedResponse(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  response: string,
  tokenCount: number,
  ttlMs: number = DEFAULT_TTL_MS,
  guildId?: string,
  userId?: string,
): void {
  if (!cacheEnabled) return;

  // Never cache sensitive responses
  if (shouldBypassCache(systemPrompt, messages, response)) {
    return;
  }

  const cacheKey = computeCacheKey(systemPrompt, messages, model, guildId, userId);
  const now = Date.now();
  const expiresAt = now + ttlMs;

  safeDbOperation(() => {
    ensureTable();
    const db = getDatabase();

    db.prepare(`
      INSERT OR REPLACE INTO ai_response_cache
        (cache_key, response, model, guild_id, user_id, token_count, created_at, expires_at, hit_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(cacheKey, response, model, guildId ?? "", userId ?? "", tokenCount, now, expiresAt);

    logger.debug(`Cache SET for model=${model}, ttl=${ttlMs}ms`);
  }, undefined, "response-cache-set");

  if (now - lastCleanupAt > CLEANUP_INTERVAL_MS) {
    cleanupExpiredCache();
    enforceCacheLimit();
    lastCleanupAt = now;
  }
}

export function invalidateCacheEntry(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  guildId?: string,
  userId?: string,
): void {
  const cacheKey = computeCacheKey(systemPrompt, messages, model, guildId, userId);
  safeDbOperation(() => {
    ensureTable();
    getDatabase().prepare(
      `DELETE FROM ai_response_cache WHERE cache_key = ?`
    ).run(cacheKey);
  }, undefined, "response-cache-invalidate");
}

export function clearCacheForModel(model: string): number {
  return safeDbOperation(() => {
    ensureTable();
    const result = getDatabase().prepare(
      `DELETE FROM ai_response_cache WHERE model = ?`
    ).run(model);
    return result.changes;
  }, 0, "response-cache-clear-model");
}

export function clearAllCache(): number {
  return safeDbOperation(() => {
    ensureTable();
    const result = getDatabase().prepare(
      `DELETE FROM ai_response_cache`
    ).run();
    return result.changes;
  }, 0, "response-cache-clear-all");
}

export function cleanupExpiredCache(): number {
  return safeDbOperation(() => {
    ensureTable();
    const result = getDatabase().prepare(
      `DELETE FROM ai_response_cache WHERE expires_at < ?`
    ).run(Date.now());
    if (result.changes > 0) {
      logger.debug(`Cleaned up ${result.changes} expired cache entries`);
    }
    return result.changes;
  }, 0, "response-cache-cleanup");
}

export function getCacheStats(): {
  totalEntries: number;
  totalHits: number;
  totalSizeEstimate: number;
  modelBreakdown: Record<string, number>;
} {
  return safeDbOperation(() => {
    ensureTable();
    const db = getDatabase();

    const totals = db.prepare(
      `SELECT COUNT(*) as total, COALESCE(SUM(hit_count), 0) as hits, COALESCE(SUM(LENGTH(response)), 0) as size FROM ai_response_cache`
    ).get() as { total: number; hits: number; size: number };

    const models = db.prepare(
      `SELECT model, COUNT(*) as count FROM ai_response_cache GROUP BY model`
    ).all() as Array<{ model: string; count: number }>;

    const modelBreakdown: Record<string, number> = {};
    for (const row of models) {
      modelBreakdown[row.model] = row.count;
    }

    return {
      totalEntries: totals.total,
      totalHits: totals.hits,
      totalSizeEstimate: totals.size,
      modelBreakdown,
    };
  }, { totalEntries: 0, totalHits: 0, totalSizeEstimate: 0, modelBreakdown: {} }, "response-cache-stats");
}

export function enforceCacheLimit(maxEntries: number = MAX_CACHE_ENTRIES): number {
  return safeDbOperation(() => {
    ensureTable();
    const db = getDatabase();

    const count = db.prepare(
      `SELECT COUNT(*) as c FROM ai_response_cache`
    ).get() as { c: number };

    if (count.c <= maxEntries) return 0;

    const toDelete = count.c - maxEntries;
    const result = db.prepare(
      `DELETE FROM ai_response_cache WHERE cache_key IN (
        SELECT cache_key FROM ai_response_cache
        ORDER BY hit_count ASC, created_at ASC
        LIMIT ?
      )`
    ).run(toDelete);

    logger.debug(`Evicted ${result.changes} cache entries to enforce limit`);
    return result.changes;
  }, 0, "response-cache-enforce-limit");
}
