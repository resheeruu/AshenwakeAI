import fs from "fs";
import path from "path";
import { logger } from "../logger";

export type ToneLevel = "low" | "medium" | "high";
export type UserLanguage = "en" | "fil" | "taglish";

export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
  firstSeen: number;
  lastSeen: number;

  language?: UserLanguage;

  // Adaptive personality
  humor?: ToneLevel;
  formality?: ToneLevel;
  verbosity?: ToneLevel;
  emoji?: ToneLevel;
  technicalLevel?: "beginner" | "intermediate" | "advanced";
}

type StoredProfiles = Record<string, UserProfile>;

const DATA_DIR = path.join(process.cwd(), "data");
const PROFILE_FILE = path.join(DATA_DIR, "user-profiles.json");
const MAX_PROFILES = 10_000;
const STALE_DAYS = 90;

export class UserProfileMemory {
  private readonly profiles = new Map<string, UserProfile>();
  private dirty = false;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.load();
    // Batch saves: write at most once per 60s instead of on every upsert
    this.saveTimer = setInterval(() => this.flush(), 60_000);
    this.saveTimer.unref();
    // Daily stale pruning (runs once per 24h)
    this.pruneTimer = setInterval(() => this.pruneStale(), 24 * 60 * 60 * 1000);
    this.pruneTimer.unref();
  }

  private load(): void {
    try {
      if (!fs.existsSync(PROFILE_FILE)) {
        return;
      }

      const raw = fs.readFileSync(PROFILE_FILE, "utf8");
      const stored = JSON.parse(raw) as StoredProfiles;

      for (const [userId, profile] of Object.entries(stored)) {
        if (
          !profile ||
          profile.userId !== userId ||
          typeof profile.username !== "string" ||
          typeof profile.displayName !== "string" ||
          typeof profile.firstSeen !== "number" ||
          typeof profile.lastSeen !== "number"
        ) {
          continue;
        }

        this.profiles.set(userId, profile);
      }

      // Prune stale profiles on load
      this.pruneStale();

      logger.info(
        `👤 User profiles loaded: ${this.profiles.size} profile(s).`,
      );
    } catch (error) {
      logger.warn(
        "⚠️ Could not load user profiles:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private pruneStale(): void {
    const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
    let pruned = 0;
    for (const [userId, profile] of this.profiles) {
      if (profile.lastSeen < cutoff) {
        this.profiles.delete(userId);
        pruned++;
      }
    }
    if (pruned > 0) {
      logger.info(`👤 Pruned ${pruned} stale user profiles (>${STALE_DAYS} days inactive).`);
      this.dirty = true;
    }
  }

  private save(): void {
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.mkdirSync(DATA_DIR, {
        recursive: true,
      });

      const stored: StoredProfiles = {};

      for (const [userId, profile] of this.profiles) {
        stored[userId] = profile;
      }

      const tmpPath = PROFILE_FILE + ".tmp";
      fs.writeFileSync(
        tmpPath,
        JSON.stringify(stored, null, 2),
        "utf8",
      );
      fs.renameSync(tmpPath, PROFILE_FILE);
    } catch (error) {
      logger.warn(
        "⚠️ Could not save user profiles:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  get(userId: string): UserProfile | undefined {
    const profile = this.profiles.get(userId);
    return profile ? { ...profile } : undefined;
  }

  upsert(
    userId: string,
    username: string,
    displayName: string,
  ): UserProfile {
    const existing = this.profiles.get(userId);
    const now = Date.now();

    // Evict oldest profile if at capacity
    if (!existing && this.profiles.size >= MAX_PROFILES) {
      let oldestKey = "";
      let oldestSeen = Infinity;
      for (const [key, p] of this.profiles) {
        if (p.lastSeen < oldestSeen) {
          oldestSeen = p.lastSeen;
          oldestKey = key;
        }
      }
      if (oldestKey) this.profiles.delete(oldestKey);
    }

    const profile: UserProfile = {
      userId,
      username,
      displayName,
      firstSeen: existing?.firstSeen ?? now,
      lastSeen: now,

      language: existing?.language,
      humor: existing?.humor,
      formality: existing?.formality,
      verbosity: existing?.verbosity,
      emoji: existing?.emoji,
      technicalLevel: existing?.technicalLevel,
    };

    this.profiles.set(userId, profile);
    this.save();

    return { ...profile };
  }

  setLanguage(
    userId: string,
    language: UserLanguage | undefined,
  ): void {
    const profile = this.profiles.get(userId);

    if (!profile) {
      return;
    }

    profile.language = language;
    profile.lastSeen = Date.now();

    this.profiles.set(userId, profile);
    this.save();
  }

  updateSignals(
    userId: string,
    signals: Partial<
      Pick<
        UserProfile,
        | "language"
        | "humor"
        | "formality"
        | "verbosity"
        | "emoji"
        | "technicalLevel"
      >
    >,
  ): void {
    const profile = this.profiles.get(userId);

    if (!profile) {
      return;
    }

    Object.assign(profile, signals);
    profile.lastSeen = Date.now();

    this.profiles.set(userId, profile);
    this.save();
  }

  size(): number {
    return this.profiles.size;
  }

  clear(): void {
    this.profiles.clear();
    this.save();
  }
}
