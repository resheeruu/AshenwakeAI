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
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var database_exports = {};
__export(database_exports, {
  cleanupExpiredCache: () => import_response_cache.cleanupExpiredCache,
  cleanupOldTraces: () => import_traces.cleanupOldTraces,
  clearAllCache: () => import_response_cache.clearAllCache,
  clearCacheForModel: () => import_response_cache.clearCacheForModel,
  closeDatabase: () => import_database.closeDatabase,
  endSpan: () => import_traces.endSpan,
  endSpanError: () => import_traces.endSpanError,
  enforceCacheLimit: () => import_response_cache.enforceCacheLimit,
  getCacheStats: () => import_response_cache.getCacheStats,
  getCachedResponse: () => import_response_cache.getCachedResponse,
  getDatabase: () => import_database.getDatabase,
  getDatabaseStats: () => import_database.getDatabaseStats,
  getRecentTraces: () => import_traces.getRecentTraces,
  getTrace: () => import_traces.getTrace,
  getTraceStats: () => import_traces.getTraceStats,
  invalidateCacheEntry: () => import_response_cache.invalidateCacheEntry,
  rebuildConversationFts: () => import_conversation_search.rebuildConversationFts,
  safeDbOperation: () => import_database.safeDbOperation,
  searchConversations: () => import_conversation_search.searchConversations,
  setCachedResponse: () => import_response_cache.setCachedResponse,
  startSpan: () => import_traces.startSpan,
  startTrace: () => import_traces.startTrace,
  traceSpan: () => import_traces.traceSpan,
  transaction: () => import_database.transaction,
  validateSchema: () => import_schemas.validateSchema,
  validateWithFallback: () => import_schemas.validateWithFallback
});
module.exports = __toCommonJS(database_exports);
var import_database = require("./database");
var import_schemas = require("./schemas");
__reExport(database_exports, require("./guild-config-repo"), module.exports);
__reExport(database_exports, require("./guild-ai-config-repo"), module.exports);
__reExport(database_exports, require("./audit-repo"), module.exports);
__reExport(database_exports, require("./usage-stats-repo"), module.exports);
__reExport(database_exports, require("./memory-repo"), module.exports);
__reExport(database_exports, require("./builder-session-repo"), module.exports);
__reExport(database_exports, require("./ai-usage-repo"), module.exports);
var import_conversation_search = require("./conversation-search");
var import_response_cache = require("../ai/response-cache");
var import_traces = require("../ai/traces");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanupExpiredCache,
  cleanupOldTraces,
  clearAllCache,
  clearCacheForModel,
  closeDatabase,
  endSpan,
  endSpanError,
  enforceCacheLimit,
  getCacheStats,
  getCachedResponse,
  getDatabase,
  getDatabaseStats,
  getRecentTraces,
  getTrace,
  getTraceStats,
  invalidateCacheEntry,
  rebuildConversationFts,
  safeDbOperation,
  searchConversations,
  setCachedResponse,
  startSpan,
  startTrace,
  traceSpan,
  transaction,
  validateSchema,
  validateWithFallback,
  ...require("./guild-config-repo"),
  ...require("./guild-ai-config-repo"),
  ...require("./audit-repo"),
  ...require("./usage-stats-repo"),
  ...require("./memory-repo"),
  ...require("./builder-session-repo"),
  ...require("./ai-usage-repo")
});
