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
var usage_stats_exports = {};
__export(usage_stats_exports, {
  UsageStats: () => UsageStats
});
module.exports = __toCommonJS(usage_stats_exports);
var import_database = require("../database");
function dayKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}
function weekKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const start = new Date(date);
  const day = start.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setUTCDate(start.getUTCDate() + diff);
  return start.toISOString().slice(0, 10);
}
function uniquePush(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}
class UsageStats {
  stats;
  writePending = false;
  constructor() {
    this.stats = this.load();
  }
  load() {
    return (0, import_database.loadUsageStatsDB)();
  }
  save() {
    (0, import_database.saveUsageStatsDB)(this.stats);
  }
  recordUser(userId) {
    const now = Date.now();
    if (!this.stats.users[userId]) {
      this.stats.users[userId] = {
        firstSeen: now,
        lastSeen: now
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
  recordMessage(userId) {
    this.recordUser(userId);
    this.stats.totalMessages += 1;
    this.save();
  }
  /**
   * Records a slash command invocation.
   * Defers disk write — call flush() after the Discord response is delivered.
   */
  recordCommand(userId, commandName) {
    this.recordUser(userId);
    this.stats.totalCommands += 1;
    if (commandName) {
      this.stats.commandUsage[commandName] = (this.stats.commandUsage[commandName] ?? 0) + 1;
    }
    this.writePending = true;
  }
  /**
   * Flush any deferred analytics write to disk.
   */
  flush() {
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
  recordFailure(userId, type) {
    this.recordUser(userId);
    this.stats.totalFailures += 1;
    if (type === "command") {
      this.stats.commandFailures += 1;
    } else {
      this.stats.chatFailures += 1;
    }
    this.save();
  }
  getStats() {
    const now = Date.now();
    const today = dayKey(now);
    const week = weekKey(now);
    return {
      totalUsers: this.stats.totalUsers,
      activeToday: this.stats.dailyUsers[today]?.length ?? 0,
      activeThisWeek: this.stats.weeklyUsers[week]?.length ?? 0,
      totalMessages: this.stats.totalMessages,
      totalCommands: this.stats.totalCommands,
      totalFailures: this.stats.totalFailures,
      commandFailures: this.stats.commandFailures,
      chatFailures: this.stats.chatFailures,
      commandUsage: {
        ...this.stats.commandUsage
      }
    };
  }
  logSummary() {
    const stats = this.getStats();
    console.log(
      `\u{1F465} AshenAI usage | ${stats.totalUsers} users | ${stats.activeToday} today | ${stats.activeThisWeek} this week | ${stats.totalMessages} messages | ${stats.totalCommands} commands | ${stats.totalFailures} failures`
    );
    const commandUsage = Object.entries(stats.commandUsage).sort((a, b) => b[1] - a[1]);
    if (commandUsage.length > 0) {
      console.log(
        `\u{1F4CA} Command usage | ` + commandUsage.map(([command, count]) => `/${command}=${count}`).join(" | ")
      );
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UsageStats
});
