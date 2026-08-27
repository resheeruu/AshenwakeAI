import { readJSON, writeJSON } from "../core/data-store";
import { logger } from "../logger";

export interface XPProfile {
  userId: string;
  guildId: string;
  xp: number;
  level: number;
  totalMessages: number;
  lastXpAt: number;
  streak: number;
  lastActiveDay: string;
}

interface XPStore {
  profiles: Record<string, XPProfile>;
}

const XP_FILE = "xp-data.json";
const XP_PER_MESSAGE = 15;
const XP_COOLDOWN_MS = 60_000;
const BASE_XP = 100;
const XP_MULTIPLIER = 1.5;

function xpForLevel(level: number): number {
  return Math.floor(BASE_XP * Math.pow(XP_MULTIPLIER, level));
}

function profileKey(userId: string, guildId: string): string {
  return `${guildId}:${userId}`;
}

export class XPSystem {
  private store: XPStore;

  constructor() {
    this.store = readJSON<XPStore>(XP_FILE, { profiles: {} });
  }

  private save(): void {
    writeJSON(XP_FILE, this.store);
  }

  addXP(userId: string, guildId: string, amount = XP_PER_MESSAGE): { xp: number; level: number; leveledUp: boolean } {
    const key = profileKey(userId, guildId);
    const now = Date.now();
    let profile = this.store.profiles[key];

    if (!profile) {
      profile = { userId, guildId, xp: 0, level: 0, totalMessages: 0, lastXpAt: 0, streak: 0, lastActiveDay: "" };
      this.store.profiles[key] = profile;
    }

    if (now - profile.lastXpAt < XP_COOLDOWN_MS) {
      return { xp: profile.xp, level: profile.level, leveledUp: false };
    }

    const today = new Date(now).toISOString().slice(0, 10);
    if (profile.lastActiveDay !== today) {
      if (profile.lastActiveDay === new Date(now - 86400000).toISOString().slice(0, 10)) {
        profile.streak++;
      } else {
        profile.streak = 1;
      }
      profile.lastActiveDay = today;
    }

    const streakBonus = Math.min(profile.streak, 7) * 2;
    profile.xp += amount + streakBonus;
    profile.totalMessages++;
    profile.lastXpAt = now;

    let leveledUp = false;
    while (profile.xp >= xpForLevel(profile.level)) {
      profile.xp -= xpForLevel(profile.level);
      profile.level++;
      leveledUp = true;
    }

    this.save();
    return { xp: profile.xp, level: profile.level, leveledUp };
  }

  getProfile(userId: string, guildId: string): XPProfile {
    return this.store.profiles[profileKey(userId, guildId)] || {
      userId, guildId, xp: 0, level: 0, totalMessages: 0, lastXpAt: 0, streak: 0, lastActiveDay: "",
    };
  }

  getLeaderboard(guildId: string, limit = 10): XPProfile[] {
    return Object.values(this.store.profiles)
      .filter((p) => p.guildId === guildId)
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, limit);
  }

  getRank(userId: string, guildId: string): number {
    const sorted = this.getLeaderboard(guildId, 1000);
    const idx = sorted.findIndex((p) => p.userId === userId);
    return idx >= 0 ? idx + 1 : sorted.length + 1;
  }
}
