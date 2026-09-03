import { getDatabase, safeDbOperation } from "./database";
import type { ChatMessage } from "../ai/types";

interface SearchResult {
  conversationKey: string;
  messages: ChatMessage[];
  snippet: string;
  rank: number;
}

export function searchConversations(
  query: string,
  options: {
    limit?: number;
    guildId?: string;
    userId?: string;
  } = {},
): SearchResult[] {
  const { limit = 10, guildId, userId } = options;

  return safeDbOperation(() => {
    const db = getDatabase();

    const sanitizedQuery = query
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .join(" ");

    if (!sanitizedQuery) return [];

    let sql = `
      SELECT
        conversation_key,
        messages_json,
        snippet(conversations_fts, 1, '>>>', '<<<', '...', 32) as snippet,
        rank
      FROM conversations_fts
      WHERE conversations_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;

    const params: any[] = [sanitizedQuery, limit];

    if (guildId) {
      sql = `
        SELECT
          conversation_key,
          messages_json,
          snippet(conversations_fts, 1, '>>>', '<<<', '...', 32) as snippet,
          rank
        FROM conversations_fts
        WHERE conversations_fts MATCH ? AND conversation_key LIKE ?
        ORDER BY rank
        LIMIT ?
      `;
      params.splice(1, 0, `${guildId}:%`);
    }

    if (userId) {
      sql = `
        SELECT
          conversation_key,
          messages_json,
          snippet(conversations_fts, 1, '>>>', '<<<', '...', 32) as snippet,
          rank
        FROM conversations_fts
        WHERE conversations_fts MATCH ? AND conversation_key LIKE ?
        ORDER BY rank
        LIMIT ?
      `;
      params.splice(1, 0, `${userId}:%`);
    }

    const rows = db.prepare(sql).all(...params) as any[];

    return rows
      .map((row) => {
        try {
          const messages = JSON.parse(row.messages_json) as ChatMessage[];
          return {
            conversationKey: row.conversation_key,
            messages,
            snippet: row.snippet || "",
            rank: row.rank || 0,
          };
        } catch {
          return null;
        }
      })
      .filter((r): r is SearchResult => r !== null);
  }, [], `searchConversations(${query})`);
}

export function rebuildConversationFts(): void {
  safeDbOperation(() => {
    const db = getDatabase();
    db.exec("INSERT INTO conversations_fts(conversations_fts) VALUES('rebuild')");
  }, undefined, "rebuildConversationFts");
}
