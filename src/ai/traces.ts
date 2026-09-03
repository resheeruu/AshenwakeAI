/**
 * Agent Traces — Hardened observability for AI agent operations.
 *
 * Improvements:
 * - Retention policy with configurable max age
 * - Maximum trace size enforcement
 * - Secret/credential redaction in metadata
 * - Bounded error messages
 * - Trace cleanup integrated with startup
 * - Indexes for common queries
 */

import { getDatabase, safeDbOperation } from "../database";
import { logger } from "../logger";

let tableEnsured = false;

const MAX_TRACE_SIZE_BYTES = 64 * 1024; // 64 KB per span
const MAX_ERROR_MESSAGE_LENGTH = 500;
const DEFAULT_RETENTION_MS = 7 * 24 * 3600_000; // 7 days
const CLEANUP_ON_STARTUP = true;

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi,
  /(?:token|secret|password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
  /(?:bearer|authorization)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{20,}['"]?/gi,
  /sk-[A-Za-z0-9]{20,}/g,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g,
];

function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

function redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") {
      result[key] = redactSecrets(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeErrorMessage(msg: string): string {
  if (msg.length > MAX_ERROR_MESSAGE_LENGTH) {
    return msg.slice(0, MAX_ERROR_MESSAGE_LENGTH) + "...";
  }
  return redactSecrets(msg);
}

function sanitizeMetadataSize(metadata: Record<string, unknown>): Record<string, unknown> {
  const serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_TRACE_SIZE_BYTES) {
    // Truncate large metadata
    return { _truncated: true, _originalSize: serialized.length };
  }
  return metadata;
}

function ensureTable(): void {
  if (tableEnsured) return;
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_traces (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      parent_id TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      duration_ms INTEGER,
      status TEXT NOT NULL DEFAULT 'ok',
      metadata_json TEXT,
      error_message TEXT,
      tokens_used INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_agent_traces_trace ON agent_traces(trace_id);
    CREATE INDEX IF NOT EXISTS idx_agent_traces_category ON agent_traces(category);
    CREATE INDEX IF NOT EXISTS idx_agent_traces_time ON agent_traces(start_time);
    CREATE INDEX IF NOT EXISTS idx_agent_traces_status ON agent_traces(status);
  `);
  tableEnsured = true;

  if (CLEANUP_ON_STARTUP) {
    cleanupOldTraces();
  }
}

export interface TraceSpan {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  category: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: "ok" | "error" | "timeout";
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  tokensUsed?: number;
  costUsd?: number;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
}

function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function generateSpanId(): string {
  return `span_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function startTrace(
  name: string,
  category: string,
  metadata?: Record<string, unknown>,
): TraceContext {
  ensureTable();

  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const now = Date.now();

  const span: TraceSpan = {
    id: spanId,
    traceId,
    name,
    category,
    startTime: now,
    status: "ok",
    metadata: metadata ? sanitizeMetadataSize(redactMetadata(metadata)) : undefined,
  };

  saveSpan(span);

  return { traceId, spanId };
}

export function startSpan(
  traceId: string,
  parentId: string,
  name: string,
  category: string,
  metadata?: Record<string, unknown>,
): string {
  ensureTable();

  const spanId = generateSpanId();
  const now = Date.now();

  const span: TraceSpan = {
    id: spanId,
    traceId,
    parentId,
    name,
    category,
    startTime: now,
    status: "ok",
    metadata: metadata ? sanitizeMetadataSize(redactMetadata(metadata)) : undefined,
  };

  saveSpan(span);

  return spanId;
}

export function endSpan(
  spanId: string,
  metadata?: Record<string, unknown>,
  tokensUsed?: number,
  costUsd?: number,
): void {
  ensureTable();

  const db = getDatabase();
  const now = Date.now();

  db.prepare(`
    UPDATE agent_traces SET
      end_time = ?,
      duration_ms = ? - start_time,
      status = 'ok',
      metadata_json = COALESCE(?, metadata_json),
      tokens_used = COALESCE(?, tokens_used),
      cost_usd = COALESCE(?, cost_usd)
    WHERE id = ?
  `).run(
    now,
    now,
    metadata ? JSON.stringify(sanitizeMetadataSize(redactMetadata(metadata))) : null,
    tokensUsed ?? null,
    costUsd ?? null,
    spanId,
  );
}

export function endSpanError(
  spanId: string,
  errorMessage: string,
  metadata?: Record<string, unknown>,
): void {
  ensureTable();

  const db = getDatabase();
  const now = Date.now();

  db.prepare(`
    UPDATE agent_traces SET
      end_time = ?,
      duration_ms = ? - start_time,
      status = 'error',
      error_message = ?,
      metadata_json = COALESCE(?, metadata_json)
    WHERE id = ?
  `).run(
    now,
    now,
    sanitizeErrorMessage(errorMessage),
    metadata ? JSON.stringify(sanitizeMetadataSize(redactMetadata(metadata))) : null,
    spanId,
  );
}

function saveSpan(span: TraceSpan): void {
  safeDbOperation(() => {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO agent_traces (id, trace_id, parent_id, name, category, start_time, end_time, duration_ms, status, metadata_json, error_message, tokens_used, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      span.id,
      span.traceId,
      span.parentId ?? null,
      span.name,
      span.category,
      span.startTime,
      span.endTime ?? null,
      span.durationMs ?? null,
      span.status,
      span.metadata ? JSON.stringify(span.metadata) : null,
      span.errorMessage ?? null,
      span.tokensUsed ?? 0,
      span.costUsd ?? 0,
    );
  }, undefined, "trace-save");
}

export function getTrace(traceId: string): TraceSpan[] {
  ensureTable();

  return safeDbOperation(() => {
    const db = getDatabase();
    const rows = db.prepare(
      `SELECT * FROM agent_traces WHERE trace_id = ? ORDER BY start_time ASC`
    ).all(traceId) as Array<{
      id: string;
      trace_id: string;
      parent_id: string | null;
      name: string;
      category: string;
      start_time: number;
      end_time: number | null;
      duration_ms: number | null;
      status: string;
      metadata_json: string | null;
      error_message: string | null;
      tokens_used: number;
      cost_usd: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      traceId: row.trace_id,
      parentId: row.parent_id ?? undefined,
      name: row.name,
      category: row.category,
      startTime: row.start_time,
      endTime: row.end_time ?? undefined,
      durationMs: row.duration_ms ?? undefined,
      status: row.status as TraceSpan["status"],
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      errorMessage: row.error_message ?? undefined,
      tokensUsed: row.tokens_used,
      costUsd: row.cost_usd,
    }));
  }, [], "trace-get");
}

export function getRecentTraces(limit: number = 20): TraceSpan[] {
  ensureTable();

  return safeDbOperation(() => {
    const db = getDatabase();
    const rows = db.prepare(
      `SELECT * FROM agent_traces WHERE parent_id IS NULL ORDER BY start_time DESC LIMIT ?`
    ).all(limit) as Array<{
      id: string;
      trace_id: string;
      name: string;
      category: string;
      start_time: number;
      end_time: number | null;
      duration_ms: number | null;
      status: string;
      tokens_used: number;
      cost_usd: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      traceId: row.trace_id,
      name: row.name,
      category: row.category,
      startTime: row.start_time,
      endTime: row.end_time ?? undefined,
      durationMs: row.duration_ms ?? undefined,
      status: row.status as TraceSpan["status"],
      tokensUsed: row.tokens_used,
      costUsd: row.cost_usd,
    }));
  }, [], "trace-recent");
}

export function getTraceStats(): {
  totalTraces: number;
  totalSpans: number;
  avgDurationMs: number;
  errorRate: number;
  categoryBreakdown: Record<string, number>;
  providerBreakdown: Record<string, number>;
} {
  ensureTable();

  return safeDbOperation(() => {
    const db = getDatabase();

    const totals = db.prepare(`
      SELECT
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as traces,
        COUNT(*) as spans,
        AVG(duration_ms) as avg_duration,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as errors
      FROM agent_traces
    `).get() as { traces: number; spans: number; avg_duration: number; errors: number };

    const categories = db.prepare(
      `SELECT category, COUNT(*) as count FROM agent_traces GROUP BY category`
    ).all() as Array<{ category: string; count: number }>;

    const providers = db.prepare(
      `SELECT JSON_EXTRACT(metadata_json, '$.provider') as provider, COUNT(*) as count
       FROM agent_traces
       WHERE category = 'provider' AND metadata_json IS NOT NULL
       GROUP BY provider`
    ).all() as Array<{ provider: string; count: number }>;

    const categoryBreakdown: Record<string, number> = {};
    for (const row of categories) {
      categoryBreakdown[row.category] = row.count;
    }

    const providerBreakdown: Record<string, number> = {};
    for (const row of providers) {
      if (row.provider) {
        providerBreakdown[row.provider] = row.count;
      }
    }

    return {
      totalTraces: totals.traces,
      totalSpans: totals.spans,
      avgDurationMs: Math.round(totals.avg_duration ?? 0),
      errorRate: totals.spans > 0 ? totals.errors / totals.spans : 0,
      categoryBreakdown,
      providerBreakdown,
    };
  }, { totalTraces: 0, totalSpans: 0, avgDurationMs: 0, errorRate: 0, categoryBreakdown: {}, providerBreakdown: {} }, "trace-stats");
}

export function cleanupOldTraces(maxAgeMs: number = DEFAULT_RETENTION_MS): number {
  ensureTable();

  return safeDbOperation(() => {
    const db = getDatabase();
    const cutoff = Date.now() - maxAgeMs;
    const result = db.prepare(
      `DELETE FROM agent_traces WHERE start_time < ?`
    ).run(cutoff);
    if (result.changes > 0) {
      logger.debug(`Cleaned up ${result.changes} old trace spans`);
    }
    return result.changes;
  }, 0, "trace-cleanup");
}

export async function traceSpan<T>(
  traceId: string,
  parentId: string,
  name: string,
  category: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const spanId = startSpan(traceId, parentId, name, category, metadata);
  try {
    const result = await fn();
    endSpan(spanId);
    return result;
  } catch (error) {
    endSpanError(spanId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
