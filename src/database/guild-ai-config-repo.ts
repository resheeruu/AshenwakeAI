import { getDatabase, safeDbOperation, transaction } from "./database";
import { GuildAIConfigSchema, validateSchema } from "./schemas";
import type { GuildAIConfig } from "../ai/tools/channel-scope";

const CURRENT_VERSION = 1;

/**
 * Default guild AI config for new guilds.
 */
function defaultGuildAIConfig(guildId: string): GuildAIConfig {
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
    updatedAt: Date.now(),
  };
}

/**
 * Load guild AI config from SQLite.
 */
export function loadGuildAIConfigDB(guildId: string): GuildAIConfig {
  return safeDbOperation(() => {
    const db = getDatabase();
    const row = db.prepare("SELECT config_json FROM guild_ai_configs WHERE guild_id = ?").get(guildId) as any;
    if (!row) return defaultGuildAIConfig(guildId);
    const parsed = JSON.parse(row.config_json);
    const validated = validateSchema(GuildAIConfigSchema, parsed);
    return validated ?? { ...defaultGuildAIConfig(guildId), ...parsed, guildId };
  }, defaultGuildAIConfig(guildId), `loadGuildAIConfig(${guildId})`);
}

/**
 * Save guild AI config to SQLite (including trusted users).
 */
export function saveGuildAIConfigDB(config: GuildAIConfig): void {
  safeDbOperation(() => {
    const db = getDatabase();
    config.updatedAt = Date.now();

    transaction(() => {
      // Save the main config
      db.prepare(`
        INSERT INTO guild_ai_configs (guild_id, config_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at
      `).run(config.guildId, JSON.stringify(config), config.updatedAt);

      // Sync trusted users table
      db.prepare("DELETE FROM trusted_users WHERE guild_id = ?").run(config.guildId);
      const insert = db.prepare("INSERT INTO trusted_users (guild_id, user_id) VALUES (?, ?)");
      for (const userId of config.trustedUserIds) {
        insert.run(config.guildId, userId);
      }
    });
  }, undefined, `saveGuildAIConfig(${config.guildId})`);
}

/**
 * Check if guild AI config exists in SQLite.
 */
export function guildAIConfigExistsDB(guildId: string): boolean {
  return safeDbOperation(() => {
    const db = getDatabase();
    const row = db.prepare("SELECT 1 FROM guild_ai_configs WHERE guild_id = ?").get(guildId);
    return !!row;
  }, false, `guildAIConfigExists(${guildId})`);
}

/**
 * Get all guild AI configs from SQLite.
 */
export function getAllGuildAIConfigsDB(): GuildAIConfig[] {
  return safeDbOperation(() => {
    const db = getDatabase();
    const rows = db.prepare("SELECT guild_id, config_json FROM guild_ai_configs").all() as any[];
    return rows.map((row) => {
      const parsed = JSON.parse(row.config_json);
      const validated = validateSchema(GuildAIConfigSchema, parsed);
      return validated ?? { ...defaultGuildAIConfig(row.guild_id), ...parsed, guildId: row.guild_id };
    });
  }, [], "getAllGuildAIConfigs");
}

/**
 * Delete guild AI config from SQLite.
 */
export function deleteGuildAIConfigDB(guildId: string): boolean {
  return safeDbOperation(() => {
    const db = getDatabase();
    return transaction(() => {
      db.prepare("DELETE FROM trusted_users WHERE guild_id = ?").run(guildId);
      const result = db.prepare("DELETE FROM guild_ai_configs WHERE guild_id = ?").run(guildId);
      return result.changes > 0;
    });
  }, false, `deleteGuildAIConfig(${guildId})`);
}

/**
 * Get trusted users for a guild directly from the normalized table.
 */
export function getTrustedUsersDB(guildId: string): string[] {
  return safeDbOperation(() => {
    const db = getDatabase();
    const rows = db.prepare("SELECT user_id FROM trusted_users WHERE guild_id = ?").all(guildId) as any[];
    return rows.map((r) => r.user_id);
  }, [], `getTrustedUsers(${guildId})`);
}
