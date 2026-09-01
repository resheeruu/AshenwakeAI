import { getDatabase, safeDbOperation } from "./database";
import { BuilderSessionSchema, validateSchema } from "./schemas";
import type { BuilderSession } from "../commands/prompt";

/**
 * Load all builder sessions from SQLite.
 */
export function loadBuilderSessionsDB(): Map<string, BuilderSession> {
  return safeDbOperation(() => {
    const db = getDatabase();
    const rows = db.prepare("SELECT session_key, session_json FROM builder_sessions").all() as any[];
    const result = new Map<string, BuilderSession>();

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.session_json);
        const validated = validateSchema(BuilderSessionSchema, parsed);
        if (validated) {
          result.set(row.session_key, validated as BuilderSession);
        }
      } catch {
        // Skip corrupted entries
      }
    }

    return result;
  }, new Map(), "loadBuilderSessions");
}

/**
 * Save a builder session to SQLite.
 */
export function saveBuilderSessionDB(key: string, session: BuilderSession): void {
  safeDbOperation(() => {
    const db = getDatabase();
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
      session.lastActivityAt,
    );
  }, undefined, `saveBuilderSession(${key})`);
}

/**
 * Delete a builder session from SQLite.
 */
export function deleteBuilderSessionDB(key: string): void {
  safeDbOperation(() => {
    const db = getDatabase();
    db.prepare("DELETE FROM builder_sessions WHERE session_key = ?").run(key);
  }, undefined, `deleteBuilderSession(${key})`);
}

/**
 * Delete expired builder sessions from SQLite.
 */
export function deleteExpiredBuilderSessionsDB(timeoutMs: number): number {
  return safeDbOperation(() => {
    const db = getDatabase();
    const cutoff = Date.now() - timeoutMs;
    const result = db.prepare("DELETE FROM builder_sessions WHERE last_activity_at < ?").run(cutoff);
    return result.changes;
  }, 0, "deleteExpiredBuilderSessions");
}
