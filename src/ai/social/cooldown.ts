/* ================================================================
 * AI SOCIAL — Cooldown & Anti-Spam
 *
 * Manages per-channel and global cooldowns, response quotas,
 * and duplicate response prevention for AI Social mode.
 * ================================================================ */

import { logger } from "../../logger";

interface CooldownEntry {
  lastResponseAt: number;
  responseCount: number;
  windowStart: number;
}

interface DuplicateCheck {
  contentHash: string;
  timestamp: number;
}

export class SocialCooldown {
  /** channelId -> cooldown state */
  private channelCooldowns = new Map<string, CooldownEntry>();

  /** Global response tracking (per guild) */
  private globalCooldowns = new Map<string, CooldownEntry>();

  /** Recent response hashes for duplicate prevention */
  private recentResponses = new Map<string, DuplicateCheck[]>();

  /** Per-user cooldown tracking */
  private userCooldowns = new Map<string, number>();

  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Clean up stale entries every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  /**
   * Check if a channel is on cooldown.
   * Returns true if the channel should NOT respond.
   */
  isChannelOnCooldown(channelId: string, cooldownMs: number): boolean {
    const entry = this.channelCooldowns.get(channelId);
    if (!entry) return false;

    const elapsed = Date.now() - entry.lastResponseAt;
    return elapsed < cooldownMs;
  }

  /**
   * Check if the guild global cooldown is active.
   * Returns true if the guild should NOT respond.
   */
  isGlobalOnCooldown(guildId: string, globalCooldownMs: number): boolean {
    const entry = this.globalCooldowns.get(guildId);
    if (!entry) return false;

    const elapsed = Date.now() - entry.lastResponseAt;
    return elapsed < globalCooldownMs;
  }

  /**
   * Check if the guild has exceeded its hourly response limit.
   */
  isHourlyLimitReached(guildId: string, maxPerHour: number): boolean {
    const entry = this.globalCooldowns.get(guildId);
    if (!entry) return false;

    const windowElapsed = Date.now() - entry.windowStart;
    const HOUR_MS = 60 * 60 * 1000;

    // Reset window if expired
    if (windowElapsed > HOUR_MS) {
      entry.responseCount = 0;
      entry.windowStart = Date.now();
      return false;
    }

    return entry.responseCount >= maxPerHour;
  }

  /**
   * Check if a user is on cooldown (prevents rapid-fire from one user).
   */
  isUserOnCooldown(userId: string, cooldownMs: number): boolean {
    const lastResponse = this.userCooldowns.get(userId);
    if (!lastResponse) return false;

    return Date.now() - lastResponse < cooldownMs;
  }

  /**
   * Check if a response is a duplicate of a recent one.
   * Uses simple content similarity (lowercased word overlap).
   */
  isDuplicateResponse(guildId: string, content: string): boolean {
    const hash = this.contentHash(content);
    const recent = this.recentResponses.get(guildId) || [];

    // Check last 10 responses
    const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
    const recentHashes = recent
      .filter((r) => r.timestamp > cutoff)
      .map((r) => r.contentHash);

    return recentHashes.includes(hash);
  }

  /**
   * Record a response for cooldown tracking.
   */
  recordResponse(
    channelId: string,
    guildId: string,
    userId: string,
    content: string,
  ): void {
    const now = Date.now();

    // Channel cooldown
    this.channelCooldowns.set(channelId, {
      lastResponseAt: now,
      responseCount: 0,
      windowStart: now,
    });

    // Global cooldown
    const globalEntry = this.globalCooldowns.get(guildId);
    if (globalEntry) {
      globalEntry.lastResponseAt = now;
      globalEntry.responseCount++;
    } else {
      this.globalCooldowns.set(guildId, {
        lastResponseAt: now,
        responseCount: 1,
        windowStart: now,
      });
    }

    // User cooldown
    this.userCooldowns.set(userId, now);

    // Duplicate tracking
    const hash = this.contentHash(content);
    const recent = this.recentResponses.get(guildId) || [];
    recent.push({ contentHash: hash, timestamp: now });

    // Keep only last 20 entries
    const cutoff = Date.now() - 10 * 60 * 1000;
    const trimmed = recent.filter((r) => r.timestamp > cutoff).slice(-20);
    this.recentResponses.set(guildId, trimmed);
  }

  /**
   * Simple content hash for duplicate detection.
   * Normalizes text and extracts key words.
   */
  private contentHash(content: string): string {
    return content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .sort()
      .join(" ");
  }

  private cleanup(): void {
    const cutoff = Date.now() - 30 * 60 * 1000; // 30 minutes

    for (const [key, entry] of this.channelCooldowns) {
      if (entry.lastResponseAt < cutoff) {
        this.channelCooldowns.delete(key);
      }
    }

    for (const [key, entry] of this.globalCooldowns) {
      if (entry.lastResponseAt < cutoff) {
        this.globalCooldowns.delete(key);
      }
    }

    for (const [key, timestamp] of this.userCooldowns) {
      if (timestamp < cutoff) {
        this.userCooldowns.delete(key);
      }
    }

    for (const [key, entries] of this.recentResponses) {
      const filtered = entries.filter((e) => e.timestamp > cutoff);
      if (filtered.length === 0) {
        this.recentResponses.delete(key);
      } else {
        this.recentResponses.set(key, filtered);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.channelCooldowns.clear();
    this.globalCooldowns.clear();
    this.recentResponses.clear();
    this.userCooldowns.clear();
  }
}

/** Singleton */
let instance: SocialCooldown | null = null;
export function getSocialCooldown(): SocialCooldown {
  if (!instance) instance = new SocialCooldown();
  return instance;
}
