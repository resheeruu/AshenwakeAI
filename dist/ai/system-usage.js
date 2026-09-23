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
var system_usage_exports = {};
__export(system_usage_exports, {
  SystemUsageManager: () => SystemUsageManager,
  estimateSystemCredits: () => estimateSystemCredits,
  getPriorityForSystem: () => getPriorityForSystem
});
module.exports = __toCommonJS(system_usage_exports);
var import_data_store = require("../core/data-store");
const DEFAULT_BUDGET = {
  dailyCredits: 200,
  maxConcurrent: 2,
  cooldownMs: 1e4,
  maxRetries: 2,
  maxExecutionMs: 6e4
};
const PRIORITY_BUDGETS = {
  critical: { dailyCredits: 100, maxConcurrent: 1, cooldownMs: 0, maxRetries: 3 },
  high: { dailyCredits: 80, maxConcurrent: 1, cooldownMs: 5e3, maxRetries: 2 },
  normal: { dailyCredits: 60, maxConcurrent: 1, cooldownMs: 1e4, maxRetries: 2 },
  low: { dailyCredits: 40, maxConcurrent: 1, cooldownMs: 3e4, maxRetries: 1 },
  background: { dailyCredits: 20, maxConcurrent: 1, cooldownMs: 6e4, maxRetries: 0 }
};
const PRIORITY_ORDER = ["critical", "high", "normal", "low", "background"];
const USAGE_FILE = "system-usage.json";
function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}
class SystemUsageManager {
  data;
  budget;
  globalBudget;
  constructor(budget) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
    this.globalBudget = { ...this.budget, dailyCredits: this.budget.dailyCredits * 2 };
    this.data = (0, import_data_store.readJSON)(USAGE_FILE, {
      records: [],
      systems: {},
      totalCreditsToday: 0,
      lastResetDay: dayKey()
    });
    this.resetIfNeeded();
  }
  resetIfNeeded() {
    const today = dayKey();
    if (this.data.lastResetDay !== today) {
      this.data.totalCreditsToday = 0;
      this.data.lastResetDay = today;
      for (const state of Object.values(this.data.systems)) {
        state.dailyCredits = 0;
        state.lastResetDay = today;
      }
      this.save();
    }
  }
  save() {
    if (this.data.records.length > 500) {
      this.data.records = this.data.records.slice(-500);
    }
    (0, import_data_store.writeJSON)(USAGE_FILE, this.data);
  }
  getSystemState(system) {
    if (!this.data.systems[system]) {
      this.data.systems[system] = {
        dailyCredits: 0,
        lastResetDay: dayKey(),
        lastOperationAt: 0,
        consecutiveFailures: 0,
        concurrentCount: 0
      };
    }
    const state = this.data.systems[system];
    const today = dayKey();
    if (state.lastResetDay !== today) {
      state.dailyCredits = 0;
      state.lastResetDay = today;
    }
    return state;
  }
  canExecute(system, priority, estimatedCredits) {
    this.resetIfNeeded();
    const now = Date.now();
    const state = this.getSystemState(system);
    const budget = { ...this.budget, ...PRIORITY_BUDGETS[priority] };
    if (state.concurrentCount >= budget.maxConcurrent) {
      return { allowed: false, reason: "concurrent_limit" };
    }
    if (state.dailyCredits + estimatedCredits > budget.dailyCredits) {
      return { allowed: false, reason: "system_daily_limit" };
    }
    if (this.data.totalCreditsToday + estimatedCredits > this.globalBudget.dailyCredits) {
      return { allowed: false, reason: "global_system_limit" };
    }
    const timeSinceLastOp = now - state.lastOperationAt;
    if (timeSinceLastOp < budget.cooldownMs) {
      return {
        allowed: false,
        reason: "cooldown",
        retryAfterMs: budget.cooldownMs - timeSinceLastOp
      };
    }
    if (state.consecutiveFailures >= budget.maxRetries) {
      return {
        allowed: false,
        reason: "max_failures",
        retryAfterMs: 6e4
      };
    }
    return { allowed: true };
  }
  acquire(system) {
    const state = this.getSystemState(system);
    const budget = this.budget;
    if (state.concurrentCount >= budget.maxConcurrent) return false;
    state.concurrentCount++;
    return true;
  }
  release(system) {
    const state = this.getSystemState(system);
    state.concurrentCount = Math.max(0, state.concurrentCount - 1);
  }
  record(params) {
    this.resetIfNeeded();
    const state = this.getSystemState(params.system);
    state.lastOperationAt = Date.now();
    if (params.success) {
      state.consecutiveFailures = 0;
      state.dailyCredits += params.credits;
      this.data.totalCreditsToday += params.credits;
    } else {
      state.consecutiveFailures++;
    }
    this.data.records.push({
      ...params,
      timestamp: Date.now()
    });
    this.save();
  }
  shouldThrottleForUsers() {
    const load = this.data.totalCreditsToday;
    const limit = this.globalBudget.dailyCredits;
    return load > limit * 0.8;
  }
  getThrottledPriority() {
    if (this.data.totalCreditsToday > this.globalBudget.dailyCredits * 0.9) return "critical";
    if (this.data.totalCreditsToday > this.globalBudget.dailyCredits * 0.7) return "high";
    if (this.data.totalCreditsToday > this.globalBudget.dailyCredits * 0.5) return "low";
    return "normal";
  }
  getSystemUsage(system) {
    const state = this.getSystemState(system);
    return {
      dailyCredits: state.dailyCredits,
      consecutiveFailures: state.consecutiveFailures,
      concurrentCount: state.concurrentCount,
      totalRecords: this.data.records.filter((r) => r.system === system).length
    };
  }
  getGlobalUsage() {
    const bySystem = {};
    for (const record of this.data.records) {
      if (!bySystem[record.system]) {
        bySystem[record.system] = { credits: 0, operations: 0, failures: 0 };
      }
      bySystem[record.system].operations++;
      bySystem[record.system].credits += record.credits;
      if (!record.success) bySystem[record.system].failures++;
    }
    return {
      totalCreditsToday: this.data.totalCreditsToday,
      dailyLimit: this.globalBudget.dailyCredits,
      bySystem
    };
  }
  getBudget() {
    return { ...this.budget };
  }
  updateBudget(budget) {
    Object.assign(this.budget, budget);
  }
}
function estimateSystemCredits(operation) {
  if (operation.includes("repair") || operation.includes("self-heal")) return 8;
  if (operation.includes("plan") || operation.includes("task")) return 5;
  if (operation.includes("narrat")) return 2;
  if (operation.includes("agent")) return 10;
  return 3;
}
function getPriorityForSystem(system, operation) {
  if (system === "self-healer") return "high";
  if (system === "agent") return "normal";
  if (system === "task-planner") return "normal";
  if (system === "game-narrator") return "low";
  if (system === "maintenance") return "background";
  return "normal";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SystemUsageManager,
  estimateSystemCredits,
  getPriorityForSystem
});
