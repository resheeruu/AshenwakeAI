import fs from "fs";
import path from "path";
import { logger } from "../logger";

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

const DATA_DIR = path.join(process.cwd(), "data");
const GUILD_CONFIGS_DIR = path.join(DATA_DIR, "guilds");

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

function sanitizeGuildId(guildId: string): string {
  return guildId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function getGuildConfigPath(guildId: string): string {
  return path.join(GUILD_CONFIGS_DIR, `${sanitizeGuildId(guildId)}.json`);
}

export function loadGuildConfig(guildId: string): GuildConfig {
  const filePath = getGuildConfigPath(guildId);
  try {
    if (!fs.existsSync(filePath)) return defaultConfig(guildId);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<GuildConfig>;
    return { ...defaultConfig(guildId), ...parsed, guildId };
  } catch {
    return defaultConfig(guildId);
  }
}

export function guildConfigExists(guildId: string): boolean {
  const filePath = getGuildConfigPath(guildId);
  return fs.existsSync(filePath);
}

export function saveGuildConfig(config: GuildConfig): void {
  try {
    fs.mkdirSync(GUILD_CONFIGS_DIR, { recursive: true });
    config.updatedAt = Date.now();
    const filePath = getGuildConfigPath(config.guildId);
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    logger.warn(`⚠️ Could not save guild config for ${config.guildId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function getAllGuildConfigs(): GuildConfig[] {
  try {
    fs.mkdirSync(GUILD_CONFIGS_DIR, { recursive: true });
    const files = fs.readdirSync(GUILD_CONFIGS_DIR).filter((f) => f.endsWith(".json"));
    return files.map((f) => {
      const guildId = f.replace(".json", "");
      return loadGuildConfig(guildId);
    });
  } catch {
    return [];
  }
}

export function deleteGuildConfig(guildId: string): boolean {
  try {
    const filePath = getGuildConfigPath(guildId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
