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
var traces_exports = {};
__export(traces_exports, {
  cleanupOldTraces: () => cleanupOldTraces,
  endSpan: () => endSpan,
  endSpanError: () => endSpanError,
  getRecentTraces: () => getRecentTraces,
  getTrace: () => getTrace,
  getTraceStats: () => getTraceStats,
  startSpan: () => startSpan,
  startTrace: () => startTrace,
  traceSpan: () => traceSpan
});
module.exports = __toCommonJS(traces_exports);
var import_database = require("../database");
var import_logger = require("../logger");
let tableEnsured = false;
const MAX_TRACE_SIZE_BYTES = 64 * 1024;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const DEFAULT_RETENTION_MS = 7 * 24 * 36e5;
const CLEANUP_ON_STARTUP = true;
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi,
  /(?:token|secret|password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
  /(?:bearer|authorization)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{20,}['"]?/gi,
  /sk-[A-Za-z0-9]{20,}/g,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g
];
function redactSecrets(text) {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}
function redactMetadata(metadata) {
  const result = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") {
      result[key] = redactSecrets(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
function sanitizeErrorMessage(msg) {
  if (msg.length > MAX_ERROR_MESSAGE_LENGTH) {
    return msg.slice(0, MAX_ERROR_MESSAGE_LENGTH) + "...";
  }
  return redactSecrets(msg);
}
function sanitizeMetadataSize(metadata) {
  const serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_TRACE_SIZE_BYTES) {
    return { _truncated: true, _originalSize: serialized.length };
  }
  return metadata;
}
function ensureTable() {
  if (tableEnsured) return;
  const db = (0, import_database.getDatabase)();
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
function generateTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
function generateSpanId() {
  return `span_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
function startTrace(name, category, metadata) {
  ensureTable();
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const now = Date.now();
  const span = {
    id: spanId,
    traceId,
    name,
    category,
    startTime: now,
    status: "ok",
    metadata: metadata ? sanitizeMetadataSize(redactMetadata(metadata)) : void 0
  };
  saveSpan(span);
  return { traceId, spanId };
}
function startSpan(traceId, parentId, name, category, metadata) {
  ensureTable();
  const spanId = generateSpanId();
  const now = Date.now();
  const span = {
    id: spanId,
    traceId,
    parentId,
    name,
    category,
    startTime: now,
    status: "ok",
    metadata: metadata ? sanitizeMetadataSize(redactMetadata(metadata)) : void 0
  };
  saveSpan(span);
  return spanId;
}
function endSpan(spanId, metadata, tokensUsed, costUsd) {
  ensureTable();
  const db = (0, import_database.getDatabase)();
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
    spanId
  );
}
function endSpanError(spanId, errorMessage, metadata) {
  ensureTable();
  const db = (0, import_database.getDatabase)();
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
    spanId
  );
}
function saveSpan(span) {
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
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
      span.costUsd ?? 0
    );
  }, void 0, "trace-save");
}
function getTrace(traceId) {
  ensureTable();
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare(
      `SELECT * FROM agent_traces WHERE trace_id = ? ORDER BY start_time ASC`
    ).all(traceId);
    return rows.map((row) => ({
      id: row.id,
      traceId: row.trace_id,
      parentId: row.parent_id ?? void 0,
      name: row.name,
      category: row.category,
      startTime: row.start_time,
      endTime: row.end_time ?? void 0,
      durationMs: row.duration_ms ?? void 0,
      status: row.status,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : void 0,
      errorMessage: row.error_message ?? void 0,
      tokensUsed: row.tokens_used,
      costUsd: row.cost_usd
    }));
  }, [], "trace-get");
}
function getRecentTraces(limit = 20) {
  ensureTable();
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare(
      `SELECT * FROM agent_traces WHERE parent_id IS NULL ORDER BY start_time DESC LIMIT ?`
    ).all(limit);
    return rows.map((row) => ({
      id: row.id,
      traceId: row.trace_id,
      name: row.name,
      category: row.category,
      startTime: row.start_time,
      endTime: row.end_time ?? void 0,
      durationMs: row.duration_ms ?? void 0,
      status: row.status,
      tokensUsed: row.tokens_used,
      costUsd: row.cost_usd
    }));
  }, [], "trace-recent");
}
function getTraceStats() {
  ensureTable();
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const totals = db.prepare(`
      SELECT
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as traces,
        COUNT(*) as spans,
        AVG(duration_ms) as avg_duration,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as errors
      FROM agent_traces
    `).get();
    const categories = db.prepare(
      `SELECT category, COUNT(*) as count FROM agent_traces GROUP BY category`
    ).all();
    const providers = db.prepare(
      `SELECT JSON_EXTRACT(metadata_json, '$.provider') as provider, COUNT(*) as count
       FROM agent_traces
       WHERE category = 'provider' AND metadata_json IS NOT NULL
       GROUP BY provider`
    ).all();
    const categoryBreakdown = {};
    for (const row of categories) {
      categoryBreakdown[row.category] = row.count;
    }
    const providerBreakdown = {};
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
      providerBreakdown
    };
  }, { totalTraces: 0, totalSpans: 0, avgDurationMs: 0, errorRate: 0, categoryBreakdown: {}, providerBreakdown: {} }, "trace-stats");
}
function cleanupOldTraces(maxAgeMs = DEFAULT_RETENTION_MS) {
  ensureTable();
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const cutoff = Date.now() - maxAgeMs;
    const result = db.prepare(
      `DELETE FROM agent_traces WHERE start_time < ?`
    ).run(cutoff);
    if (result.changes > 0) {
      import_logger.logger.debug(`Cleaned up ${result.changes} old trace spans`);
    }
    return result.changes;
  }, 0, "trace-cleanup");
}
async function traceSpan(traceId, parentId, name, category, fn, metadata) {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanupOldTraces,
  endSpan,
  endSpanError,
  getRecentTraces,
  getTrace,
  getTraceStats,
  startSpan,
  startTrace,
  traceSpan
});
