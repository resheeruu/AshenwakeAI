import { logger } from "../../../logger";
import {
  loadGuildAIConfig,
  saveGuildAIConfig,
} from "../channel-scope";

/* ================================================================
 * GUILD CHANNEL PROTECTION SYSTEM
 *
 * Per-guild protection for channels and categories.
 * Protected resources cannot be deleted, renamed, moved, or have
 * their permissions modified through AI management tools.
 *
 * Protection is stored in the GuildAIConfig and persists across
 * restarts. Guild isolation is mandatory.
 * ================================================================ */

/* ================================================================
 * CHECK PROTECTION STATUS
 * ================================================================ */

export function isProtectedChannel(guildId: string, channelId: string): boolean {
  const config = loadGuildAIConfig(guildId);
  return config.protectedChannels.includes(channelId);
}

export function isProtectedCategory(guildId: string, categoryId: string): boolean {
  const config = loadGuildAIConfig(guildId);
  return config.protectedCategories.includes(categoryId);
}

export function isProtectedResource(guildId: string, channelIdOrCategoryId: string): boolean {
  return isProtectedChannel(guildId, channelIdOrCategoryId) ||
    isProtectedCategory(guildId, channelIdOrCategoryId);
}

/* ================================================================
 * CENTRALIZED CHANNEL PROTECTION CHECK
 *
 * A channel is protected if:
 *   1. It is directly in the protectedChannels list, OR
 *   2. Its parent category (by parentId) is in the protectedCategories list.
 *
 * parentId is optional. If not provided, only direct protection is checked.
 * Tools must pass parentId when available to enforce inheritance.
 * ================================================================ */

export function isChannelProtected(
  guildId: string,
  channelId: string,
  parentId?: string | null,
): boolean {
  if (isProtectedChannel(guildId, channelId)) return true;
  if (parentId && isProtectedCategory(guildId, parentId)) return true;
  return false;
}

/* ================================================================
 * PROTECT / UNPROTECT
 * ================================================================ */

export function protectChannel(guildId: string, channelId: string): boolean {
  const config = loadGuildAIConfig(guildId);
  if (config.protectedChannels.includes(channelId)) return false;
  config.protectedChannels.push(channelId);
  saveGuildAIConfig(config);
  logger.info(`Channel ${channelId} protected in guild ${guildId}`);
  return true;
}

export function unprotectChannel(guildId: string, channelId: string): boolean {
  const config = loadGuildAIConfig(guildId);
  const idx = config.protectedChannels.indexOf(channelId);
  if (idx === -1) return false;
  config.protectedChannels.splice(idx, 1);
  saveGuildAIConfig(config);
  logger.info(`Channel ${channelId} unprotected in guild ${guildId}`);
  return true;
}

export function protectCategory(guildId: string, categoryId: string): boolean {
  const config = loadGuildAIConfig(guildId);
  if (config.protectedCategories.includes(categoryId)) return false;
  config.protectedCategories.push(categoryId);
  saveGuildAIConfig(config);
  logger.info(`Category ${categoryId} protected in guild ${guildId}`);
  return true;
}

export function unprotectCategory(guildId: string, categoryId: string): boolean {
  const config = loadGuildAIConfig(guildId);
  const idx = config.protectedCategories.indexOf(categoryId);
  if (idx === -1) return false;
  config.protectedCategories.splice(idx, 1);
  saveGuildAIConfig(config);
  logger.info(`Category ${categoryId} unprotected in guild ${guildId}`);
  return true;
}

/* ================================================================
 * LIST PROTECTED RESOURCES
 * ================================================================ */

export interface ProtectedResources {
  channels: string[];
  categories: string[];
}

export function getProtectedResources(guildId: string): ProtectedResources {
  const config = loadGuildAIConfig(guildId);
  return {
    channels: [...config.protectedChannels],
    categories: [...config.protectedCategories],
  };
}
