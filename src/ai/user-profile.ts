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

export class UserProfileMemory {
  private readonly profiles = new Map<string, UserProfile>();

  constructor() {
    this.load();
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

  private save(): void {
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
