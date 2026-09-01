import { getDatabase, safeDbOperation, transaction } from "./database";
import { z } from "zod";

interface UsageStatsData {
  totalUsers: number;
  totalMessages: number;
  totalCommands: number;
  totalFailures: number;
  commandFailures: number;
  chatFailures: number;
  commandUsage: Record<string, number>;
  users: Record<string, { firstSeen: number; lastSeen: number }>;
  dailyUsers: Record<string, string[]>;
  weeklyUsers: Record<string, string[]>;
}

const CommandUsageSchema = z.record(z.string(), z.number());

/**
 * Load usage stats from SQLite.
 */
export function loadUsageStatsDB(): UsageStatsData {
  return safeDbOperation(() => {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM usage_stats WHERE id = 1").get() as any;

    const stats: UsageStatsData = {
      totalUsers: row?.total_users ?? 0,
      totalMessages: row?.total_messages ?? 0,
      totalCommands: row?.total_commands ?? 0,
      totalFailures: row?.total_failures ?? 0,
      commandFailures: row?.command_failures ?? 0,
      chatFailures: row?.chat_failures ?? 0,
      commandUsage: row?.command_usage_json
        ? (() => {
            try {
              const parsed = JSON.parse(row.command_usage_json);
              const validated = CommandUsageSchema.safeParse(parsed);
              return validated.success ? validated.data : {};
            } catch {
              return {};
            }
          })()
        : {},
      users: {},
      dailyUsers: {},
      weeklyUsers: {},
    };

    // Load user records
    const users = db.prepare("SELECT user_id, first_seen, last_seen FROM usage_user_records").all() as any[];
    for (const u of users) {
      stats.users[u.user_id] = { firstSeen: u.first_seen, lastSeen: u.last_seen };
    }

    // Load daily users (last 30 days)
    const dailyRows = db.prepare("SELECT day_key, user_id FROM usage_daily_users WHERE day_key >= date('now', '-30 days')").all() as any[];
    for (const d of dailyRows) {
      stats.dailyUsers[d.day_key] = stats.dailyUsers[d.day_key] || [];
      stats.dailyUsers[d.day_key].push(d.user_id);
    }

    // Load weekly users (last 12 weeks)
    const weeklyRows = db.prepare("SELECT week_key, user_id FROM usage_weekly_users WHERE week_key >= date('now', '-84 days')").all() as any[];
    for (const w of weeklyRows) {
      stats.weeklyUsers[w.week_key] = stats.weeklyUsers[w.week_key] || [];
      stats.weeklyUsers[w.week_key].push(w.user_id);
    }

    return stats;
  }, {
    totalUsers: 0, totalMessages: 0, totalCommands: 0,
    totalFailures: 0, commandFailures: 0, chatFailures: 0,
    commandUsage: {}, users: {}, dailyUsers: {}, weeklyUsers: {},
  }, "loadUsageStats");
}

/**
 * Save usage stats to SQLite.
 */
export function saveUsageStatsDB(stats: UsageStatsData): void {
  safeDbOperation(() => {
    const db = getDatabase();
    transaction(() => {
      // Upsert main stats row
      db.prepare(`
        INSERT INTO usage_stats (id, total_users, total_messages, total_commands, total_failures, command_failures, chat_failures, command_usage_json, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          total_users = excluded.total_users,
          total_messages = excluded.total_messages,
          total_commands = excluded.total_commands,
          total_failures = excluded.total_failures,
          command_failures = excluded.command_failures,
          chat_failures = excluded.chat_failures,
          command_usage_json = excluded.command_usage_json,
          updated_at = excluded.updated_at
      `).run(
        stats.totalUsers, stats.totalMessages, stats.totalCommands,
        stats.totalFailures, stats.commandFailures, stats.chatFailures,
        JSON.stringify(stats.commandUsage), Date.now(),
      );

      // Save user records
      db.prepare("DELETE FROM usage_user_records").run();
      const insertUser = db.prepare("INSERT INTO usage_user_records (user_id, first_seen, last_seen) VALUES (?, ?, ?)");
      for (const [userId, data] of Object.entries(stats.users)) {
        insertUser.run(userId, data.firstSeen, data.lastSeen);
      }

      // Save daily users
      db.prepare("DELETE FROM usage_daily_users WHERE day_key < date('now', '-30 days')").run();
      db.prepare("DELETE FROM usage_daily_users").run();
      const insertDaily = db.prepare("INSERT INTO usage_daily_users (day_key, user_id) VALUES (?, ?)");
      for (const [day, users] of Object.entries(stats.dailyUsers)) {
        for (const userId of users) {
          insertDaily.run(day, userId);
        }
      }

      // Save weekly users
      db.prepare("DELETE FROM usage_weekly_users").run();
      const insertWeekly = db.prepare("INSERT INTO usage_weekly_users (week_key, user_id) VALUES (?, ?)");
      for (const [week, users] of Object.entries(stats.weeklyUsers)) {
        for (const userId of users) {
          insertWeekly.run(week, userId);
        }
      }
    });
  }, undefined, "saveUsageStats");
}
