import { readJSON, writeJSON } from "../core/data-store";
import { logger } from "../logger";

export type SystemPriority = "critical" | "high" | "normal" | "low" | "background";

export type SystemName = "agent" | "self-healer" | "task-planner" | "game-narrator" | "maintenance";

export interface SystemUsageRecord {
  system: SystemName;
  operation: string;
  provider?: string;
  model?: string;
  credits: number;
  latencyMs?: number;
  success: boolean;
  timestamp: number;
  guildId?: string;
}

interface SystemBudget {
  dailyCredits: number;
  maxConcurrent: number;
  cooldownMs: number;
  maxRetries: number;
  maxExecutionMs: number;
}

const DEFAULT_BUDGET: SystemBudget = {
  dailyCredits: 200,
  maxConcurrent: 2,
  cooldownMs: 10_000,
  maxRetries: 2,
  maxExecutionMs: 60_000,
};

const PRIORITY_BUDGETS: Record<SystemPriority, Partial<SystemBudget>> = {
  critical: { dailyCredits: 100, maxConcurrent: 1, cooldownMs: 0, maxRetries: 3 },
  high: { dailyCredits: 80, maxConcurrent: 1, cooldownMs: 5_000, maxRetries: 2 },
  normal: { dailyCredits: 60, maxConcurrent: 1, cooldownMs: 10_000, maxRetries: 2 },
  low: { dailyCredits: 40, maxConcurrent: 1, cooldownMs: 30_000, maxRetries: 1 },
  background: { dailyCredits: 20, maxConcurrent: 1, cooldownMs: 60_000, maxRetries: 0 },
};

const PRIORITY_ORDER: SystemPriority[] = ["critical", "high", "normal", "low", "background"];

interface SystemState {
  dailyCredits: number;
  lastResetDay: string;
  lastOperationAt: number;
  consecutiveFailures: number;
  concurrentCount: number;
}

interface SystemUsageData {
  records: SystemUsageRecord[];
  systems: Record<string, SystemState>;
  totalCreditsToday: number;
  lastResetDay: string;
}

const USAGE_FILE = "system-usage.json";

function dayKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export class SystemUsageManager {
  private data: SystemUsageData;
  private budget: SystemBudget;
  private globalBudget: SystemBudget;

  constructor(budget?: Partial<SystemBudget>) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
    this.globalBudget = { ...this.budget, dailyCredits: this.budget.dailyCredits * 2 };
    this.data = readJSON<SystemUsageData>(USAGE_FILE, {
      records: [],
      systems: {},
      totalCreditsToday: 0,
      lastResetDay: dayKey(),
    });
    this.resetIfNeeded();
  }

  private resetIfNeeded(): void {
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

  private save(): void {
    if (this.data.records.length > 500) {
      this.data.records = this.data.records.slice(-500);
    }
    writeJSON(USAGE_FILE, this.data);
  }

  private getSystemState(system: SystemName): SystemState {
    if (!this.data.systems[system]) {
      this.data.systems[system] = {
        dailyCredits: 0,
        lastResetDay: dayKey(),
        lastOperationAt: 0,
        consecutiveFailures: 0,
        concurrentCount: 0,
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

  canExecute(system: SystemName, priority: SystemPriority, estimatedCredits: number): {
    allowed: boolean;
    reason?: string;
    retryAfterMs?: number;
  } {
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
        retryAfterMs: budget.cooldownMs - timeSinceLastOp,
      };
    }

    if (state.consecutiveFailures >= budget.maxRetries) {
      return {
        allowed: false,
        reason: "max_failures",
        retryAfterMs: 60_000,
      };
    }

    return { allowed: true };
  }

  acquire(system: SystemName): boolean {
    const state = this.getSystemState(system);
    const budget = this.budget;
    if (state.concurrentCount >= budget.maxConcurrent) return false;
    state.concurrentCount++;
    return true;
  }

  release(system: SystemName): void {
    const state = this.getSystemState(system);
    state.concurrentCount = Math.max(0, state.concurrentCount - 1);
  }

  record(params: {
    system: SystemName;
    operation: string;
    provider?: string;
    model?: string;
    credits: number;
    latencyMs?: number;
    success: boolean;
    guildId?: string;
  }): void {
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
      timestamp: Date.now(),
    });

    this.save();
  }

  shouldThrottleForUsers(): boolean {
    const load = this.data.totalCreditsToday;
    const limit = this.globalBudget.dailyCredits;
    return load > limit * 0.8;
  }

  getThrottledPriority(): SystemPriority {
    if (this.data.totalCreditsToday > this.globalBudget.dailyCredits * 0.9) return "critical";
    if (this.data.totalCreditsToday > this.globalBudget.dailyCredits * 0.7) return "high";
    if (this.data.totalCreditsToday > this.globalBudget.dailyCredits * 0.5) return "low";
    return "normal";
  }

  getSystemUsage(system: SystemName): {
    dailyCredits: number;
    consecutiveFailures: number;
    concurrentCount: number;
    totalRecords: number;
  } {
    const state = this.getSystemState(system);
    return {
      dailyCredits: state.dailyCredits,
      consecutiveFailures: state.consecutiveFailures,
      concurrentCount: state.concurrentCount,
      totalRecords: this.data.records.filter((r) => r.system === system).length,
    };
  }

  getGlobalUsage(): {
    totalCreditsToday: number;
    dailyLimit: number;
    bySystem: Record<string, { credits: number; operations: number; failures: number }>;
  } {
    const bySystem: Record<string, { credits: number; operations: number; failures: number }> = {};
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
      bySystem,
    };
  }

  getBudget(): SystemBudget {
    return { ...this.budget };
  }

  updateBudget(budget: Partial<SystemBudget>): void {
    Object.assign(this.budget, budget);
  }
}

export function estimateSystemCredits(operation: string): number {
  if (operation.includes("repair") || operation.includes("self-heal")) return 8;
  if (operation.includes("plan") || operation.includes("task")) return 5;
  if (operation.includes("narrat")) return 2;
  if (operation.includes("agent")) return 10;
  return 3;
}

export function getPriorityForSystem(system: SystemName, operation?: string): SystemPriority {
  if (system === "self-healer") return "high";
  if (system === "agent") return "normal";
  if (system === "task-planner") return "normal";
  if (system === "game-narrator") return "low";
  if (system === "maintenance") return "background";
  return "normal";
}
