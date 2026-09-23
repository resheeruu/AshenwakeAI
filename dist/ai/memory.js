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
var memory_exports = {};
__export(memory_exports, {
  ConversationMemory: () => ConversationMemory
});
module.exports = __toCommonJS(memory_exports);
var import_env = require("../config/env");
var import_logger = require("../logger");
var import_database = require("../database");
var import_tokens = require("./tokens");
var import_memory_decay = require("./memory-decay");
var import_context_compression = require("./context-compression");
class ConversationMemory {
  conversations = /* @__PURE__ */ new Map();
  lastActivity = /* @__PURE__ */ new Map();
  constructor() {
    this.load();
  }
  makeKey(userId, channelId) {
    return channelId ? `${userId}:${channelId}` : userId;
  }
  idleTimeoutMs() {
    return import_env.config.ai.memoryIdleMinutes * 60 * 1e3;
  }
  isExpired(key) {
    const last = this.lastActivity.get(key);
    if (!last) {
      return false;
    }
    return Date.now() - last >= this.idleTimeoutMs();
  }
  cleanupExpired() {
    const deleted = (0, import_database.deleteExpiredConversationsDB)(this.idleTimeoutMs());
    if (deleted > 0) {
      import_logger.logger.debug(`Expired ${deleted} inactive conversations from SQLite`);
    }
    const now = Date.now();
    for (const [key, last] of this.lastActivity) {
      if (now - last >= this.idleTimeoutMs()) {
        this.conversations.delete(key);
        this.lastActivity.delete(key);
      }
    }
  }
  load() {
    const stored = (0, import_database.loadConversationsDB)();
    const now = Date.now();
    const timeout = this.idleTimeoutMs();
    for (const [key, value] of stored) {
      if (now - value.updatedAt >= timeout) continue;
      this.conversations.set(key, value.messages);
      this.lastActivity.set(key, value.updatedAt);
    }
    import_logger.logger.info(
      `Conversation memory loaded: ${this.conversations.size} conversation(s).`
    );
  }
  save() {
    for (const [key, messages] of this.conversations) {
      const updatedAt = this.lastActivity.get(key) ?? Date.now();
      (0, import_database.saveConversationDB)(key, messages, updatedAt);
    }
  }
  pendingDeletes = /* @__PURE__ */ new Set();
  get(userId, channelId, tokenBudget) {
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
    let history = [
      ...this.conversations.get(key) ?? []
    ];
    history = (0, import_context_compression.autoCompress)(history, import_env.config.ai.maxContextMessages * 200);
    const updated = history.map((m) => {
      if (m.decay && m.role !== "system") {
        return { ...m, decay: (0, import_memory_decay.updateOnRetrieval)(m.decay) };
      }
      return m;
    });
    this.conversations.set(key, updated);
    if (tokenBudget && tokenBudget > 0) {
      return (0, import_memory_decay.selectMessagesWithDecay)(
        updated,
        tokenBudget,
        import_tokens.countChatTokens
      );
    }
    return updated;
  }
  getWithTokenCount(userId, channelId) {
    const messages = this.get(userId, channelId);
    return {
      messages,
      tokenCount: (0, import_tokens.countChatTokens)(messages)
    };
  }
  add(userId, message, channelId) {
    const key = this.makeKey(
      userId,
      channelId
    );
    const history = this.conversations.get(key) ?? [];
    const decayMessage = {
      ...message,
      decay: (0, import_memory_decay.createDecayMeta)(message)
    };
    history.push(decayMessage);
    const maxMessages = Math.max(
      2,
      import_env.config.ai.maxContextMessages
    );
    if (history.length > maxMessages) {
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
  addBatch(userId, message, channelId) {
    const key = this.makeKey(
      userId,
      channelId
    );
    const history = this.conversations.get(key) ?? [];
    const decayMessage = {
      ...message,
      decay: (0, import_memory_decay.createDecayMeta)(message)
    };
    history.push(decayMessage);
    const maxMessages = Math.max(
      2,
      import_env.config.ai.maxContextMessages
    );
    if (history.length > maxMessages) {
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
  flushBatch() {
    for (const key of this.pendingDeletes) {
      (0, import_database.deleteConversationDB)(key);
    }
    this.pendingDeletes.clear();
    this.save();
  }
  reset(userId, channelId) {
    const key = this.makeKey(
      userId,
      channelId
    );
    this.conversations.delete(key);
    this.lastActivity.delete(key);
    (0, import_database.deleteConversationDB)(key);
    import_logger.logger.debug(
      `Conversation reset: ${key}`
    );
  }
  /**
   * Reset all conversations for a user across all channels.
   * Used by memory-controls for guild-level operations.
   */
  resetAllForUser(userId) {
    const prefix = `${userId}:`;
    const userIdOnly = userId;
    for (const key of this.conversations.keys()) {
      if (key === userIdOnly || key.startsWith(prefix)) {
        this.conversations.delete(key);
        this.lastActivity.delete(key);
        (0, import_database.deleteConversationDB)(key);
      }
    }
    import_logger.logger.debug(
      `All conversations reset for user ${userId}`
    );
  }
  clear() {
    this.conversations.clear();
    this.lastActivity.clear();
    (0, import_database.clearConversationsDB)();
  }
  size() {
    this.cleanupExpired();
    return this.conversations.size;
  }
  messageCount() {
    this.cleanupExpired();
    let total = 0;
    for (const history of this.conversations.values()) {
      total += history.length;
    }
    return total;
  }
  stats() {
    this.cleanupExpired();
    return {
      conversations: this.size(),
      messages: this.messageCount(),
      persistent: true
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConversationMemory
});
