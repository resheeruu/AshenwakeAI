import fs from "fs";
import path from "path";
import { logger } from "../logger";
import { loadGuildConfig } from "./guild-config";

export interface HealthReport {
  overall: "healthy" | "degraded" | "unhealthy";
  score: number;
  checks: HealthCheck[];
  timestamp: number;
}

export interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: string;
}

export function runHealthCheck(guildId?: string): HealthReport {
  const checks: HealthCheck[] = [];

  checks.push(checkCriticalFiles());
  checks.push(checkDataDirectory());
  checks.push(checkMemoryUsage());
  checks.push(checkUptime());

  if (guildId) {
    const config = loadGuildConfig(guildId);
    checks.push(checkGuildConfig(config));
  }

  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const score = Math.max(0, 100 - fails * 20 - warns * 5);
  const overall = fails > 2 ? "unhealthy" : fails > 0 || warns > 3 ? "degraded" : "healthy";

  return { overall, score, checks, timestamp: Date.now() };
}

function checkCriticalFiles(): HealthCheck {
  const criticalFiles = ["src/index.ts", "src/config/env.ts", "package.json", "tsconfig.json"];
  const missing = criticalFiles.filter((f) => !fs.existsSync(path.join(process.cwd(), f)));
  return {
    name: "critical_files",
    status: missing.length === 0 ? "pass" : missing.length > 2 ? "fail" : "warn",
    message: missing.length === 0 ? "All critical files present" : `Missing: ${missing.join(", ")}`,
  };
}

function checkDataDirectory(): HealthCheck {
  const dataDir = path.join(process.cwd(), "data");
  const exists = fs.existsSync(dataDir);
  if (!exists) return { name: "data_directory", status: "warn", message: "Data directory does not exist yet" };
  try {
    const files = fs.readdirSync(dataDir);
    return { name: "data_directory", status: "pass", message: `Data directory healthy (${files.length} files)` };
  } catch {
    return { name: "data_directory", status: "fail", message: "Cannot read data directory" };
  }
}

function checkMemoryUsage(): HealthCheck {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  if (heapMB > 512) return { name: "memory", status: "fail", message: `Heap usage critical: ${heapMB}MB`, details: `RSS: ${rssMB}MB` };
  if (heapMB > 256) return { name: "memory", status: "warn", message: `Heap usage elevated: ${heapMB}MB`, details: `RSS: ${rssMB}MB` };
  return { name: "memory", status: "pass", message: `Memory OK: ${heapMB}MB heap, ${rssMB}MB RSS` };
}

function checkUptime(): HealthCheck {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  return { name: "uptime", status: "pass", message: `Uptime: ${hours}h ${minutes}m` };
}

function checkGuildConfig(config: any): HealthCheck {
  const issues: string[] = [];
  if (!config.automod?.enabled) issues.push("Automod disabled");
  if (!config.moderation?.enabled) issues.push("Moderation disabled");
  if (!config.tickets?.enabled) issues.push("Tickets disabled");
  if (issues.length > 3) return { name: "guild_config", status: "warn", message: `Many features disabled: ${issues.join(", ")}` };
  return { name: "guild_config", status: "pass", message: `Guild config OK (${issues.length} disabled features)` };
}
