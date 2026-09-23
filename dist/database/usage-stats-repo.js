"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var usage_stats_repo_exports = {};
__export(usage_stats_repo_exports, {
  loadUsageStatsDB: () => loadUsageStatsDB,
  saveUsageStatsDB: () => saveUsageStatsDB
});
module.exports = __toCommonJS(usage_stats_repo_exports);
var import_database = require("./database");
var import_zod = require("zod");
const CommandUsageSchema = import_zod.z.record(import_zod.z.string(), import_zod.z.number());
function loadUsageStatsDB() {
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const row = db.prepare("SELECT * FROM usage_stats WHERE id = 1").get();
    const stats = {
      totalUsers: row?.total_users ?? 0,
      totalMessages: row?.total_messages ?? 0,
      totalCommands: row?.total_commands ?? 0,
      totalFailures: row?.total_failures ?? 0,
      commandFailures: row?.command_failures ?? 0,
      chatFailures: row?.chat_failures ?? 0,
      commandUsage: row?.command_usage_json ? (() => {
        try {
          const parsed = JSON.parse(row.command_usage_json);
          const validated = CommandUsageSchema.safeParse(parsed);
          return validated.success ? validated.data : {};
        } catch {
          return {};
        }
      })() : {},
      users: {},
      dailyUsers: {},
      weeklyUsers: {}
    };
    const users = db.prepare("SELECT user_id, first_seen, last_seen FROM usage_user_records").all();
    for (const u of users) {
      stats.users[u.user_id] = { firstSeen: u.first_seen, lastSeen: u.last_seen };
    }
    const dailyRows = db.prepare("SELECT day_key, user_id FROM usage_daily_users WHERE day_key >= date('now', '-30 days')").all();
    for (const d of dailyRows) {
      stats.dailyUsers[d.day_key] = stats.dailyUsers[d.day_key] || [];
      stats.dailyUsers[d.day_key].push(d.user_id);
    }
    const weeklyRows = db.prepare("SELECT week_key, user_id FROM usage_weekly_users WHERE week_key >= date('now', '-84 days')").all();
    for (const w of weeklyRows) {
      stats.weeklyUsers[w.week_key] = stats.weeklyUsers[w.week_key] || [];
      stats.weeklyUsers[w.week_key].push(w.user_id);
    }
    return stats;
  }, {
    totalUsers: 0,
    totalMessages: 0,
    totalCommands: 0,
    totalFailures: 0,
    commandFailures: 0,
    chatFailures: 0,
    commandUsage: {},
    users: {},
    dailyUsers: {},
    weeklyUsers: {}
  }, "loadUsageStats");
}
function saveUsageStatsDB(stats) {
  (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    (0, import_database.transaction)(() => {
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
        stats.totalUsers,
        stats.totalMessages,
        stats.totalCommands,
        stats.totalFailures,
        stats.commandFailures,
        stats.chatFailures,
        JSON.stringify(stats.commandUsage),
        Date.now()
      );
      db.prepare("DELETE FROM usage_user_records").run();
      const insertUser = db.prepare("INSERT INTO usage_user_records (user_id, first_seen, last_seen) VALUES (?, ?, ?)");
      for (const [userId, data] of Object.entries(stats.users)) {
        insertUser.run(userId, data.firstSeen, data.lastSeen);
      }
      db.prepare("DELETE FROM usage_daily_users WHERE day_key < date('now', '-30 days')").run();
      db.prepare("DELETE FROM usage_daily_users").run();
      const insertDaily = db.prepare("INSERT INTO usage_daily_users (day_key, user_id) VALUES (?, ?)");
      for (const [day, users] of Object.entries(stats.dailyUsers)) {
        for (const userId of users) {
          insertDaily.run(day, userId);
        }
      }
      db.prepare("DELETE FROM usage_weekly_users").run();
      const insertWeekly = db.prepare("INSERT INTO usage_weekly_users (week_key, user_id) VALUES (?, ?)");
      for (const [week, users] of Object.entries(stats.weeklyUsers)) {
        for (const userId of users) {
          insertWeekly.run(week, userId);
        }
      }
    });
  }, void 0, "saveUsageStats");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  loadUsageStatsDB,
  saveUsageStatsDB
});
