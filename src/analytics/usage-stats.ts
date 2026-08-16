import fs from "fs";
import path from "path";

export interface UsageStatsSnapshot {
  totalUsers: number;
  activeToday: number;
  activeThisWeek: number;
  totalMessages: number;
  totalCommands: number;
}

interface UserUsage {
  firstSeen: number;
  lastSeen: number;
}

interface UsageStatsData {
  totalUsers: number;
  totalMessages: number;
  totalCommands: number;
  users: Record<string, UserUsage>;
  dailyUsers: Record<string, string[]>;
  weeklyUsers: Record<string, string[]>;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STATS_FILE = path.join(DATA_DIR, "usage-stats.json");

function dayKey(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function weekKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const start = new Date(date);

  const day = start.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;

  start.setUTCDate(start.getUTCDate() + diff);

  return start.toISOString().slice(0, 10);
}

function uniquePush(list: string[], value: string): void {
  if (!list.includes(value)) {
    list.push(value);
  }
}

export class UsageStats {
  private stats: UsageStatsData;

  constructor() {
    this.stats = this.load();
  }

  private load(): UsageStatsData {
    try {
      if (fs.existsSync(STATS_FILE)) {
        const raw = fs.readFileSync(STATS_FILE, "utf8");
        const parsed = JSON.parse(raw) as Partial<UsageStatsData>;

        return {
          totalUsers: parsed.totalUsers ?? 0,
          totalMessages: parsed.totalMessages ?? 0,
          totalCommands: parsed.totalCommands ?? 0,
          users: parsed.users ?? {},
          dailyUsers: parsed.dailyUsers ?? {},
          weeklyUsers: parsed.weeklyUsers ?? {},
        };
      }
    } catch {
      // Start fresh if the stats file is damaged.
    }

    return {
      totalUsers: 0,
      totalMessages: 0,
      totalCommands: 0,
      users: {},
      dailyUsers: {},
      weeklyUsers: {},
    };
  }

  private save(): void {
    fs.mkdirSync(DATA_DIR, {
      recursive: true,
    });

    fs.writeFileSync(
      STATS_FILE,
      JSON.stringify(this.stats, null, 2),
      "utf8",
    );
  }

  recordUser(userId: string): void {
    const now = Date.now();

    if (!this.stats.users[userId]) {
      this.stats.users[userId] = {
        firstSeen: now,
        lastSeen: now,
      };

      this.stats.totalUsers += 1;
    } else {
      this.stats.users[userId].lastSeen = now;
    }

    const today = dayKey(now);
    const week = weekKey(now);

    this.stats.dailyUsers[today] ??= [];
    this.stats.weeklyUsers[week] ??= [];

    uniquePush(this.stats.dailyUsers[today], userId);
    uniquePush(this.stats.weeklyUsers[week], userId);

    this.save();
  }

  recordMessage(userId: string): void {
    this.recordUser(userId);

    this.stats.totalMessages += 1;

    this.save();
  }

  recordCommand(userId: string): void {
    this.recordUser(userId);

    this.stats.totalCommands += 1;

    this.save();
  }

  getStats(): UsageStatsSnapshot {
    const now = Date.now();

    const today = dayKey(now);
    const week = weekKey(now);

    return {
      totalUsers: this.stats.totalUsers,
      activeToday:
        this.stats.dailyUsers[today]?.length ?? 0,
      activeThisWeek:
        this.stats.weeklyUsers[week]?.length ?? 0,
      totalMessages: this.stats.totalMessages,
      totalCommands: this.stats.totalCommands,
    };
  }

  logSummary(): void {
    const stats = this.getStats();

    console.log(
      `👥 AshenAI usage | ` +
      `${stats.totalUsers} users | ` +
      `${stats.activeToday} today | ` +
      `${stats.activeThisWeek} this week | ` +
      `${stats.totalMessages} messages | ` +
      `${stats.totalCommands} commands`,
    );
  }
}
