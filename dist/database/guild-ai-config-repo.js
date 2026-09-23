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
var guild_ai_config_repo_exports = {};
__export(guild_ai_config_repo_exports, {
  deleteGuildAIConfigDB: () => deleteGuildAIConfigDB,
  getAllGuildAIConfigsDB: () => getAllGuildAIConfigsDB,
  getTrustedUsersDB: () => getTrustedUsersDB,
  guildAIConfigExistsDB: () => guildAIConfigExistsDB,
  loadGuildAIConfigDB: () => loadGuildAIConfigDB,
  saveGuildAIConfigDB: () => saveGuildAIConfigDB
});
module.exports = __toCommonJS(guild_ai_config_repo_exports);
var import_database = require("./database");
var import_schemas = require("./schemas");
var import_redact = require("../security/redact");
var import_logger = require("../logger");
const CURRENT_VERSION = 1;
function defaultGuildAIConfig(guildId) {
  return {
    guildId,
    enabled: true,
    managementEnabled: false,
    channelScopes: {},
    managementRoleIds: [],
    chatRoleIds: [],
    protectedChannels: [],
    protectedCategories: [],
    trustedUserIds: [],
    version: CURRENT_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
function loadGuildAIConfigDB(guildId) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const row = db.prepare("SELECT config_json FROM guild_ai_configs WHERE guild_id = ?").get(guildId);
    if (!row) return defaultGuildAIConfig(guildId);
    const parsed = JSON.parse(row.config_json);
    const validated = (0, import_schemas.validateSchema)(import_schemas.GuildAIConfigSchema, parsed);
    return validated ?? { ...defaultGuildAIConfig(guildId), ...parsed, guildId };
  }, defaultGuildAIConfig(guildId), `loadGuildAIConfig(${guildId})`);
}
function saveGuildAIConfigDB(config) {
  const configJson = JSON.stringify(config);
  const secrets = (0, import_redact.scanForSecrets)(configJson);
  if (secrets.length > 0) {
    import_logger.logger.warn(`\u26A0\uFE0F Guild AI config for ${config.guildId} contains potential secrets: ${secrets.join(", ")} \u2014 blocking save`);
    return;
  }
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    config.updatedAt = Date.now();
    (0, import_database.transaction)(() => {
      db.prepare(`
        INSERT INTO guild_ai_configs (guild_id, config_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at
      `).run(config.guildId, JSON.stringify(config), config.updatedAt);
      db.prepare("DELETE FROM trusted_users WHERE guild_id = ?").run(config.guildId);
      const insert = db.prepare("INSERT INTO trusted_users (guild_id, user_id) VALUES (?, ?)");
      for (const userId of config.trustedUserIds) {
        insert.run(config.guildId, userId);
      }
    });
  }, void 0, `saveGuildAIConfig(${config.guildId})`);
}
function guildAIConfigExistsDB(guildId) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const row = db.prepare("SELECT 1 FROM guild_ai_configs WHERE guild_id = ?").get(guildId);
    return !!row;
  }, false, `guildAIConfigExists(${guildId})`);
}
function getAllGuildAIConfigsDB() {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare("SELECT guild_id, config_json FROM guild_ai_configs").all();
    return rows.map((row) => {
      const parsed = JSON.parse(row.config_json);
      const validated = (0, import_schemas.validateSchema)(import_schemas.GuildAIConfigSchema, parsed);
      return validated ?? { ...defaultGuildAIConfig(row.guild_id), ...parsed, guildId: row.guild_id };
    });
  }, [], "getAllGuildAIConfigs");
}
function deleteGuildAIConfigDB(guildId) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.transaction)(() => {
      db.prepare("DELETE FROM trusted_users WHERE guild_id = ?").run(guildId);
      const result = db.prepare("DELETE FROM guild_ai_configs WHERE guild_id = ?").run(guildId);
      return result.changes > 0;
    });
  }, false, `deleteGuildAIConfig(${guildId})`);
}
function getTrustedUsersDB(guildId) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare("SELECT user_id FROM trusted_users WHERE guild_id = ?").all(guildId);
    return rows.map((r) => r.user_id);
  }, [], `getTrustedUsers(${guildId})`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deleteGuildAIConfigDB,
  getAllGuildAIConfigsDB,
  getTrustedUsersDB,
  guildAIConfigExistsDB,
  loadGuildAIConfigDB,
  saveGuildAIConfigDB
});
