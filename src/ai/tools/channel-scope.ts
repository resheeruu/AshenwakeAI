import { loadGuildAIConfigDB, saveGuildAIConfigDB, guildAIConfigExistsDB, getAllGuildAIConfigsDB, deleteGuildAIConfigDB, getTrustedUsersDB } from "../../database";
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

  /** Trusted user IDs — can use server-management features without being admin */
  trustedUserIds: string[];

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
    trustedUserIds: [],
    version: CURRENT_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/* ================================================================
 * PERSISTENCE
 * ================================================================ */

export function loadGuildAIConfig(guildId: string): GuildAIConfig {
  return loadGuildAIConfigDB(guildId);
}

export function saveGuildAIConfig(config: GuildAIConfig): void {
  saveGuildAIConfigDB(config);
}

export function getAllGuildAIConfigs(): GuildAIConfig[] {
  return getAllGuildAIConfigsDB();
}

export function deleteGuildAIConfig(guildId: string): boolean {
  return deleteGuildAIConfigDB(guildId);
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

/* ================================================================
 * TRUSTED USER MANAGEMENT
 * ================================================================ */

export function addTrustedUser(
  config: GuildAIConfig,
  userId: string,
): boolean {
  if (config.trustedUserIds.includes(userId)) {
    return false; // Already trusted
  }
  config.trustedUserIds.push(userId);
  config.updatedAt = Date.now();
  return true;
}

export function removeTrustedUser(
  config: GuildAIConfig,
  userId: string,
): boolean {
  const before = config.trustedUserIds.length;
  config.trustedUserIds = config.trustedUserIds.filter((id) => id !== userId);
  config.updatedAt = Date.now();
  return config.trustedUserIds.length < before;
}

export function isTrustedUser(
  config: GuildAIConfig,
  userId: string,
): boolean {
  return config.trustedUserIds.includes(userId);
}

export function getTrustedUsers(
  config: GuildAIConfig,
): string[] {
  return [...config.trustedUserIds];
}
