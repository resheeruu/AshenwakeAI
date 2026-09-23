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
var audit_repo_exports = {};
__export(audit_repo_exports, {
  getAuditLogDB: () => getAuditLogDB,
  insertAuditEntryDB: () => insertAuditEntryDB,
  loadAllAuditEntriesDB: () => loadAllAuditEntriesDB
});
module.exports = __toCommonJS(audit_repo_exports);
var import_database = require("./database");
var import_schemas = require("./schemas");
const MAX_ENTRIES = 5e3;
function insertAuditEntryDB(entry) {
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    db.prepare(`
      INSERT INTO audit_log (id, timestamp, who, who_name, what, "where", guild_id, reason, result, details, signature, prev_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.timestamp,
      entry.who,
      entry.whoName ?? null,
      entry.what,
      entry.where,
      entry.guildId ?? null,
      entry.reason ?? null,
      entry.result,
      entry.details ?? null,
      entry.signature ?? null,
      entry.prevHash ?? null
    );
    const count = db.prepare("SELECT COUNT(*) as c FROM audit_log").get();
    if (count.c > MAX_ENTRIES) {
      db.prepare(`
        DELETE FROM audit_log WHERE id IN (
          SELECT id FROM audit_log ORDER BY timestamp ASC LIMIT ?
        )
      `).run(count.c - MAX_ENTRIES);
    }
  }, void 0, "insertAuditEntry");
}
function getAuditLogDB(options = {}) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    let sql = `SELECT id, timestamp, who, who_name as whoName, what, "where", guild_id as guildId, reason, result, details, signature, prev_hash as prevHash FROM audit_log WHERE 1=1`;
    const params = [];
    if (options.guildId) {
      sql += ` AND guild_id = ?`;
      params.push(options.guildId);
    }
    if (options.who) {
      sql += ` AND who = ?`;
      params.push(options.who);
    }
    if (options.since) {
      sql += ` AND timestamp >= ?`;
      params.push(options.since);
    }
    sql += ` ORDER BY timestamp DESC`;
    sql += ` LIMIT ?`;
    params.push(options.limit || 100);
    const rows = db.prepare(sql).all(...params);
    return rows.map((row) => (0, import_schemas.validateSchema)(import_schemas.AuditEntrySchema, row)).filter((entry) => entry !== null).reverse();
  }, [], "getAuditLog");
}
function loadAllAuditEntriesDB() {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare(`
      SELECT id, timestamp, who, who_name as whoName, what, "where", guild_id as guildId, reason, result, details, signature, prev_hash as prevHash
      FROM audit_log ORDER BY timestamp ASC
    `).all();
    return rows.map((row) => (0, import_schemas.validateSchema)(import_schemas.AuditEntrySchema, row)).filter((entry) => entry !== null);
  }, [], "loadAllAuditEntries");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getAuditLogDB,
  insertAuditEntryDB,
  loadAllAuditEntriesDB
});
