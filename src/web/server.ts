import express, { Request, Response } from "express";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { AIRouter } from "../ai/router";
import { UsageManager } from "../ai/usage-manager";
import {
  getRecentLogs,
  subscribeLogs,
} from "../log-stream";
import { UsageStats } from "../analytics/usage-stats";
import {
  authenticateOwner,
  validateSession,
  destroySession,
  createLoginRateLimiter,
  setSessionCookie,
  getSessionFromCookie,
  clearSessionCookie,
} from "../control/auth";
import {
  initControlLayer,
  getStatus,
  getHealth,
  getSystemInfo,
  getProviderStatus,
  getProviderPerformance,
  getCurrentModel,
  getMemoryStats,
  getUsageStats,
  getSystemUsageStats,
  getLogs,
  getRecentErrors,
  runDiagnostics,
  getFeatureStatus,
  getGuildConfigs,
  getGuildConfig,
  updateGuildConfig,
  confirmAction,
  executeAction,
  getAuditEntries,
} from "../control";
import {
  getStatus as getSeraphStatus,
  runDoctor as runSeraphDoctor,
  runInvestigation,
  getReports as getSeraphReports,
  generateReport as generateSeraphReport,
  getTools as getSeraphTools,
  getMonitoringInfo,
  getSystemInformation,
} from "../seraph";

const app = express();
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || process.env.WEB_PORT || 3000);

let router: AIRouter;
let usageManager: UsageManager;
let usageStats: UsageStats;
let getHealthStatus: (() => { discordReady: boolean }) | null = null;
let getVersionFn: () => string = () => "unknown";

function getVersion(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "unknown";
  }
}

const VERSION = getVersion();

const loginRateLimiter = createLoginRateLimiter();

function requireOwner(req: Request, res: Response, next: () => void) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const sessionId = getSessionFromCookie(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ ok: false, error: "Authentication required." });
    return;
  }
  const session = validateSession(sessionId, ip);
  if (!session) {
    clearSessionCookie(res);
    res.status(401).json({ ok: false, error: "Session expired or invalid." });
    return;
  }
  (req as any).ownerSession = session;
  next();
}

app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ==================== PUBLIC ==================== */

app.get("/api/health", (_req: Request, res: Response) => {
  const health = getHealthStatus ? getHealthStatus() : { discordReady: false };
  const available = router.getAvailableProviders();
  const ok = health.discordReady && available.length > 0;
  res.status(ok ? 200 : 503).json({
    ok, name: "AshenAI", version: VERSION, uptime: Math.floor(process.uptime()),
    discord: { ready: health.discordReady },
    providers: { available: available.length, names: available.map((p) => p.name) },
  });
});

/* ==================== OWNER AUTH ==================== */

app.post("/auth/login", (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const { username, password } = req.body || {};

  if (!username || !password) {
    res.status(400).json({ ok: false, error: "Username and password required." });
    return;
  }

  const rateCheck = loginRateLimiter.check(ip);
  if (!rateCheck.allowed) {
    const retrySeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1000);
    res.status(429).json({ ok: false, error: `Too many login attempts. Try again in ${retrySeconds}s.` });
    return;
  }

  const result = authenticateOwner(username, password, ip);
  if (!result.success) {
    res.status(401).json({ ok: false, error: result.reason === "not_configured" ? "Owner credentials not configured." : "Invalid credentials." });
    return;
  }

  setSessionCookie(res, result.sessionId!, result.expiresAt!);
  res.json({ ok: true, user: { username } });
});

app.post("/auth/logout", (req: Request, res: Response) => {
  const sessionId = getSessionFromCookie(req.headers.cookie);
  if (sessionId) destroySession(sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const sessionId = getSessionFromCookie(req.headers.cookie);
  if (!sessionId) {
    res.json({ ok: true, authenticated: false });
    return;
  }
  const session = validateSession(sessionId, ip);
  if (!session) {
    res.json({ ok: true, authenticated: false });
    return;
  }
  res.json({ ok: true, authenticated: true, user: { username: session.ownerUsername } });
});

/* ==================== CONTROL LAYER APIs ==================== */

app.get("/api/system/status", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, status: getStatus() });
});

app.get("/api/system/health", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, health: getHealth() });
});

app.get("/api/system/info", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, info: getSystemInfo() });
});

app.get("/api/system/diagnostics", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, diagnostics: runDiagnostics() });
});

app.get("/api/system/features", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, features: getFeatureStatus() });
});

app.get("/api/providers/status", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, providers: getProviderStatus() });
});

app.get("/api/providers/performance", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, performance: getProviderPerformance() });
});

app.get("/api/providers/current", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, model: getCurrentModel() });
});

app.get("/api/memory/stats", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, memory: getMemoryStats() });
});

app.get("/api/usage/global", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, usage: getUsageStats() });
});

app.get("/api/usage/system", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, systemUsage: getSystemUsageStats() });
});

app.get("/api/logs", requireOwner, (req: Request, res: Response) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "100", 10) || 100;
  res.json({ ok: true, logs: getLogs(limit) });
});

app.get("/api/logs/errors", requireOwner, (req: Request, res: Response) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "20", 10) || 20;
  res.json({ ok: true, errors: getRecentErrors(limit) });
});

app.get("/api/audit", requireOwner, (req: Request, res: Response) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "100", 10) || 100;
  const guildId = typeof req.query.guildId === "string" ? req.query.guildId : undefined;
  res.json({ ok: true, entries: getAuditEntries(limit, guildId) });
});

/* ==================== GUILD MANAGEMENT ==================== */

app.get("/api/guilds", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, guilds: getGuildConfigs() });
});

app.get("/api/guilds/:guildId", requireOwner, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  res.json({ ok: true, config: getGuildConfig(guildId) });
});

app.put("/api/guilds/:guildId", requireOwner, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const session = (req as any).ownerSession;
  const result = updateGuildConfig(guildId, req.body);
  if (result.success) {
    res.json({ ok: true, message: result.message });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

/* ==================== ADMIN ACTIONS ==================== */

app.post("/api/actions/confirm", requireOwner, (req: Request, res: Response) => {
  const { action, target } = req.body || {};
  if (!action) {
    res.status(400).json({ ok: false, error: "Action required." });
    return;
  }
  const confirmation = confirmAction({ action, target });
  res.json({ ok: true, confirmation });
});

app.post("/api/actions/execute", requireOwner, (req: Request, res: Response) => {
  const session = (req as any).ownerSession;
  const { action, target, reason, confirmed } = req.body || {};
  if (!action) {
    res.status(400).json({ ok: false, error: "Action required." });
    return;
  }
  const result = executeAction(
    { action, target, reason, confirmed },
    session.ownerUsername,
    session.ownerUsername,
  );
  if (result.success) {
    res.json({ ok: true, message: result.message });
  } else {
    res.status(400).json({ ok: false, error: result.message });
  }
});

/* ==================== SERAPH APIs ==================== */

app.get("/api/seraph/status", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, seraph: getSeraphStatus() });
});

app.get("/api/seraph/doctor", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, doctor: runSeraphDoctor() });
});

app.post("/api/seraph/investigate", requireOwner, (req: Request, res: Response) => {
  const { problem } = req.body || {};
  if (!problem) {
    res.status(400).json({ ok: false, error: "Problem description required." });
    return;
  }
  res.json({ ok: true, investigation: runInvestigation(problem) });
});

app.get("/api/seraph/reports", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, reports: getSeraphReports() });
});

app.post("/api/seraph/reports/generate", requireOwner, (req: Request, res: Response) => {
  const { type } = req.body || {};
  const validTypes = ["health", "performance", "security", "diagnostic"];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({ ok: false, error: `Type must be one of: ${validTypes.join(", ")}` });
    return;
  }
  res.json({ ok: true, report: generateSeraphReport(type) });
});

app.get("/api/seraph/tools", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, tools: getSeraphTools() });
});

app.get("/api/seraph/monitoring", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, monitoring: getMonitoringInfo() });
});

app.get("/api/seraph/system", requireOwner, (_req: Request, res: Response) => {
  res.json({ ok: true, system: getSystemInformation() });
});

/* ==================== LOG STREAM ==================== */

app.get("/api/logs/stream", requireOwner, (req: Request, res: Response) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (entry: ReturnType<typeof getRecentLogs>[number]) => {
    res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
  };
  for (const entry of getRecentLogs(100)) send(entry);
  const unsubscribe = subscribeLogs(send);
  const heartbeat = setInterval(() => { res.write(": heartbeat\n\n"); }, 15_000);
  req.on("close", () => { clearInterval(heartbeat); unsubscribe(); res.end(); });
});

/* ==================== PAGES ==================== */

app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/{*splat}", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ==================== START ==================== */

export function startWebServer(
  webRouter: AIRouter,
  healthStatus: () => { discordReady: boolean },
  webUsageManager?: UsageManager,
  webUsageStats?: UsageStats,
  versionFn?: () => string,
  webMemory?: any,
  webSystemUsage?: any,
): void {
  router = webRouter;
  getHealthStatus = healthStatus;
  if (webUsageManager) usageManager = webUsageManager;
  if (webUsageStats) usageStats = webUsageStats;
  if (versionFn) getVersionFn = versionFn;

  initControlLayer(webRouter, usageManager!, webMemory || {} as any, getVersionFn, webSystemUsage);

  app.listen(PORT, "0.0.0.0", () => {
    console.log("🌐 ===============================");
    console.log(`🌐 AshenAI Web listening on port ${PORT}`);
    console.log("🌐 ===============================");
  });
}
