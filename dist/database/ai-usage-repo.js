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
var ai_usage_repo_exports = {};
__export(ai_usage_repo_exports, {
  getAIUsageBySourceDB: () => getAIUsageBySourceDB,
  getAIUsageSummaryDB: () => getAIUsageSummaryDB,
  insertAIUsageDB: () => insertAIUsageDB
});
module.exports = __toCommonJS(ai_usage_repo_exports);
var import_database = require("./database");
function insertAIUsageDB(record) {
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
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
      record.createdAt || Math.floor(Date.now() / 1e3)
    );
  }, void 0, "insertAIUsage");
}
function getAIUsageSummaryDB(userId, sinceEpochSec) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const row = db.prepare(`
      SELECT
        COUNT(*) as requests,
        COALESCE(SUM(input_tokens), 0) as inputTokens,
        COALESCE(SUM(output_tokens), 0) as outputTokens,
        COALESCE(SUM(total_tokens), 0) as totalTokens
      FROM ai_usage
      WHERE user_id = ? AND created_at >= ? AND success = 1
    `).get(userId, sinceEpochSec);
    return {
      requests: row?.requests ?? 0,
      inputTokens: row?.inputTokens ?? 0,
      outputTokens: row?.outputTokens ?? 0,
      totalTokens: row?.totalTokens ?? 0
    };
  }, { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }, "getAIUsageSummary");
}
function getAIUsageBySourceDB(userId, sinceEpochSec) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare(`
      SELECT source, COUNT(*) as count
      FROM ai_usage
      WHERE user_id = ? AND created_at >= ? AND success = 1
      GROUP BY source
    `).all(userId, sinceEpochSec);
    const result = {};
    for (const row of rows) {
      result[row.source] = row.count;
    }
    return result;
  }, {}, "getAIUsageBySource");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getAIUsageBySourceDB,
  getAIUsageSummaryDB,
  insertAIUsageDB
});
