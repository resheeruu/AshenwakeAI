import { getDatabase, safeDbOperation } from "./database";

export interface AIUsageRecord {
  requestId: string;
  userId: string;
  guildId: string;
  channelId: string;
  source: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  success: boolean;
  latencyMs: number;
  createdAt: number;
}

/**
 * Insert an AI usage record. Idempotent on request_id.
 */
export function insertAIUsageDB(record: AIUsageRecord): void {
  safeDbOperation(() => {
    const db = getDatabase();
    db.prepare(`
      INSERT OR IGNORE INTO ai_usage
        (request_id, user_id, guild_id, channel_id, source, provider, model,
         input_tokens, output_tokens, total_tokens, success, latency_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.requestId,
      record.userId,
      record.guildId || "",
      record.channelId || "",
      record.source,
      record.provider || "",
      record.model || "",
      record.inputTokens ?? null,
      record.outputTokens ?? null,
      record.totalTokens ?? null,
      record.success ? 1 : 0,
      record.latencyMs || 0,
      record.createdAt || Math.floor(Date.now() / 1000),
    );
  }, undefined, "insertAIUsage");
}

/**
 * Get aggregated AI usage for a user within a time range.
 */
export function getAIUsageSummaryDB(
  userId: string,
  sinceEpochSec: number,
): { requests: number; inputTokens: number; outputTokens: number; totalTokens: number } {
  return safeDbOperation(() => {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT
        COUNT(*) as requests,
        COALESCE(SUM(input_tokens), 0) as inputTokens,
        COALESCE(SUM(output_tokens), 0) as outputTokens,
        COALESCE(SUM(total_tokens), 0) as totalTokens
      FROM ai_usage
      WHERE user_id = ? AND created_at >= ? AND success = 1
    `).get(userId, sinceEpochSec) as any;
    return {
      requests: row?.requests ?? 0,
      inputTokens: row?.inputTokens ?? 0,
      outputTokens: row?.outputTokens ?? 0,
      totalTokens: row?.totalTokens ?? 0,
    };
  }, { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }, "getAIUsageSummary");
}

/**
 * Get AI usage breakdown by source for a user within a time range.
 */
export function getAIUsageBySourceDB(
  userId: string,
  sinceEpochSec: number,
): Record<string, number> {
  return safeDbOperation(() => {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT source, COUNT(*) as count
      FROM ai_usage
      WHERE user_id = ? AND created_at >= ? AND success = 1
      GROUP BY source
    `).all(userId, sinceEpochSec) as any[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.source] = row.count;
    }
    return result;
  }, {}, "getAIUsageBySource");
}
