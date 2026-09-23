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
var builder_session_repo_exports = {};
__export(builder_session_repo_exports, {
  deleteBuilderSessionDB: () => deleteBuilderSessionDB,
  deleteExpiredBuilderSessionsDB: () => deleteExpiredBuilderSessionsDB,
  loadBuilderSessionsDB: () => loadBuilderSessionsDB,
  saveBuilderSessionDB: () => saveBuilderSessionDB
});
module.exports = __toCommonJS(builder_session_repo_exports);
var import_database = require("./database");
var import_schemas = require("./schemas");
function loadBuilderSessionsDB() {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare("SELECT session_key, session_json FROM builder_sessions").all();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.session_json);
        const validated = (0, import_schemas.validateSchema)(import_schemas.BuilderSessionSchema, parsed);
        if (validated) {
          result.set(row.session_key, validated);
        }
      } catch {
      }
    }
    return result;
  }, /* @__PURE__ */ new Map(), "loadBuilderSessions");
}
function saveBuilderSessionDB(key, session) {
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    db.prepare(`
      INSERT INTO builder_sessions (session_key, guild_id, channel_id, thread_id, user_id, session_json, started_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET
        session_json = excluded.session_json,
        last_activity_at = excluded.last_activity_at
    `).run(
      key,
      session.guildId,
      session.channelId,
      session.threadId,
      session.userId,
      JSON.stringify(session),
      session.startedAt,
      session.lastActivityAt
    );
  }, void 0, `saveBuilderSession(${key})`);
}
function deleteBuilderSessionDB(key) {
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    db.prepare("DELETE FROM builder_sessions WHERE session_key = ?").run(key);
  }, void 0, `deleteBuilderSession(${key})`);
}
function deleteExpiredBuilderSessionsDB(timeoutMs) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const cutoff = Date.now() - timeoutMs;
    const result = db.prepare("DELETE FROM builder_sessions WHERE last_activity_at < ?").run(cutoff);
    return result.changes;
  }, 0, "deleteExpiredBuilderSessions");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deleteBuilderSessionDB,
  deleteExpiredBuilderSessionsDB,
  loadBuilderSessionsDB,
  saveBuilderSessionDB
});
