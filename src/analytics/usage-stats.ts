import fs from "fs";
import path from "path";

export interface UsageStatsSnapshot {
  totalUsers: number;
  activeToday: number;
  activeThisWeek: number;

  // User-facing activity
  totalMessages: number;
  totalCommands: number;
  totalFailures: number;

  // Failure breakdown
  commandFailures: number;
  chatFailures: number;

  // Per-command usage
  commandUsage: Record<string, number>;
}

interface UserUsage {
  firstSeen: number;
  lastSeen: number;
}

interface UsageStatsData {
  totalUsers: number;
  totalMessages: number;
  totalCommands: number;
  totalFailures: number;
  commandFailures: number;
  chatFailures: number;

  users: Record<string, UserUsage>;
  dailyUsers: Record<string, string[]>;
  weeklyUsers: Record<string, string[]>;

  commandUsage: Record<string, number>;
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
  private writePending = false;

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

          totalFailures: parsed.totalFailures ?? 0,
          commandFailures: parsed.commandFailures ?? 0,
          chatFailures: parsed.chatFailures ?? 0,

          users: parsed.users ?? {},
          dailyUsers: parsed.dailyUsers ?? {},
          weeklyUsers: parsed.weeklyUsers ?? {},

          commandUsage: parsed.commandUsage ?? {},
        };
      }
    } catch {
      // Start fresh if the stats file is damaged.
    }

    return {
      totalUsers: 0,
      totalMessages: 0,
      totalCommands: 0,

      totalFailures: 0,
      commandFailures: 0,
      chatFailures: 0,

      users: {},
      dailyUsers: {},
      weeklyUsers: {},

      commandUsage: {},
    };
  }

  private save(): void {
    try {
      fs.mkdirSync(DATA_DIR, {
        recursive: true,
      });

      const tmpPath = STATS_FILE + ".tmp";
      fs.writeFileSync(
        tmpPath,
        JSON.stringify(this.stats, null, 2),
        "utf8",
      );
      fs.renameSync(tmpPath, STATS_FILE);
    } catch {
      // Silently ignore write failures to avoid crashing the caller.
    }
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
  }

  /**
   * Records a normal chat interaction that AshenAI actually processes.
   */
  recordMessage(userId: string): void {
    this.recordUser(userId);

    this.stats.totalMessages += 1;

    this.save();
  }

  /**
   * Records a slash command invocation.
   * Defers disk write — call flush() after the Discord response is delivered.
   */
  recordCommand(userId: string, commandName?: string): void {
    this.recordUser(userId);

    this.stats.totalCommands += 1;

    if (commandName) {
      this.stats.commandUsage[commandName] =
        (this.stats.commandUsage[commandName] ?? 0) + 1;
    }

    this.writePending = true;
  }

  /**
   * Flush any deferred analytics write to disk.
   */
  flush(): void {
    if (this.writePending) {
      this.writePending = false;
      this.save();
    }
  }

  /**
   * Records a user-facing failure.
   *
   * This is intentionally separate from provider health.
   * The AI router already tracks provider-level failures.
   */
  recordFailure(
    userId: string,
    type: "command" | "chat",
  ): void {
    this.recordUser(userId);

    this.stats.totalFailures += 1;

    if (type === "command") {
      this.stats.commandFailures += 1;
    } else {
      this.stats.chatFailures += 1;
    }

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

      totalFailures: this.stats.totalFailures,
      commandFailures: this.stats.commandFailures,
      chatFailures: this.stats.chatFailures,

      commandUsage: {
        ...this.stats.commandUsage,
      },
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
      `${stats.totalCommands} commands | ` +
      `${stats.totalFailures} failures`,
    );

    const commandUsage = Object.entries(stats.commandUsage)
      .sort((a, b) => b[1] - a[1]);

    if (commandUsage.length > 0) {
      console.log(
        `📊 Command usage | ` +
        commandUsage
          .map(([command, count]) => `/${command}=${count}`)
          .join(" | "),
      );
    }
  }
}
