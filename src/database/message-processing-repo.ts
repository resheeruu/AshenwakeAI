import { getDatabase, transaction } from "./database";

export type MessageProcessingState = "PROCESSING" | "COMPLETED" | "FAILED_RETRYABLE" | "FAILED_FINAL";

export interface MessageProcessingRecord {
  messageId: string;
  state: MessageProcessingState;
  requestId: string | null;
  guildId: string | null;
  channelId: string | null;
  authorId: string | null;
  createdAt: number;
  updatedAt: number;
  leaseUntil: number | null;
  result: string | null;
}

/**
 * Try to claim a message for processing.
 * Returns the record if successfully claimed (either new or recovered from expired lease).
 * Returns null if message is already being processed by another worker with a valid lease.
 */
export function tryClaimMessageProcessing(
  messageId: string,
  requestId: string,
  guildId: string | null,
  channelId: string | null,
  authorId: string | null,
  leaseDurationMs: number = 60_000,
): MessageProcessingRecord | null {
  const db = getDatabase();
  const now = Date.now();
  const leaseUntil = now + leaseDurationMs;

  try {
    // Try to insert a new record (first time seeing this message)
    const insertStmt = db.prepare(`
      INSERT INTO message_processing (message_id, state, request_id, guild_id, channel_id, author_id, lease_until, created_at, updated_at)
      VALUES (?, 'PROCESSING', ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertResult = insertStmt.run(messageId, requestId, guildId, channelId, authorId, leaseUntil, Date.now(), Date.now());

    if (insertResult.changes === 1) {
      return {
        messageId,
        state: "PROCESSING",
        requestId,
        guildId,
        channelId,
        authorId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        leaseUntil,
        result: null,
      };
    }
  } catch (error) {
    // If UNIQUE constraint failed, the message already exists
    // Check if we can recover an expired lease
  }

  // Try to recover an expired lease
  const recoverNow = Date.now();
  const recoverStmt = db.prepare(`
    UPDATE message_processing
    SET state = 'PROCESSING', request_id = ?, lease_until = ?, updated_at = ?
    WHERE message_id = ? AND state = 'PROCESSING' AND (lease_until IS NULL OR lease_until <= ?)
  `);

  const recoverResult = recoverStmt.run(requestId, Date.now() + leaseDurationMs, Date.now(), messageId, now);

  if (recoverResult.changes === 1) {
    const record = getMessageProcessingRecord(messageId);
    if (record) return record;
  }

  // Message exists but couldn't recover lease - already being processed or completed
  return null;
}

export function getMessageProcessingRecord(messageId: string): MessageProcessingRecord | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT 
      message_id as messageId,
      state,
      request_id as requestId,
      guild_id as guildId,
      channel_id as channelId,
      author_id as authorId,
      created_at as createdAt,
      updated_at as updatedAt,
      lease_until as leaseUntil,
      result
    FROM message_processing
    WHERE message_id = ?
  `).get(messageId) as MessageProcessingRecord | undefined;

  return row ?? null;
}

export function completeMessageProcessing(messageId: string, state: "COMPLETED" | "FAILED_RETRYABLE" | "FAILED_FINAL", resultText?: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE message_processing
    SET state = ?, result = ?, updated_at = ?, lease_until = NULL
    WHERE message_id = ?
  `);
  const runResult = stmt.run(state, resultText ?? null, Date.now(), messageId);
  return runResult.changes === 1;
}

export function updateMessageProcessingResult(messageId: string, result: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE message_processing
    SET result = ?, updated_at = ?
    WHERE message_id = ?
  `);
  const res = stmt.run(result, Date.now(), messageId);
  return res.changes === 1;
}

export function releaseMessageProcessing(messageId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE message_processing
    SET state = 'FAILED_RETRYABLE', lease_until = NULL, updated_at = ?
    WHERE message_id = ? AND state = 'PROCESSING'
  `);
  const res = stmt.run(Date.now(), messageId);
  return res.changes === 1;
}

export function extendMessageProcessingLease(messageId: string, additionalMs: number = 60_000): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE message_processing
    SET lease_until = lease_until + ?, updated_at = ?
    WHERE message_id = ? AND state = 'PROCESSING' AND lease_until IS NOT NULL
  `);
  const res = stmt.run(additionalMs, Date.now(), messageId);
  return res.changes === 1;
}

export function cleanupExpiredMessageProcessing(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const db = getDatabase();
  const cutoff = Date.now() - maxAgeMs;
  const stmt = db.prepare(`
    DELETE FROM message_processing
    WHERE state IN ('COMPLETED', 'FAILED_FINAL')
    AND updated_at < ?
  `);
  const res = stmt.run(cutoff);
  return res.changes;
}