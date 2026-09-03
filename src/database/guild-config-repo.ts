import { getDatabase, safeDbOperation, transaction } from "./database";
import { GuildConfigSchema, validateSchema } from "./schemas";
import { LRUCache } from "lru-cache";
import type { GuildConfig } from "../core/guild-config";
import { scanForSecrets } from "../security/redact";

const configCache = new LRUCache<string, GuildConfig>({
  max: 500,
  ttl: 1000 * 60 * 5,
});

/**
 * Default guild config for new guilds.
 */
function defaultConfig(guildId: string): GuildConfig {
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
      floodWindowMs: 5000,
    },
    moderation: {
      enabled: true,
      defaultTimeoutMinutes: 5,
      maxWarnBeforeAction: 3,
      autoBanOnMaxWarn: false,
    },
    tickets: {
      enabled: false,
      types: ["support", "reports", "appeals"],
    },
    community: {
      xpEnabled: true,
      levelsEnabled: true,
      reactionRoles: true,
      welcomeEnabled: true,
      goodbyeEnabled: true,
      onboardingEnabled: false,
    },
    automation: {
      enabled: false,
    },
    personality: {
      name: "AshenAI",
      tone: "friendly",
      customInstructions: "",
    },
    memory: {
      enabled: true,
      maxMessages: 20,
    },
    usage: {
      dailyLimit: 100,
      monthlyLimit: 2000,
      rateLimitPerMinute: 10,
      burstLimit: 3,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Load guild config from SQLite.
 */
export function loadGuildConfigDB(guildId: string): GuildConfig {
  const cached = configCache.get(guildId);
  if (cached) return cached;

  return safeDbOperation(() => {
    const db = getDatabase();
    const row = db.prepare("SELECT config_json FROM guild_configs WHERE guild_id = ?").get(guildId) as any;
    if (!row) return defaultConfig(guildId);
    const parsed = JSON.parse(row.config_json);
    const validated = validateSchema(GuildConfigSchema, parsed);
    const result = validated ?? { ...defaultConfig(guildId), ...parsed, guildId };
    configCache.set(guildId, result);
    return result;
  }, defaultConfig(guildId), `loadGuildConfig(${guildId})`);
}

/**
 * Save guild config to SQLite.
 */
export function saveGuildConfigDB(config: GuildConfig): void {
  safeDbOperation(() => {
    const configJson = JSON.stringify(config);
    const secrets = scanForSecrets(configJson);
    if (secrets.length > 0) {
      throw new Error(`Config contains secrets: ${secrets.join(", ")}`);
    }

    const db = getDatabase();
    config.updatedAt = Date.now();
    db.prepare(`
      INSERT INTO guild_configs (guild_id, config_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at
    `).run(config.guildId, configJson, config.updatedAt);
    configCache.set(config.guildId, config);
  }, undefined, `saveGuildConfig(${config.guildId})`);
}

/**
 * Save guild config with CAS (compare-and-swap) precondition.
 * Only saves if the current updatedAt matches expectedUpdatedAt.
 * Returns true if saved, false if precondition failed.
 */
export function saveGuildConfigCAS(
  config: GuildConfig,
  expectedUpdatedAt: number,
): boolean {
  return safeDbOperation(() => {
    const configJson = JSON.stringify(config);
    const secrets = scanForSecrets(configJson);
    if (secrets.length > 0) {
      throw new Error(`Config contains secrets: ${secrets.join(", ")}`);
    }

    const db = getDatabase();
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

/**
 * Check if guild config exists in SQLite.
 */
export function guildConfigExistsDB(guildId: string): boolean {
  return safeDbOperation(() => {
    const db = getDatabase();
    const row = db.prepare("SELECT 1 FROM guild_configs WHERE guild_id = ?").get(guildId);
    return !!row;
  }, false, `guildConfigExists(${guildId})`);
}

/**
 * Get all guild configs from SQLite.
 */
export function getAllGuildConfigsDB(): GuildConfig[] {
  return safeDbOperation(() => {
    const db = getDatabase();
    const rows = db.prepare("SELECT guild_id, config_json FROM guild_configs").all() as any[];
    return rows.map((row) => {
      const parsed = JSON.parse(row.config_json);
      const validated = validateSchema(GuildConfigSchema, parsed);
      return validated ?? { ...defaultConfig(row.guild_id), ...parsed, guildId: row.guild_id };
    });
  }, [], "getAllGuildConfigs");
}

/**
 * Delete guild config from SQLite.
 */
export function deleteGuildConfigDB(guildId: string): boolean {
  return safeDbOperation(() => {
    const db = getDatabase();
    const result = db.prepare("DELETE FROM guild_configs WHERE guild_id = ?").run(guildId);
    configCache.delete(guildId);
    return result.changes > 0;
  }, false, `deleteGuildConfig(${guildId})`);
}

export function invalidateGuildConfigCache(guildId?: string): void {
  if (guildId) {
    configCache.delete(guildId);
  } else {
    configCache.clear();
  }
}
