import { loadGuildConfigDB, saveGuildConfigDB, guildConfigExistsDB, getAllGuildConfigsDB, deleteGuildConfigDB } from "../database";

export interface GuildConfig {
  guildId: string;
  guildName?: string;
  enabled: boolean;
  assistantChannelId?: string;
  ticketCategoryId?: string;
  logChannelId?: string;
  verificationRoleId?: string;
  welcomeChannelId?: string;
  automod: {
    enabled: boolean;
    antiSpam: boolean;
    antiFlood: boolean;
    mentionSpam: boolean;
    antiCaps: boolean;
    antiInvite: boolean;
    antiLink: boolean;
    antiScam: boolean;
    antiZalgo: boolean;
    raidMode: boolean;
    maxMentions: number;
    maxMessages: number;
    floodWindowMs: number;
  };
  moderation: {
    enabled: boolean;
    defaultTimeoutMinutes: number;
    maxWarnBeforeAction: number;
    autoBanOnMaxWarn: boolean;
  };
  tickets: {
    enabled: boolean;
    types: string[];
  };
  community: {
    xpEnabled: boolean;
    levelsEnabled: boolean;
    reactionRoles: boolean;
    welcomeEnabled: boolean;
    goodbyeEnabled: boolean;
    onboardingEnabled: boolean;
  };
  automation: {
    enabled: boolean;
  };
  personality: {
    name: string;
    tone: string;
    customInstructions: string;
  };
  memory: {
    enabled: boolean;
    maxMessages: number;
  };
  usage: {
    dailyLimit: number;
    monthlyLimit: number;
    rateLimitPerMinute: number;
    burstLimit: number;
  };
  createdAt: number;
  updatedAt: number;
}

export function loadGuildConfig(guildId: string): GuildConfig {
  return loadGuildConfigDB(guildId);
}

export function guildConfigExists(guildId: string): boolean {
  return guildConfigExistsDB(guildId);
}

export function saveGuildConfig(config: GuildConfig): void {
  saveGuildConfigDB(config);
}

export function getAllGuildConfigs(): GuildConfig[] {
  return getAllGuildConfigsDB();
}

export function deleteGuildConfig(guildId: string): boolean {
  return deleteGuildConfigDB(guildId);
}
