import fs from "fs";
import path from "path";

import { ChatMessage } from "./types";
import { config } from "../config/env";
import { logger } from "../logger";

interface StoredConversation {
  messages: ChatMessage[];
  updatedAt: number;
}

type StoredMemory = Record<string, StoredConversation>;

const DATA_DIR = path.join(
  process.cwd(),
  "data"
);

const MEMORY_FILE = path.join(
  DATA_DIR,
  "conversation-memory.json"
);

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
    const now = Date.now();

    for (const [key, last] of this.lastActivity) {
      if (
        now - last >= this.idleTimeoutMs()
      ) {
        this.conversations.delete(key);
        this.lastActivity.delete(key);

        logger.debug(
          `🧹 Expired inactive conversation: ${key}`
        );
      }
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(MEMORY_FILE)) {
        return;
      }

      const raw = fs.readFileSync(
        MEMORY_FILE,
        "utf8"
      );

      const stored =
        JSON.parse(raw) as StoredMemory;

      const now = Date.now();
      const timeout = this.idleTimeoutMs();

      for (const [key, value] of Object.entries(
        stored
      )) {
        if (
          !value ||
          !Array.isArray(value.messages) ||
          typeof value.updatedAt !== "number"
        ) {
          continue;
        }

        if (
          now - value.updatedAt >= timeout
        ) {
          continue;
        }

        this.conversations.set(
          key,
          value.messages
        );

        this.lastActivity.set(
          key,
          value.updatedAt
        );
      }

      logger.info(
        `💾 Conversation memory loaded: ${this.conversations.size} conversation(s).`
      );
    } catch (error) {
      logger.warn(
        "⚠️ Could not load conversation memory:",
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(DATA_DIR, {
        recursive: true,
      });

      const stored: StoredMemory = {};
      const now = Date.now();

      for (const [
        key,
        messages,
      ] of this.conversations) {
        stored[key] = {
          messages,
          updatedAt:
            this.lastActivity.get(key) ??
            now,
        };
      }

      const tmpPath = MEMORY_FILE + ".tmp";
      fs.writeFileSync(
        tmpPath,
        JSON.stringify(
          stored,
          null,
          2
        ),
        "utf8"
      );
      fs.renameSync(tmpPath, MEMORY_FILE);
    } catch (error) {
      logger.warn(
        "⚠️ Could not save conversation memory:",
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  }

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
      this.save();

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

    this.save();

    logger.debug(
      `🧹 Conversation reset: ${key}`
    );
  }

  clear(): void {
    this.conversations.clear();
    this.lastActivity.clear();

    this.save();
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
