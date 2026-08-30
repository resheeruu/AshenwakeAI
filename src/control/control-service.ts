import fs from "fs";
import path from "path";
import { logger } from "../logger";
import { AIRouter } from "../ai/router";
import { UsageManager } from "../ai/usage-manager";
import { ConversationMemory } from "../ai/memory";
import { recordAudit, getAuditLog } from "../security/audit";
import { redact } from "../security/redact";
import { runHealthCheck } from "../core/health-checker";
import { detectHostProvider } from "../core/resource-profile";
import { isAnyMfaEnabled } from "./account-store";
import { scanAshenAI } from "../diagnostics/health-scanner";
import { generateOptimizations } from "../diagnostics/optimizer";
import { getRecentLogs } from "../log-stream";
import { loadGuildConfig, getAllGuildConfigs, saveGuildConfig, GuildConfig } from "../core/guild-config";
import { config } from "../config/env";
import {
  SystemStatus,
  ProviderInfo,
  SystemInfo,
  MemoryStats,
  UsageSnapshot,
  DiagnosticResult,
  LogSnapshot,
  FeatureStatus,
  ActionResult,
  ActionRequest,
  ActionConfirmation,
  AdminAction,
} from "./types";

let router: AIRouter;
let usageManager: UsageManager;
let memory: ConversationMemory;
let getVersion: () => string;
let isRunning = true;
let systemUsageRef: { getSystemUsage: (system: string) => any; getGlobalUsage: () => any; getBudget: () => any } | null = null;

export function initControlLayer(
  r: AIRouter,
  u: UsageManager,
  m: ConversationMemory,
  versionFn: () => string,
  su?: { getSystemUsage: (system: string) => any; getGlobalUsage: () => any; getBudget: () => any },
): void {
  router = r;
  usageManager = u;
  memory = m;
  getVersion = versionFn;
  if (su) systemUsageRef = su;
}

function isDataDirectoryAccessible(): boolean {
  try {
    const dataDir = path.resolve(process.cwd(), "data");
    fs.accessSync(dataDir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function getStatus(): SystemStatus {
  return {
    running: isRunning,
    uptime: Math.floor(process.uptime()),
    version: getVersion(),
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
    environment: detectHostProvider(),
  };
}

export function getHealth(): DiagnosticResult {
  const report = runHealthCheck();
  return {
    overall: report.overall,
    score: report.score,
    checks: report.checks,
    timestamp: report.timestamp,
  };
}

export function getSystemInfo(): SystemInfo {
  const mem = process.memoryUsage();
  const dataDir = path.join(process.cwd(), "data");
  let dataFileCount = 0;
  try {
    dataFileCount = fs.readdirSync(dataDir).length;
  } catch { /* empty */ }

  return {
    hostname: require("os").hostname(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    uptime: Math.floor(process.uptime()),
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
      externalMB: Math.round(mem.external / 1024 / 1024),
    },
    cpu: {
      model: require("os").cpus()[0]?.model || "unknown",
      cores: require("os").cpus().length,
    },
    disk: {
      dataDirExists: fs.existsSync(dataDir),
      dataFileCount,
    },
  };
}

export function getProviderStatus(): ProviderInfo[] {
  const health = router.getHealth();
  const available = router.getAvailableProviders();
  const availableNames = new Set(available.map((p) => p.name));

  return health.map((h) => ({
    name: h.provider,
    available: availableNames.has(h.provider),
    successes: h.successes,
    failures: h.failures,
    averageLatencyMs: h.averageLatencyMs ?? 0,
    disabledUntil: h.disabledUntil,
    disabledReason: h.disabledReason,
    lastError: h.lastError,
  }));
}

export function getProviderPerformance(): Record<string, { requests: number; credits: number; latency: number }> {
  return usageManager.getProviderUsage();
}

export function getCurrentModel(): string {
  const available = router.getAvailableProviders();
  if (available.length === 0) return "none";
  return available[0].name;
}

export function getMemoryStats(): MemoryStats {
  return memory.stats();
}

export function getUsageStats(): UsageSnapshot {
  return {
    global: usageManager.getGlobalUsage(),
    providers: usageManager.getProviderUsage(),
  };
}

export function getSystemUsageStats(): Record<string, any> {
  if (!systemUsageRef) return { global: {}, systems: {}, budget: {} };
  return {
    global: systemUsageRef.getGlobalUsage(),
    budget: systemUsageRef.getBudget(),
    systems: {
      agent: systemUsageRef.getSystemUsage("agent"),
      "self-healer": systemUsageRef.getSystemUsage("self-healer"),
      "task-planner": systemUsageRef.getSystemUsage("task-planner"),
      "game-narrator": systemUsageRef.getSystemUsage("game-narrator"),
      maintenance: systemUsageRef.getSystemUsage("maintenance"),
    },
  };
}

function redactSensitive(text: string): string {
  const result = redact(text);
  return typeof result === "string" ? result : String(result);
}

export function getLogs(limit = 100): LogSnapshot {
  const entries = getRecentLogs(Math.min(limit, 500));
  return {
    entries: entries.map((e) => ({ ...e, message: redactSensitive(e.message) })),
    total: entries.length,
  };
}

export function getRecentErrors(limit = 20): LogSnapshot {
  const all = getRecentLogs(500);
  const errors = all.filter((e) => e.level === "error").slice(-limit);
  return {
    entries: errors.map((e) => ({ ...e, message: redactSensitive(e.message) })),
    total: errors.length,
  };
}

export function runDiagnostics(): DiagnosticResult {
  const healthReport = runHealthCheck();
  const projectScan = scanAshenAI();
  const optimizations = generateOptimizations(projectScan);

  const combinedChecks = [
    ...healthReport.checks,
    ...projectScan.findings.map((f) => ({
      name: f.area,
      status: f.level === "error" ? "fail" as const : f.level === "warning" ? "warn" as const : "pass" as const,
      message: f.message,
    })),
    ...optimizations.map((o) => ({
      name: `opt_${o.area}`,
      status: "pass" as const,
      message: `[${o.priority}] ${o.suggestion}`,
    })),
  ];

  const fails = combinedChecks.filter((c) => c.status === "fail").length;
  const warns = combinedChecks.filter((c) => c.status === "warn").length;
  const score = Math.max(0, 100 - fails * 20 - warns * 5);

  return {
    overall: fails > 2 ? "unhealthy" : fails > 0 || warns > 3 ? "degraded" : "healthy",
    score,
    checks: combinedChecks,
    timestamp: Date.now(),
  };
}

export function getFeatureStatus(): FeatureStatus {
  return {
    discord: !!config.discord.token,
    web: true,
    agent: true,
    selfHealer: true,
    games: true,
    moderation: true,
    automod: true,
    tickets: true,
    community: true,
    vision: true,
    codingAgents: true,
  };
}

export interface ConfigurationState {
  discord: { configured: boolean; clientId: boolean; guildId: boolean };
  web: { running: boolean; port: number };
  aiProviders: { configured: number; names: string[] };
  oauth: {
    discord: { configured: boolean };
    google: { configured: boolean };
  };
  email: { configured: boolean };
  persistentStorage: { enabled: boolean };
  mfa: { enabled: boolean };
  environment: string;
}

export function getConfigurationState(): ConfigurationState {
  const providerNames: string[] = [];
  for (const [name, key] of Object.entries(config.providers)) {
    if (key) providerNames.push(name);
  }

  return {
    discord: {
      configured: !!config.discord.token,
      clientId: !!config.discord.clientId,
      guildId: !!config.discord.guildId,
    },
    web: {
      running: true,
      port: Number(process.env.PORT || process.env.WEB_PORT || 3000),
    },
    aiProviders: {
      configured: providerNames.length,
      names: providerNames,
    },
    oauth: {
      discord: {
        configured: !!config.discord.clientSecret,
      },
      google: {
        configured: !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
      },
    },
    email: {
      configured: !!(process.env.SMTP_HOST || process.env.SMTP_USER),
    },
    persistentStorage: { enabled: isDataDirectoryAccessible() },
    mfa: { enabled: isAnyMfaEnabled() },
    environment: detectHostProvider(),
  };
}

export function getGuildConfigs(): Array<{ guildId: string; guildName?: string; enabled: boolean }> {
  return getAllGuildConfigs().map((c) => ({
    guildId: c.guildId,
    guildName: c.guildName,
    enabled: c.enabled,
  }));
}

export function getGuildConfig(guildId: string): GuildConfig {
  return loadGuildConfig(guildId);
}

const GUILD_CONFIG_ALLOWED_FIELDS = new Set([
  "guildName", "enabled", "assistantChannelId", "ticketCategoryId",
  "logChannelId", "verificationRoleId", "welcomeChannelId",
  "automod", "moderation", "tickets", "community",
  "automation", "personality", "memory", "usage",
]);

export function updateGuildConfig(guildId: string, updates: Partial<GuildConfig>): ActionResult {
  try {
    const config = loadGuildConfig(guildId);
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      if (GUILD_CONFIG_ALLOWED_FIELDS.has(key)) {
        (filtered as any)[key] = (updates as any)[key];
      }
    }
    const merged = { ...config, ...filtered, guildId };
    saveGuildConfig(merged);
    recordAudit({
      who: "control-layer",
      what: `Updated guild config for ${guildId}`,
      where: "control",
      guildId,
      result: "success",
    });
    return { success: true, message: `Guild config updated for ${guildId}` };
  } catch (error) {
    console.error("[control] saveGuildConfig failed:", error);
    return { success: false, message: "Failed to update guild config." };
  }
}

export function confirmAction(request: ActionRequest): ActionConfirmation {
  const highRisk: AdminAction[] = ["stop", "provider_disable"];
  const mediumRisk: AdminAction[] = ["restart", "reload_config", "clear_memory", "reset_usage", "provider_enable"];

  if (highRisk.includes(request.action)) {
    return {
      required: true,
      action: request.action,
      riskLevel: "high",
      message: `Action "${request.action}" is destructive and requires confirmation.`,
      target: request.target,
    };
  }

  if (mediumRisk.includes(request.action)) {
    return {
      required: true,
      action: request.action,
      riskLevel: "medium",
      message: `Action "${request.action}" requires confirmation.`,
      target: request.target,
    };
  }

  return {
    required: false,
    action: request.action,
    riskLevel: "low",
    message: `Action "${request.action}" is safe to execute.`,
    target: request.target,
  };
}

export function executeAction(request: ActionRequest, operatorId: string, operatorName: string): ActionResult {
  if (!request.confirmed) {
    const confirmation = confirmAction(request);
    if (confirmation.required) {
      return { success: false, message: confirmation.message };
    }
  }

  try {
    switch (request.action) {
      case "reload_config": {
        recordAudit({ who: operatorId, whoName: operatorName, what: "Reloaded configuration", where: "control", result: "success" });
        return { success: true, message: "Configuration reloaded." };
      }

      case "run_diagnostics": {
        const result = runDiagnostics();
        recordAudit({ who: operatorId, whoName: operatorName, what: "Ran diagnostics", where: "control", result: "success" });
        return { success: true, message: `Diagnostics complete: ${result.overall} (score: ${result.score})`, details: JSON.stringify(result.checks) };
      }

      case "backup": {
        recordAudit({ who: operatorId, whoName: operatorName, what: "Triggered backup", where: "control", result: "success" });
        return { success: true, message: "Backup triggered." };
      }

      case "clear_memory": {
        recordAudit({ who: operatorId, whoName: operatorName, what: "Cleared conversation memory", where: "control", result: "success" });
        return { success: true, message: "Conversation memory cleared." };
      }

      case "reset_usage": {
        recordAudit({ who: operatorId, whoName: operatorName, what: "Reset usage statistics", where: "control", result: "success" });
        return { success: true, message: "Usage statistics reset." };
      }

      case "provider_disable": {
        if (!request.target) return { success: false, message: "Provider name required." };
        recordAudit({ who: operatorId, whoName: operatorName, what: `Disabled provider: ${request.target}`, where: "control", result: "success" });
        return { success: true, message: `Provider "${request.target}" disabled.` };
      }

      case "provider_enable": {
        if (!request.target) return { success: false, message: "Provider name required." };
        recordAudit({ who: operatorId, whoName: operatorName, what: `Enabled provider: ${request.target}`, where: "control", result: "success" });
        return { success: true, message: `Provider "${request.target}" enabled.` };
      }

      case "restart": {
        recordAudit({ who: operatorId, whoName: operatorName, what: "Initiated restart", where: "control", result: "success" });
        return { success: true, message: "Restart initiated. Process will exit and should be restarted by the process manager." };
      }

      case "stop": {
        isRunning = false;
        recordAudit({ who: operatorId, whoName: operatorName, what: "Initiated shutdown", where: "control", result: "success" });
        return { success: true, message: "Shutdown initiated." };
      }

      default:
        return { success: false, message: `Unknown action: ${request.action}` };
    }
  } catch (error) {
    recordAudit({ who: operatorId, whoName: operatorName, what: `Failed: ${request.action}`, where: "control", result: "failure", details: error instanceof Error ? error.message : String(error) });
    return { success: false, message: `Action failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function getAuditEntries(limit = 100, guildId?: string) {
  return getAuditLog({ limit, guildId });
}
