import { getDatabase, safeDbOperation } from "./database";
import { ChatMessageSchema, validateSchema } from "./schemas";
import type { ChatMessage } from "../ai/types";

interface StoredConversation {
  messages: ChatMessage[];
  updatedAt: number;
}

/**
 * Load all conversations from SQLite.
 */
export function loadConversationsDB(): Map<string, { messages: ChatMessage[]; updatedAt: number }> {
  return safeDbOperation(() => {
    const db = getDatabase();
    const rows = db.prepare("SELECT conversation_key, messages_json, updated_at FROM conversations").all() as any[];
    const result = new Map<string, { messages: ChatMessage[]; updatedAt: number }>();

    for (const row of rows) {
      try {
        const messages = JSON.parse(row.messages_json) as unknown[];
        const validated = messages
          .map((msg) => validateSchema(ChatMessageSchema, msg))
          .filter((msg): msg is ChatMessage => msg !== null);
        if (validated.length > 0) {
          result.set(row.conversation_key, { messages: validated, updatedAt: row.updated_at });
        }
      } catch {
        // Skip corrupted entries
      }
    }

    return result;
  }, new Map(), "loadConversations");
}

/**
 * Save a conversation to SQLite.
 */
export function saveConversationDB(key: string, messages: ChatMessage[], updatedAt: number): void {
  safeDbOperation(() => {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO conversations (conversation_key, messages_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(conversation_key) DO UPDATE SET messages_json = excluded.messages_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(messages), updatedAt);
  }, undefined, `saveConversation(${key})`);
}

/**
 * Delete a conversation from SQLite.
 */
export function deleteConversationDB(key: string): void {
  safeDbOperation(() => {
    const db = getDatabase();
    db.prepare("DELETE FROM conversations WHERE conversation_key = ?").run(key);
  }, undefined, `deleteConversation(${key})`);
}

/**
 * Delete all conversations from SQLite.
 */
export function clearConversationsDB(): void {
  safeDbOperation(() => {
    const db = getDatabase();
    db.prepare("DELETE FROM conversations").run();
  }, undefined, "clearConversations");
}

/**
 * Delete expired conversations from SQLite.
 */
export function deleteExpiredConversationsDB(timeoutMs: number): number {
  return safeDbOperation(() => {
    const db = getDatabase();
    const cutoff = Date.now() - timeoutMs;
    const result = db.prepare("DELETE FROM conversations WHERE updated_at < ?").run(cutoff);
    return result.changes;
  }, 0, "deleteExpiredConversations");
}
