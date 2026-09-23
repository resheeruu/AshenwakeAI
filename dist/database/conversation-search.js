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
var conversation_search_exports = {};
__export(conversation_search_exports, {
  rebuildConversationFts: () => rebuildConversationFts,
  searchConversations: () => searchConversations
});
module.exports = __toCommonJS(conversation_search_exports);
var import_database = require("./database");
function searchConversations(query, options = {}) {
  const { limit = 10, guildId, userId } = options;
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const sanitizedQuery = query.replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 0).join(" ");
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
    const params = [sanitizedQuery, limit];
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
    const rows = db.prepare(sql).all(...params);
    return rows.map((row) => {
      try {
        const messages = JSON.parse(row.messages_json);
        return {
          conversationKey: row.conversation_key,
          messages,
          snippet: row.snippet || "",
          rank: row.rank || 0
        };
      } catch {
        return null;
      }
    }).filter((r) => r !== null);
  }, [], `searchConversations(${query})`);
}
function rebuildConversationFts() {
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    db.exec("INSERT INTO conversations_fts(conversations_fts) VALUES('rebuild')");
  }, void 0, "rebuildConversationFts");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  rebuildConversationFts,
  searchConversations
});
