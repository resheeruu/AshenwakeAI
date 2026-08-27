import fs from "fs";
import path from "path";
import { logger } from "../../logger";
import type { ChannelScope } from "./types";

/* ================================================================
 * GUILD AI CONFIGURATION
 *
 * Stores per-guild AI management settings including which channels
 * are allowed for AI operations and what scopes they have.
 * ================================================================ */

export interface GuildAIConfig {
  guildId: string;
  enabled: boolean;
  managementEnabled: boolean;

  /** channelId -> scopes[] (e.g. { "123": ["AI_CHAT", "AI_MANAGEMENT"] }) */
  channelScopes: Record<string, ChannelScope[]>;

  /** Optional: restrict management to specific Discord role IDs */
  managementRoleIds: string[];

  /** Optional: restrict chat to specific Discord role IDs */
  chatRoleIds: string[];

  /** Protected channel IDs — cannot be deleted, renamed, moved, or have permissions modified via AI */
  protectedChannels: string[];

  /** Protected category IDs — cannot be deleted or have permissions modified via AI */
  protectedCategories: string[];

  /** Config version for future migration */
  version: number;

  createdAt: number;
  updatedAt: number;
}

/* ================================================================
 * DEFAULTS
 * ================================================================ */

const CURRENT_VERSION = 1;

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
    version: CURRENT_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/* ================================================================
 * PERSISTENCE
 * ================================================================ */

const DATA_DIR = path.join(process.cwd(), "data");
const AI_CONFIGS_DIR = path.join(DATA_DIR, "ai-guilds");

function getConfigPath(guildId: string): string {
  return path.join(AI_CONFIGS_DIR, `${guildId}.json`);
}

export function loadGuildAIConfig(guildId: string): GuildAIConfig {
  const filePath = getConfigPath(guildId);
  try {
    if (!fs.existsSync(filePath)) return defaultGuildAIConfig(guildId);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<GuildAIConfig>;
    return { ...defaultGuildAIConfig(guildId), ...parsed, guildId };
  } catch {
    return defaultGuildAIConfig(guildId);
  }
}

export function saveGuildAIConfig(config: GuildAIConfig): void {
  try {
    fs.mkdirSync(AI_CONFIGS_DIR, { recursive: true });
    config.updatedAt = Date.now();
    const filePath = getConfigPath(config.guildId);
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    logger.warn(
      `Could not save AI guild config for ${config.guildId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function getAllGuildAIConfigs(): GuildAIConfig[] {
  try {
    fs.mkdirSync(AI_CONFIGS_DIR, { recursive: true });
    const files = fs.readdirSync(AI_CONFIGS_DIR).filter((f) => f.endsWith(".json"));
    return files.map((f) => {
      const guildId = f.replace(".json", "");
      return loadGuildAIConfig(guildId);
    });
  } catch {
    return [];
  }
}

export function deleteGuildAIConfig(guildId: string): boolean {
  try {
    const filePath = getConfigPath(guildId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/* ================================================================
 * CHANNEL SCOPE MANAGEMENT
 * ================================================================ */

export function setChannelScope(
  config: GuildAIConfig,
  channelId: string,
  scopes: ChannelScope[],
): void {
  config.channelScopes[channelId] = [...new Set(scopes)];
  config.updatedAt = Date.now();
}

export function removeChannelScope(
  config: GuildAIConfig,
  channelId: string,
): void {
  delete config.channelScopes[channelId];
  config.updatedAt = Date.now();
}

export function addChannelScope(
  config: GuildAIConfig,
  channelId: string,
  scope: ChannelScope,
): void {
  const existing = config.channelScopes[channelId] || [];
  if (!existing.includes(scope)) {
    existing.push(scope);
    config.channelScopes[channelId] = existing;
    config.updatedAt = Date.now();
  }
}

export function removeSingleChannelScope(
  config: GuildAIConfig,
  channelId: string,
  scope: ChannelScope,
): void {
  const existing = config.channelScopes[channelId];
  if (!existing) return;
  const filtered = existing.filter((s) => s !== scope);
  if (filtered.length === 0) {
    delete config.channelScopes[channelId];
  } else {
    config.channelScopes[channelId] = filtered;
  }
  config.updatedAt = Date.now();
}

export function getChannelScopes(
  config: GuildAIConfig,
  channelId: string,
): ChannelScope[] {
  return config.channelScopes[channelId] || [];
}

export function isChannelAllowed(
  config: GuildAIConfig,
  channelId: string,
  requiredScope: ChannelScope,
): boolean {
  if (!config.enabled) return false;
  const scopes = config.channelScopes[channelId] || [];
  return scopes.includes(requiredScope);
}

/* ================================================================
 * ROLE MANAGEMENT
 * ================================================================ */

export function addManagementRole(
  config: GuildAIConfig,
  roleId: string,
): void {
  if (!config.managementRoleIds.includes(roleId)) {
    config.managementRoleIds.push(roleId);
    config.updatedAt = Date.now();
  }
}

export function removeManagementRole(
  config: GuildAIConfig,
  roleId: string,
): void {
  config.managementRoleIds = config.managementRoleIds.filter((id) => id !== roleId);
  config.updatedAt = Date.now();
}

export function addChatRole(
  config: GuildAIConfig,
  roleId: string,
): void {
  if (!config.chatRoleIds.includes(roleId)) {
    config.chatRoleIds.push(roleId);
    config.updatedAt = Date.now();
  }
}

export function removeChatRole(
  config: GuildAIConfig,
  roleId: string,
): void {
  config.chatRoleIds = config.chatRoleIds.filter((id) => id !== roleId);
  config.updatedAt = Date.now();
}

/* ================================================================
 * GUILD ISOLATION CHECK
 * ================================================================ */

export function assertGuildIsolation(
  configGuildId: string,
  requestGuildId: string,
): boolean {
  return configGuildId === requestGuildId;
}
