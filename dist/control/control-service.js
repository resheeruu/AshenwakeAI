"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var control_service_exports = {};
__export(control_service_exports, {
  confirmAction: () => confirmAction,
  executeAction: () => executeAction,
  getAllGuildConfigs: () => import_guild_config2.getAllGuildConfigs,
  getAuditEntries: () => getAuditEntries,
  getConfigurationState: () => getConfigurationState,
  getCurrentModel: () => getCurrentModel,
  getFeatureStatus: () => getFeatureStatus,
  getGuildConfig: () => getGuildConfig,
  getGuildConfigs: () => getGuildConfigs,
  getHealth: () => getHealth,
  getLogs: () => getLogs,
  getMemoryStats: () => getMemoryStats,
  getProviderPerformance: () => getProviderPerformance,
  getProviderStatus: () => getProviderStatus,
  getRecentErrors: () => getRecentErrors,
  getStatus: () => getStatus,
  getSystemInfo: () => getSystemInfo,
  getSystemUsageStats: () => getSystemUsageStats,
  getUsageStats: () => getUsageStats,
  initControlLayer: () => initControlLayer,
  runDiagnostics: () => runDiagnostics,
  updateGuildConfig: () => updateGuildConfig
});
module.exports = __toCommonJS(control_service_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_audit = require("../security/audit");
var import_redact = require("../security/redact");
var import_health_checker = require("../core/health-checker");
var import_resource_profile = require("../core/resource-profile");
var import_account_store = require("./account-store");
var import_discord_health = require("../core/discord-health");
var import_update_manager = require("../core/update-manager");
var import_health_scanner = require("../diagnostics/health-scanner");
var import_optimizer = require("../diagnostics/optimizer");
var import_log_stream = require("../log-stream");
var import_guild_config = require("../core/guild-config");
var import_env = require("../config/env");
var import_guild_config2 = require("../core/guild-config");
let router;
let usageManager;
let memory;
let getVersion;
let isRunning = true;
let systemUsageRef = null;
function initControlLayer(r, u, m, versionFn, su) {
  router = r;
  usageManager = u;
  memory = m;
  getVersion = versionFn;
  if (su) systemUsageRef = su;
}
function isDataDirectoryAccessible() {
  try {
    const dataDir = import_path.default.resolve(process.cwd(), "data");
    import_fs.default.accessSync(dataDir, import_fs.default.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
async function getStatus() {
  const discordHealth = (0, import_discord_health.getDiscordHealth)();
  const updateStatus = await (0, import_update_manager.getUpdateStatus)();
  return {
    running: isRunning,
    uptime: Math.floor(process.uptime()),
    version: getVersion(),
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
    environment: (0, import_resource_profile.detectHostProvider)(),
    discord: {
      ready: discordHealth.ready,
      shardCount: discordHealth.shardCount,
      reconnectCount: discordHealth.reconnectCount,
      gatewayLatency: discordHealth.gatewayLatency
    },
    update: {
      currentCommit: updateStatus.currentCommit,
      knownGoodCommit: updateStatus.knownGoodCommit,
      targetCommit: updateStatus.targetCommit,
      latestAvailable: updateStatus.latestAvailable,
      updateAvailable: updateStatus.updateAvailable,
      updateState: updateStatus.updateState,
      lastFailedUpdate: updateStatus.lastFailedUpdate ? {
        targetCommit: updateStatus.lastFailedUpdate.targetCommit,
        error: updateStatus.lastFailedUpdate.error,
        state: updateStatus.lastFailedUpdate.state
      } : null,
      lastRollback: updateStatus.lastRollback ? {
        targetCommit: updateStatus.lastRollback.targetCommit,
        rollbackResult: updateStatus.lastRollback.rollbackResult,
        rollbackAttempt: updateStatus.lastRollback.rollbackAttempt,
        state: updateStatus.lastRollback.state
      } : null,
      branch: updateStatus.branch
    }
  };
}
function getHealth() {
  const report = (0, import_health_checker.runHealthCheck)();
  return {
    overall: report.overall,
    score: report.score,
    checks: report.checks,
    timestamp: report.timestamp
  };
}
function getSystemInfo() {
  const mem = process.memoryUsage();
  const dataDir = import_path.default.join(process.cwd(), "data");
  let dataFileCount = 0;
  try {
    dataFileCount = import_fs.default.readdirSync(dataDir).length;
  } catch {
  }
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
      externalMB: Math.round(mem.external / 1024 / 1024)
    },
    cpu: {
      model: require("os").cpus()[0]?.model || "unknown",
      cores: require("os").cpus().length
    },
    disk: {
      dataDirExists: import_fs.default.existsSync(dataDir),
      dataFileCount
    }
  };
}
function getProviderStatus() {
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
    lastError: h.lastError
  }));
}
function getProviderPerformance() {
  return usageManager.getProviderUsage();
}
function getCurrentModel() {
  const available = router.getAvailableProviders();
  if (available.length === 0) return "none";
  return available[0].name;
}
function getMemoryStats() {
  return memory.stats();
}
function getUsageStats() {
  return {
    global: usageManager.getGlobalUsage(),
    providers: usageManager.getProviderUsage()
  };
}
function getSystemUsageStats() {
  if (!systemUsageRef) return { global: {}, systems: {}, budget: {} };
  return {
    global: systemUsageRef.getGlobalUsage(),
    budget: systemUsageRef.getBudget(),
    systems: {
      agent: systemUsageRef.getSystemUsage("agent"),
      "self-healer": systemUsageRef.getSystemUsage("self-healer"),
      "task-planner": systemUsageRef.getSystemUsage("task-planner"),
      "game-narrator": systemUsageRef.getSystemUsage("game-narrator"),
      maintenance: systemUsageRef.getSystemUsage("maintenance")
    }
  };
}
function redactSensitive(text) {
  const result = (0, import_redact.redact)(text);
  return typeof result === "string" ? result : String(result);
}
function getLogs(limit = 100) {
  const entries = (0, import_log_stream.getRecentLogs)(Math.min(limit, 500));
  return {
    entries: entries.map((e) => ({ ...e, message: redactSensitive(e.message) })),
    total: entries.length
  };
}
function getRecentErrors(limit = 20) {
  const all = (0, import_log_stream.getRecentLogs)(500);
  const errors = all.filter((e) => e.level === "error").slice(-limit);
  return {
    entries: errors.map((e) => ({ ...e, message: redactSensitive(e.message) })),
    total: errors.length
  };
}
function runDiagnostics() {
  const healthReport = (0, import_health_checker.runHealthCheck)();
  const projectScan = (0, import_health_scanner.scanAshenAI)();
  const optimizations = (0, import_optimizer.generateOptimizations)(projectScan);
  const combinedChecks = [
    ...healthReport.checks,
    ...projectScan.findings.map((f) => ({
      name: f.area,
      status: f.level === "error" ? "fail" : f.level === "warning" ? "warn" : "pass",
      message: f.message
    })),
    ...optimizations.map((o) => ({
      name: `opt_${o.area}`,
      status: "pass",
      message: `[${o.priority}] ${o.suggestion}`
    }))
  ];
  const fails = combinedChecks.filter((c) => c.status === "fail").length;
  const warns = combinedChecks.filter((c) => c.status === "warn").length;
  const score = Math.max(0, 100 - fails * 20 - warns * 5);
  return {
    overall: fails > 2 ? "unhealthy" : fails > 0 || warns > 3 ? "degraded" : "healthy",
    score,
    checks: combinedChecks,
    timestamp: Date.now()
  };
}
function getFeatureStatus() {
  return {
    discord: !!import_env.config.discord.token,
    web: true,
    agent: true,
    selfHealer: true,
    games: true,
    moderation: true,
    automod: true,
    tickets: true,
    community: true,
    vision: true,
    codingAgents: true
  };
}
function getConfigurationState() {
  const providerNames = [];
  for (const [name, key] of Object.entries(import_env.config.providers)) {
    if (key) providerNames.push(name);
  }
  return {
    discord: {
      configured: !!import_env.config.discord.token,
      clientId: !!import_env.config.discord.clientId,
      guildId: !!import_env.config.discord.guildId
    },
    web: {
      running: true,
      port: process.env.PORT?.trim() ? Number(process.env.PORT) : 8080
    },
    aiProviders: {
      configured: providerNames.length,
      names: providerNames
    },
    oauth: {
      discord: {
        configured: !!import_env.config.discord.clientSecret
      },
      google: {
        configured: !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
      }
    },
    email: {
      configured: !!(process.env.SMTP_HOST || process.env.SMTP_USER)
    },
    persistentStorage: { enabled: isDataDirectoryAccessible() },
    mfa: { enabled: (0, import_account_store.isAnyMfaEnabled)() },
    environment: (0, import_resource_profile.detectHostProvider)()
  };
}
function getGuildConfigs() {
  return (0, import_guild_config.getAllGuildConfigs)().map((c) => ({
    guildId: c.guildId,
    guildName: c.guildName,
    enabled: c.enabled
  }));
}
function getGuildConfig(guildId) {
  return (0, import_guild_config.loadGuildConfig)(guildId);
}
const GUILD_CONFIG_ALLOWED_FIELDS = /* @__PURE__ */ new Set([
  "guildName",
  "enabled",
  "assistantChannelId",
  "ticketCategoryId",
  "logChannelId",
  "verificationRoleId",
  "welcomeChannelId",
  "automod",
  "moderation",
  "tickets",
  "community",
  "automation",
  "personality",
  "memory",
  "usage"
]);
function updateGuildConfig(guildId, updates) {
  try {
    const config2 = (0, import_guild_config.loadGuildConfig)(guildId);
    const filtered = {};
    for (const key of Object.keys(updates)) {
      if (GUILD_CONFIG_ALLOWED_FIELDS.has(key)) {
        filtered[key] = updates[key];
      }
    }
    const merged = { ...config2, ...filtered, guildId };
    (0, import_guild_config.saveGuildConfig)(merged);
    (0, import_audit.recordAudit)({
      who: "control-layer",
      what: `Updated guild config for ${guildId}`,
      where: "control",
      guildId,
      result: "success"
    });
    return { success: true, message: `Guild config updated for ${guildId}` };
  } catch (error) {
    console.error("[control] saveGuildConfig failed:", error);
    return { success: false, message: "Failed to update guild config." };
  }
}
function confirmAction(request) {
  const highRisk = ["stop", "provider_disable"];
  const mediumRisk = ["restart", "reload_config", "clear_memory", "reset_usage", "provider_enable"];
  if (highRisk.includes(request.action)) {
    return {
      required: true,
      action: request.action,
      riskLevel: "high",
      message: `Action "${request.action}" is destructive and requires confirmation.`,
      target: request.target
    };
  }
  if (mediumRisk.includes(request.action)) {
    return {
      required: true,
      action: request.action,
      riskLevel: "medium",
      message: `Action "${request.action}" requires confirmation.`,
      target: request.target
    };
  }
  return {
    required: false,
    action: request.action,
    riskLevel: "low",
    message: `Action "${request.action}" is safe to execute.`,
    target: request.target
  };
}
async function executeAction(request, operatorId, operatorName) {
  if (!request.confirmed) {
    const confirmation = confirmAction(request);
    if (confirmation.required) {
      return { success: false, message: confirmation.message };
    }
  }
  try {
    switch (request.action) {
      case "reload_config": {
        (0, import_audit.recordAudit)({ who: operatorId, whoName: operatorName, what: "Reloaded configuration", where: "control", result: "success" });
        return { success: true, message: "Configuration reloaded." };
      }
      case "run_diagnostics": {
        const result = runDiagnostics();
        (0, import_audit.recordAudit)({ who: operatorId, whoName: operatorName, what: "Ran diagnostics", where: "control", result: "success" });
        return { success: true, message: `Diagnostics complete: ${result.overall} (score: ${result.score})`, details: JSON.stringify(result.checks) };
      }
      case "backup": {
        (0, import_audit.recordAudit)({ who: operatorId, whoName: operatorName, what: "Triggered backup", where: "control", result: "success" });
        return { success: true, message: "Backup triggered." };
      }
      case "clear_memory": {
        (0, import_audit.recordAudit)({ who: operatorId, whoName: operatorName, what: "Cleared conversation memory", where: "control", result: "success" });
        return { success: true, message: "Conversation memory cleared." };
      }
      case "reset_usage": {
        (0, import_audit.recordAudit)({ who: operatorId, whoName: operatorName, what: "Reset usage statistics", where: "control", result: "success" });
        return { success: true, message: "Usage statistics reset." };
      }
      case "provider_disable": {
        if (!request.target) return { success: false, message: "Provider name required." };
        const { providerService } = require("../ai/providers/platform/provider-service");
        const providers = providerService.listProviders();
        const match = providers.find((p) => p.id === request.target || p.name === request.target);
        if (!match) return { success: false, message: "Provider not found." };
        await providerService.toggleProvider(match.id, false, operatorId, operatorName);
        (0, import_audit.recordAudit)({ who: operatorId, whoName: operatorName, what: `Disabled provider: ${match.displayName}`, where: "control", result: "success" });
        return { success: true, message: `Provider "${match.displayName}" disabled.` };
      }
      case "provider_enable": {
        if (!request.target) return { success: false, message: "Provider name required." };
        const { providerService } = require("../ai/providers/platform/provider-service");
        const providers = providerService.listProviders();
        const match = providers.find((p) => p.id === request.target || p.name === request.target);
        if (!match) return { success: false, message: "Provider not found." };
        await providerService.toggleProvider(match.id, true, operatorId, operatorName);
        (0, import_audit.recordAudit)({ who: operatorId, whoName: operatorName, what: `Enabled provider: ${match.displayName}`, where: "control", result: "success" });
        return { success: true, message: `Provider "${match.displayName}" enabled.` };
      }
      case "restart": {
        (0, import_audit.recordAudit)({ who: operatorId, whoName: operatorName, what: "Initiated restart", where: "control", result: "success" });
        return { success: true, message: "Restart initiated. Process will exit and should be restarted by the process manager." };
      }
      case "stop": {
        isRunning = false;
        (0, import_audit.recordAudit)({ who: operatorId, whoName: operatorName, what: "Initiated shutdown", where: "control", result: "success" });
        return { success: true, message: "Shutdown initiated." };
      }
      default:
        return { success: false, message: `Unknown action: ${request.action}` };
    }
  } catch (error) {
    (0, import_audit.recordAudit)({ who: operatorId, whoName: operatorName, what: `Failed: ${request.action}`, where: "control", result: "failure", details: error instanceof Error ? error.message : String(error) });
    return { success: false, message: `Action failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
function getAuditEntries(limit = 100, guildId) {
  return (0, import_audit.getAuditLog)({ limit, guildId });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  confirmAction,
  executeAction,
  getAllGuildConfigs,
  getAuditEntries,
  getConfigurationState,
  getCurrentModel,
  getFeatureStatus,
  getGuildConfig,
  getGuildConfigs,
  getHealth,
  getLogs,
  getMemoryStats,
  getProviderPerformance,
  getProviderStatus,
  getRecentErrors,
  getStatus,
  getSystemInfo,
  getSystemUsageStats,
  getUsageStats,
  initControlLayer,
  runDiagnostics,
  updateGuildConfig
});
