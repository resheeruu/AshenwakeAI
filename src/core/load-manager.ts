import { logger } from "../logger";
import { SystemPriority } from "../ai/system-usage";

export type LoadLevel = "normal" | "high" | "extreme";

interface LoadState {
  level: LoadLevel;
  requestCount: number;
  windowStart: number;
  lastCheck: number;
}

const state: LoadState = {
  level: "normal",
  requestCount: 0,
  windowStart: Date.now(),
  lastCheck: Date.now(),
};

const NORMAL_THRESHOLD = 50;
const HIGH_THRESHOLD = 150;
const EXTREME_THRESHOLD = 300;
const WINDOW_MS = 60_000;

export function checkLoad(): LoadState {
  const now = Date.now();
  if (now - state.windowStart > WINDOW_MS) {
    state.requestCount = 0;
    state.windowStart = now;
  }

  if (state.requestCount > EXTREME_THRESHOLD) state.level = "extreme";
  else if (state.requestCount > HIGH_THRESHOLD) state.level = "high";
  else state.level = "normal";

  state.lastCheck = now;
  return { ...state };
}

export function recordRequest(): void {
  state.requestCount++;
}

export function shouldThrottle(): boolean {
  const load = checkLoad();
  return load.level === "extreme";
}

export function getLoadMultiplier(): number {
  const load = checkLoad();
  switch (load.level) {
    case "normal": return 1;
    case "high": return 0.5;
    case "extreme": return 0.2;
  }
}

export function canRunInternalOperation(priority: SystemPriority): boolean {
  const load = checkLoad();
  switch (load.level) {
    case "normal":
      return true;
    case "high":
      return priority === "critical" || priority === "high";
    case "extreme":
      return priority === "critical";
  }
}

export function getInternalCooldownMs(priority: SystemPriority): number {
  const load = checkLoad();
  const base: Record<SystemPriority, number> = {
    critical: 0,
    high: 2_000,
    normal: 5_000,
    low: 15_000,
    background: 30_000,
  };
  const multiplier = load.level === "extreme" ? 3 : load.level === "high" ? 2 : 1;
  return base[priority] * multiplier;
}

export function getLoadStatus(): { level: LoadLevel; requests: number; multiplier: number } {
  const load = checkLoad();
  return {
    level: load.level,
    requests: state.requestCount,
    multiplier: getLoadMultiplier(),
  };
}
