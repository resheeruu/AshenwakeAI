import { ChatMessage } from "./types";
import { config } from "../config/env";
import { logger } from "../logger";
import { loadConversationsDB, saveConversationDB, deleteConversationDB, clearConversationsDB, deleteExpiredConversationsDB } from "../database";

export class ConversationMemory {
  private readonly conversations =
    new Map<string, ChatMessage[]>();

  private readonly lastActivity =
    new Map<string, number>();

  constructor() {
    this.load();
  }

  private makeKey(
    userId: string,
    channelId?: string
  ): string {
    return channelId
      ? `${userId}:${channelId}`
      : userId;
  }

  private idleTimeoutMs(): number {
    return (
      config.ai.memoryIdleMinutes * 60 * 1000
    );
  }

  private isExpired(key: string): boolean {
    const last = this.lastActivity.get(key);

    if (!last) {
      return false;
    }

    return (
      Date.now() - last >= this.idleTimeoutMs()
    );
  }

  private cleanupExpired(): void {
    const deleted = deleteExpiredConversationsDB(this.idleTimeoutMs());
    if (deleted > 0) {
      logger.debug(`🧹 Expired ${deleted} inactive conversations from SQLite`);
    }

    const now = Date.now();
    for (const [key, last] of this.lastActivity) {
      if (now - last >= this.idleTimeoutMs()) {
        this.conversations.delete(key);
        this.lastActivity.delete(key);
      }
    }
  }

  private load(): void {
    const stored = loadConversationsDB();
    const now = Date.now();
    const timeout = this.idleTimeoutMs();

    for (const [key, value] of stored) {
      if (now - value.updatedAt >= timeout) continue;
      this.conversations.set(key, value.messages);
      this.lastActivity.set(key, value.updatedAt);
    }

    logger.info(
      `💾 Conversation memory loaded: ${this.conversations.size} conversation(s).`
    );
  }

  private save(): void {
    for (const [key, messages] of this.conversations) {
      const updatedAt = this.lastActivity.get(key) ?? Date.now();
      saveConversationDB(key, messages, updatedAt);
    }
  }

  private pendingDeletes: Set<string> = new Set();

  get(
    userId: string,
    channelId?: string
  ): ChatMessage[] {
    const key = this.makeKey(
      userId,
      channelId
    );

    if (this.isExpired(key)) {
      this.conversations.delete(key);
      this.lastActivity.delete(key);
      this.pendingDeletes.add(key);

      return [];
    }

    return [
      ...(this.conversations.get(key) ?? []),
    ];
  }

  add(
    userId: string,
    message: ChatMessage,
    channelId?: string
  ): void {
    const key = this.makeKey(
      userId,
      channelId
    );

    const history =
      this.conversations.get(key) ?? [];

    history.push(message);

    const maxMessages = Math.max(
      2,
      config.ai.maxContextMessages
    );

    if (
      history.length > maxMessages
    ) {
      history.splice(
        0,
        history.length - maxMessages
      );
    }

    this.conversations.set(
      key,
      history
    );

    this.lastActivity.set(
      key,
      Date.now()
    );

    this.cleanupExpired();
    this.save();
  }

  /**
   * Batch-mode: accumulate messages in memory without writing to disk.
   * Call flushBatch() at the end of the request to write once.
   */
  addBatch(
    userId: string,
    message: ChatMessage,
    channelId?: string
  ): void {
    const key = this.makeKey(
      userId,
      channelId
    );

    const history =
      this.conversations.get(key) ?? [];

    history.push(message);

    const maxMessages = Math.max(
      2,
      config.ai.maxContextMessages
    );

    if (
      history.length > maxMessages
    ) {
      history.splice(
        0,
        history.length - maxMessages
      );
    }

    this.conversations.set(
      key,
      history
    );

    this.lastActivity.set(
      key,
      Date.now()
    );

    this.cleanupExpired();
  }

  /**
   * Flush all batched writes to disk in a single write.
   * Call this once at the end of a request after all addBatch() calls.
   */
  flushBatch(): void {
    for (const key of this.pendingDeletes) {
      deleteConversationDB(key);
    }
    this.pendingDeletes.clear();
    this.save();
  }

  reset(
    userId: string,
    channelId?: string
  ): void {
    const key = this.makeKey(
      userId,
      channelId
    );

    this.conversations.delete(key);
    this.lastActivity.delete(key);

    deleteConversationDB(key);

    logger.debug(
      `🧹 Conversation reset: ${key}`
    );
  }

  clear(): void {
    this.conversations.clear();
    this.lastActivity.clear();

    clearConversationsDB();
  }

  size(): number {
    this.cleanupExpired();

    return this.conversations.size;
  }

  messageCount(): number {
    this.cleanupExpired();

    let total = 0;

    for (const history of
      this.conversations.values()) {
      total += history.length;
    }

    return total;
  }

  stats(): {
    conversations: number;
    messages: number;
    persistent: boolean;
  } {
    this.cleanupExpired();

    return {
      conversations:
        this.size(),
      messages:
        this.messageCount(),
      persistent: true,
    };
  }
}
