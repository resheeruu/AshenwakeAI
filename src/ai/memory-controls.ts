import { ConversationMemory } from "./memory";
import { GuildKnowledge } from "./knowledge";
import { logger } from "../logger";

export interface MemoryControls {
  disableMemory(userId: string, guildId: string): void;
  enableMemory(userId: string, guildId: string): void;
  isMemoryDisabled(userId: string, guildId: string): boolean;
  deleteUserData(userId: string, guildId: string): void;
  getRetentionInfo(guildId: string): { maxMessages: number; idleMinutes: number };
}

export function createMemoryControls(
  memory: ConversationMemory,
  knowledge: GuildKnowledge
): MemoryControls {
  const disabled = new Map<string, boolean>();

  function key(userId: string, guildId: string): string {
    return `${guildId}:${userId}`;
  }

  return {
    disableMemory(userId, guildId) {
      disabled.set(key(userId, guildId), true);
      memory.reset(userId, guildId);
      logger.debug(`🔇 Memory disabled for user ${userId} in guild ${guildId}`);
    },
    enableMemory(userId, guildId) {
      disabled.delete(key(userId, guildId));
      logger.debug(`🔊 Memory enabled for user ${userId} in guild ${guildId}`);
    },
    isMemoryDisabled(userId, guildId) {
      return disabled.get(key(userId, guildId)) === true;
    },
    deleteUserData(userId, guildId) {
      memory.reset(userId, guildId);
      logger.debug(`🗑️ Deleted memory data for user ${userId} in guild ${guildId}`);
    },
    getRetentionInfo(guildId) {
      return { maxMessages: 20, idleMinutes: 30 };
    },
  };
}
