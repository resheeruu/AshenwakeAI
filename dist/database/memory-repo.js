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
var memory_repo_exports = {};
__export(memory_repo_exports, {
  clearConversationsDB: () => clearConversationsDB,
  deleteConversationDB: () => deleteConversationDB,
  deleteExpiredConversationsDB: () => deleteExpiredConversationsDB,
  loadConversationsDB: () => loadConversationsDB,
  saveConversationDB: () => saveConversationDB
});
module.exports = __toCommonJS(memory_repo_exports);
var import_database = require("./database");
var import_schemas = require("./schemas");
function loadConversationsDB() {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare("SELECT conversation_key, messages_json, updated_at FROM conversations").all();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      try {
        const messages = JSON.parse(row.messages_json);
        const validated = messages.map((msg) => (0, import_schemas.validateSchema)(import_schemas.ChatMessageSchema, msg)).filter((msg) => msg !== null);
        if (validated.length > 0) {
          result.set(row.conversation_key, { messages: validated, updatedAt: row.updated_at });
        }
      } catch {
      }
    }
    return result;
  }, /* @__PURE__ */ new Map(), "loadConversations");
}
function saveConversationDB(key, messages, updatedAt) {
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    db.prepare(`
      INSERT INTO conversations (conversation_key, messages_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(conversation_key) DO UPDATE SET messages_json = excluded.messages_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(messages), updatedAt);
  }, void 0, `saveConversation(${key})`);
}
function deleteConversationDB(key) {
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    db.prepare("DELETE FROM conversations WHERE conversation_key = ?").run(key);
  }, void 0, `deleteConversation(${key})`);
}
function clearConversationsDB() {
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    db.prepare("DELETE FROM conversations").run();
  }, void 0, "clearConversations");
}
function deleteExpiredConversationsDB(timeoutMs) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const cutoff = Date.now() - timeoutMs;
    const result = db.prepare("DELETE FROM conversations WHERE updated_at < ?").run(cutoff);
    return result.changes;
  }, 0, "deleteExpiredConversations");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearConversationsDB,
  deleteConversationDB,
  deleteExpiredConversationsDB,
  loadConversationsDB,
  saveConversationDB
});
