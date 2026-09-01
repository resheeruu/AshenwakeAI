import { getDatabase, safeDbOperation } from "./database";
import { AuditEntrySchema, validateSchema } from "./schemas";
import type { AuditEntry } from "../security/audit";

const MAX_ENTRIES = 5000;

/**
 * Insert an audit entry into SQLite.
 */
export function insertAuditEntryDB(entry: AuditEntry): void {
  safeDbOperation(() => {
    const db = getDatabase();
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
      entry.prevHash ?? null,
    );

    // Trim old entries if over limit
    const count = db.prepare("SELECT COUNT(*) as c FROM audit_log").get() as any;
    if (count.c > MAX_ENTRIES) {
      db.prepare(`
        DELETE FROM audit_log WHERE id IN (
          SELECT id FROM audit_log ORDER BY timestamp ASC LIMIT ?
        )
      `).run(count.c - MAX_ENTRIES);
    }
  }, undefined, "insertAuditEntry");
}

/**
 * Query audit entries from SQLite.
 */
export function getAuditLogDB(options: {
  guildId?: string;
  who?: string;
  limit?: number;
  since?: number;
} = {}): AuditEntry[] {
  return safeDbOperation(() => {
    const db = getDatabase();
    let sql = `SELECT id, timestamp, who, who_name as whoName, what, "where", guild_id as guildId, reason, result, details, signature, prev_hash as prevHash FROM audit_log WHERE 1=1`;
    const params: any[] = [];

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

    const rows = db.prepare(sql).all(...params) as any[];
    return rows
      .map((row) => validateSchema(AuditEntrySchema, row))
      .filter((entry): entry is AuditEntry => entry !== null)
      .reverse();
  }, [], "getAuditLog");
}

/**
 * Load all audit entries (for startup integrity check).
 */
export function loadAllAuditEntriesDB(): AuditEntry[] {
  return safeDbOperation(() => {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, timestamp, who, who_name as whoName, what, "where", guild_id as guildId, reason, result, details, signature, prev_hash as prevHash
      FROM audit_log ORDER BY timestamp ASC
    `).all() as any[];
    return rows
      .map((row) => validateSchema(AuditEntrySchema, row))
      .filter((entry): entry is AuditEntry => entry !== null);
  }, [], "loadAllAuditEntries");
}
