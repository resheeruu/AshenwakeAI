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
var guild_config_repo_exports = {};
__export(guild_config_repo_exports, {
  deleteGuildConfigDB: () => deleteGuildConfigDB,
  getAllGuildConfigsDB: () => getAllGuildConfigsDB,
  guildConfigExistsDB: () => guildConfigExistsDB,
  invalidateGuildConfigCache: () => invalidateGuildConfigCache,
  loadGuildConfigDB: () => loadGuildConfigDB,
  saveGuildConfigCAS: () => saveGuildConfigCAS,
  saveGuildConfigDB: () => saveGuildConfigDB
});
module.exports = __toCommonJS(guild_config_repo_exports);
var import_database = require("./database");
var import_schemas = require("./schemas");
var import_lru_cache = require("lru-cache");
var import_redact = require("../security/redact");
const configCache = new import_lru_cache.LRUCache({
  max: 500,
  ttl: 1e3 * 60 * 5
});
function defaultConfig(guildId) {
  return {
    guildId,
    enabled: true,
    automod: {
      enabled: false,
      antiSpam: true,
      antiFlood: true,
      mentionSpam: true,
      antiCaps: false,
      antiInvite: true,
      antiLink: false,
      antiScam: true,
      antiZalgo: false,
      raidMode: false,
      maxMentions: 5,
      maxMessages: 5,
      floodWindowMs: 5e3
    },
    moderation: {
      enabled: true,
      defaultTimeoutMinutes: 5,
      maxWarnBeforeAction: 3,
      autoBanOnMaxWarn: false
    },
    tickets: {
      enabled: false,
      types: ["support", "reports", "appeals"]
    },
    community: {
      xpEnabled: true,
      levelsEnabled: true,
      reactionRoles: true,
      welcomeEnabled: true,
      goodbyeEnabled: true,
      onboardingEnabled: false
    },
    automation: {
      enabled: false
    },
    personality: {
      name: "AshenAI",
      tone: "friendly",
      customInstructions: ""
    },
    memory: {
      enabled: true,
      maxMessages: 20
    },
    usage: {
      dailyLimit: 100,
      monthlyLimit: 2e3,
      rateLimitPerMinute: 10,
      burstLimit: 3
    },
    support: {
      enabled: false,
      allowGeneralHelp: true,
      allowReports: true,
      allowAppeals: true
    },
    reports: {
      enabled: false,
      requireEvidence: false,
      aiAnalysisEnabled: true,
      autoEscalateHighRisk: true
    },
    appeals: {
      enabled: false,
      aiAnalysisEnabled: true
    },
    supportAi: {
      enabled: true,
      allowModerationActions: false,
      requireConfirmation: true,
      allowWebResearch: false
    },
    supportLogging: {
      enabled: false,
      includeModeration: true,
      includeTickets: true,
      includeReports: true,
      includeAppeals: true,
      includeAiActions: true
    },
    staff: {
      roleIds: []
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
function loadGuildConfigDB(guildId) {
  const cached = configCache.get(guildId);
  if (cached) return cached;
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const row = db.prepare("SELECT config_json FROM guild_configs WHERE guild_id = ?").get(guildId);
    if (!row) return defaultConfig(guildId);
    const parsed = JSON.parse(row.config_json);
    const validated = (0, import_schemas.validateSchema)(import_schemas.GuildConfigSchema, parsed);
    const result = validated ?? { ...defaultConfig(guildId), ...parsed, guildId };
    configCache.set(guildId, result);
    return result;
  }, defaultConfig(guildId), `loadGuildConfig(${guildId})`);
}
function saveGuildConfigDB(config) {
  (0, import_database.safeDbOperation)(() => {
    const configJson = JSON.stringify(config);
    const secrets = (0, import_redact.scanForSecrets)(configJson);
    if (secrets.length > 0) {
      throw new Error(`Config contains secrets: ${secrets.join(", ")}`);
    }
    const db = (0, import_database.getDatabase)();
    config.updatedAt = Date.now();
    db.prepare(`
      INSERT INTO guild_configs (guild_id, config_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at
    `).run(config.guildId, configJson, config.updatedAt);
    configCache.set(config.guildId, config);
  }, void 0, `saveGuildConfig(${config.guildId})`);
}
function saveGuildConfigCAS(config, expectedUpdatedAt) {
  return (0, import_database.safeDbOperation)(() => {
    const configJson = JSON.stringify(config);
    const secrets = (0, import_redact.scanForSecrets)(configJson);
    if (secrets.length > 0) {
      throw new Error(`Config contains secrets: ${secrets.join(", ")}`);
    }
    const db = (0, import_database.getDatabase)();
    const result = db.prepare(`
      UPDATE guild_configs
      SET config_json = ?, updated_at = ?
      WHERE guild_id = ? AND updated_at = ?
    `).run(configJson, Date.now(), config.guildId, expectedUpdatedAt);
    if (result.changes === 0) {
      return false;
    }
    config.updatedAt = Date.now();
    configCache.set(config.guildId, config);
    return true;
  }, false, `saveGuildConfigCAS(${config.guildId})`);
}
function guildConfigExistsDB(guildId) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const row = db.prepare("SELECT 1 FROM guild_configs WHERE guild_id = ?").get(guildId);
    return !!row;
  }, false, `guildConfigExists(${guildId})`);
}
function getAllGuildConfigsDB() {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare("SELECT guild_id, config_json FROM guild_configs").all();
    return rows.map((row) => {
      const parsed = JSON.parse(row.config_json);
      const validated = (0, import_schemas.validateSchema)(import_schemas.GuildConfigSchema, parsed);
      return validated ?? { ...defaultConfig(row.guild_id), ...parsed, guildId: row.guild_id };
    });
  }, [], "getAllGuildConfigs");
}
function deleteGuildConfigDB(guildId) {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const result = db.prepare("DELETE FROM guild_configs WHERE guild_id = ?").run(guildId);
    configCache.delete(guildId);
    return result.changes > 0;
  }, false, `deleteGuildConfig(${guildId})`);
}
function invalidateGuildConfigCache(guildId) {
  if (guildId) {
    configCache.delete(guildId);
  } else {
    configCache.clear();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deleteGuildConfigDB,
  getAllGuildConfigsDB,
  guildConfigExistsDB,
  invalidateGuildConfigCache,
  loadGuildConfigDB,
  saveGuildConfigCAS,
  saveGuildConfigDB
});
