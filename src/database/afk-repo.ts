/* ================================================================
 * AFK REPOSITORY
 *
 * Persistent AFK state, scoped by (guild_id, user_id).
 * All SQL is parameterized. setAfk uses a single-statement UPSERT
 * (SQLite ON CONFLICT) so concurrent same-user writes resolve to a
 * deterministic last-write-wins row without multi-statement races.
 *
 * started_at records when the current AFK session began and is NOT
 * reset by re-setting a reason (session continuity); updated_at and
 * message are refreshed on every set.
 * ================================================================ */

import { getDatabase, safeDbOperation } from "./database";

export interface AfkState {
  guildId: string;
  userId: string;
  message: string;
  startedAt: number;
  updatedAt: number;
}

interface AfkRow {
  guild_id: string;
  user_id: string;
  message: string;
  started_at: number;
  updated_at: number;
}

function rowToState(row: AfkRow): AfkState {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    message: row.message ?? "",
    startedAt: Number(row.started_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

/**
 * Create or update the AFK state for (guildId, userId).
 * Single-statement UPSERT — atomic under SQLite concurrency.
 *
 * Returns false when the write did not happen (invalid ids or a failed DB
 * operation) so callers never tell the user they are AFK when they are not.
 */
export function setAfk(
  guildId: string,
  userId: string,
  message: string,
  now: number = Date.now(),
): boolean {
  if (!guildId || !userId) return false;

  return safeDbOperation(() => {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO afk_states (guild_id, user_id, message, started_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        message = excluded.message,
        updated_at = excluded.updated_at
    `).run(guildId, userId, message, now, now);
    return true;
  }, false, "setAfk");
}

/**
 * Read the AFK state for exactly (guildId, userId).
 * Returns null when absent — never crosses guild/user boundaries.
 */
export function getAfk(
  guildId: string,
  userId: string,
): AfkState | null {
  if (!guildId || !userId) return null;

  return safeDbOperation(() => {
    const db = getDatabase();
    const row = db
      .prepare(
        `SELECT guild_id, user_id, message, started_at, updated_at
         FROM afk_states
         WHERE guild_id = ? AND user_id = ?`,
      )
      .get(guildId, userId) as AfkRow | undefined;

    return row ? rowToState(row) : null;
  }, null, "getAfk");
}

/**
 * Clear the AFK state for exactly (guildId, userId).
 * Returns true when a row was removed.
 *
 * Read-before-delete: this runs on EVERY non-bot guild message when
 * auto-clear is on (the default), and ~all of those authors have no
 * AFK row. Checking first keeps the hot path a read-only indexed
 * lookup instead of a write transaction (WAL churn/fsync per message);
 * the DELETE — and its `changes` check — still decides the return
 * value, so the contract is unchanged under races.
 */
export function clearAfk(guildId: string, userId: string): boolean {
  if (!guildId || !userId) return false;

  return safeDbOperation(() => {
    const db = getDatabase();
    const exists = db
      .prepare(`SELECT 1 FROM afk_states WHERE guild_id = ? AND user_id = ?`)
      .get(guildId, userId);
    if (!exists) return false;

    const result = db
      .prepare(`DELETE FROM afk_states WHERE guild_id = ? AND user_id = ?`)
      .run(guildId, userId);
    return (result.changes ?? 0) > 0;
  }, false, "clearAfk");
}

/**
 * Load AFK states for a set of users within ONE guild.
 * Guild isolation is enforced by the guild_id predicate.
 * Input list is capped to bound statement size.
 */
export function listAfkByUserIds(
  guildId: string,
  userIds: string[],
): AfkState[] {
  if (!guildId || !Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }

  const unique = [...new Set(userIds.filter((id) => typeof id === "string" && id.length > 0))].slice(0, 100);
  if (unique.length === 0) return [];

  return safeDbOperation(() => {
    const db = getDatabase();
    const placeholders = unique.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT guild_id, user_id, message, started_at, updated_at
         FROM afk_states
         WHERE guild_id = ? AND user_id IN (${placeholders})`,
      )
      .all(guildId, ...unique) as AfkRow[];

    return rows.map(rowToState);
  }, [], "listAfkByUserIds");
}
