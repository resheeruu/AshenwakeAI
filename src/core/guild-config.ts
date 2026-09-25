import fastDeepEqual from "fast-deep-equal";
import { loadGuildConfigDB, saveGuildConfigDB, guildConfigExistsDB, getAllGuildConfigsDB, deleteGuildConfigDB, invalidateGuildConfigCache } from "../database";

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
  support?: {
    enabled: boolean;
    channelId?: string;
    categoryId?: string;
    allowGeneralHelp: boolean;
    allowReports: boolean;
    allowAppeals: boolean;
  };
  reports?: {
    enabled: boolean;
    categoryId?: string;
    requireEvidence: boolean;
    aiAnalysisEnabled: boolean;
    autoEscalateHighRisk: boolean;
  };
  appeals?: {
    enabled: boolean;
    categoryId?: string;
    aiAnalysisEnabled: boolean;
  };
  supportAi?: {
    enabled: boolean;
    allowModerationActions: boolean;
    requireConfirmation: boolean;
    allowWebResearch: boolean;
  };
  supportLogging?: {
    enabled: boolean;
    channelId?: string;
    includeModeration: boolean;
    includeTickets: boolean;
    includeReports: boolean;
    includeAppeals: boolean;
    includeAiActions: boolean;
  };
  staff?: {
    roleIds: string[];
  };
  social?: {
    enabled: boolean;
    channels: Record<string, {
      enabled: boolean;
      cooldownMs: number;
      responseProbability: number;
      debateEnabled: boolean;
      contextWindow: number;
      minActivityThreshold: number;
    }>;
    animeActions: boolean;
    /** Auto-clear AFK on a normal message (default true). */
    afkAutoClear?: boolean;
    customReactions: boolean;
    customEmoji: boolean;
    rivalryMode: boolean;
    debateMode: boolean;
    globalCooldownMs: number;
    maxResponsesPerHour: number;
  };
  ai?: {
    enabled: boolean;
    defaultModel?: string;
    defaultProvider?: string;
    responseMode?: string;
    streaming: boolean;
    contextSize: number;
    maxOutput: number;
  };
  routing?: {
    primaryProvider?: string;
    fallbackProvider?: string;
    fallbackOrder: string[];
    timeoutMs: number;
    retryPolicy: string;
    mode: "automatic" | "fastest" | "lowest-cost" | "free-first" | "custom";
  };
  limits?: {
    dailyLimit: number;
    monthlyLimit: number;
    perUserLimit: number;
    perRoleLimit: number;
    perChannelLimit: number;
  };
  models?: Array<{ modelId: string; enabled: boolean; priority: number; isDefault: boolean }>;
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

export function configsEqual(a: GuildConfig, b: GuildConfig): boolean {
  return fastDeepEqual(a, b);
}
