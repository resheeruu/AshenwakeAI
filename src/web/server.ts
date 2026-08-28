import express, { Request, Response } from "express";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { AIRouter } from "../ai/router";
import { UsageManager } from "../ai/usage-manager";
import { logger } from "../logger";
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
  validateCsrfToken,
  getCsrfToken,
  rotateSession,
  destroyAllSessionsForAccount,
} from "../control/auth";
import {
  requireAuth,
  requireRole,
  requireCsrf,
  type AuthenticatedRequest,
} from "../control/roles";
import {
  listAccounts,
  createAccount,
  updateAccount,
  updateAccountCredentials,
  deleteAccount,
  changePassword,
  getAccountById,
  hashPassword,
  verifyPassword,
  sanitizeAccount,
} from "../control/account-store";
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

/* ==================== SECURITY HEADERS ==================== */
app.use((_req: Request, res: Response, next: () => void) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.setHeader("X-XSS-Protection", "0");
  res.removeHeader("X-Powered-By");
  next();
});

/* ==================== CORS ==================== */
const ALLOWED_ORIGINS = (process.env.ASHENAI_CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length > 0 && origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

/* ==================== GLOBAL RATE LIMITER ==================== */
const apiRequestCounts = new Map<string, number[]>();
const API_RATE_WINDOW_MS = 60_000;
const API_RATE_MAX = 120;

function globalRateLimit(req: Request, res: Response, next: () => void) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const hits = (apiRequestCounts.get(ip) || []).filter((t) => now - t < API_RATE_WINDOW_MS);
  if (hits.length >= API_RATE_MAX) {
    res.status(429).json({ ok: false, error: "Rate limit exceeded." });
    return;
  }
  hits.push(now);
  apiRequestCounts.set(ip, hits);
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of apiRequestCounts) {
    const recent = hits.filter((t) => now - t < API_RATE_WINDOW_MS);
    if (recent.length === 0) apiRequestCounts.delete(ip);
    else apiRequestCounts.set(ip, recent);
  }
}, API_RATE_WINDOW_MS).unref();

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

app.use(express.json({ limit: "64kb" }));
app.use(globalRateLimit);
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

/* ==================== AUTH ==================== */

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
    const msg = result.reason === "not_configured"
      ? "Owner credentials not configured."
      : result.reason === "disabled"
        ? "Invalid credentials."
        : "Invalid credentials.";
    res.status(401).json({ ok: false, error: msg });
    return;
  }

  setSessionCookie(res, result.sessionId!, result.expiresAt!);
  res.json({
    ok: true,
    user: { username: result.username, role: result.role },
    csrfToken: result.csrfToken,
  });
});

app.post("/auth/logout", requireCsrf, (req: Request, res: Response) => {
  const sessionId = getSessionFromCookie(req.headers.cookie);
  if (sessionId) destroySession(sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", (req: Request, res: Response) => {
  const sessionId = getSessionFromCookie(req.headers.cookie);
  if (!sessionId) {
    res.json({ ok: true, authenticated: false });
    return;
  }

  const rotated = rotateSession(sessionId);
  if (rotated && rotated.newSessionId !== sessionId) {
    setSessionCookie(res, rotated.newSessionId, rotated.expiresAt);
  }

  const session = validateSession(rotated?.newSessionId || sessionId);
  if (!session) {
    res.json({ ok: true, authenticated: false });
    return;
  }

  const account = getAccountById(session.accountId);
  if (!account || !account.enabled) {
    clearSessionCookie(res);
    res.json({ ok: true, authenticated: false });
    return;
  }

  res.json({
    ok: true,
    authenticated: true,
    user: { username: account.username, role: session.role },
    csrfToken: session.csrfToken,
  });
});

/* ==================== PASSWORD CHANGE ==================== */

app.post("/auth/change-password", requireAuth, requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    res.status(400).json({ ok: false, error: "Current password and new password required." });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ ok: false, error: "New password must be at least 8 characters." });
    return;
  }

  const account = getAccountById(authReq.accountId!);
  if (!account) {
    res.status(401).json({ ok: false, error: "Account not found." });
    return;
  }

  if (!verifyPassword(currentPassword, account.passwordHash, account.passwordSalt)) {
    res.status(401).json({ ok: false, error: "Current password is incorrect." });
    return;
  }

  const { hash, salt } = hashPassword(newPassword);
  updateAccountCredentials(account.id, { passwordHash: hash, passwordSalt: salt });

  destroyAllSessionsForAccount(account.id);

  clearSessionCookie(res);
  res.json({ ok: true, message: "Password changed. Please log in again." });
});

/* ==================== ADMIN ENDPOINTS (requireAuth + admin role) ==================== */

app.get("/api/system/status", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, status: getStatus() });
});

app.get("/api/system/health", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, health: getHealth() });
});

app.get("/api/system/info", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, info: getSystemInfo() });
});

app.get("/api/system/diagnostics", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, diagnostics: runDiagnostics() });
});

app.get("/api/system/features", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, features: getFeatureStatus() });
});

app.get("/api/providers/status", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, providers: getProviderStatus() });
});

app.get("/api/providers/performance", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, performance: getProviderPerformance() });
});

app.get("/api/providers/current", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, model: getCurrentModel() });
});

app.get("/api/memory/stats", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, memory: getMemoryStats() });
});

app.get("/api/usage/global", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, usage: getUsageStats() });
});

app.get("/api/usage/system", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, systemUsage: getSystemUsageStats() });
});

app.get("/api/logs", requireAuth, requireRole("admin"), (req: Request, res: Response) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "100", 10) || 100;
  res.json({ ok: true, logs: getLogs(limit) });
});

app.get("/api/logs/errors", requireAuth, requireRole("admin"), (req: Request, res: Response) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "20", 10) || 20;
  res.json({ ok: true, errors: getRecentErrors(limit) });
});

app.get("/api/logs/stream", requireAuth, requireRole("admin"), (req: Request, res: Response) => {
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

app.get("/api/guilds", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, guilds: getGuildConfigs() });
});

app.get("/api/guilds/:guildId", requireAuth, requireRole("admin"), (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  res.json({ ok: true, config: getGuildConfig(guildId) });
});

app.get("/api/seraph/status", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, seraph: getSeraphStatus() });
});

app.get("/api/seraph/doctor", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, doctor: runSeraphDoctor() });
});

app.get("/api/seraph/reports", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, reports: getSeraphReports() });
});

app.get("/api/seraph/tools", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, tools: getSeraphTools() });
});

app.get("/api/seraph/monitoring", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, monitoring: getMonitoringInfo() });
});

app.get("/api/seraph/system", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, system: getSystemInformation() });
});

/* ==================== OWNER ENDPOINTS (requireAuth + owner role + CSRF) ==================== */

app.put("/api/guilds/:guildId", requireAuth, requireRole("owner"), requireCsrf, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const result = updateGuildConfig(guildId, req.body);
  if (result.success) {
    res.json({ ok: true, message: result.message });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

app.post("/api/actions/confirm", requireAuth, requireRole("owner"), requireCsrf, (req: Request, res: Response) => {
  const { action, target } = req.body || {};
  if (!action) {
    res.status(400).json({ ok: false, error: "Action required." });
    return;
  }
  const confirmation = confirmAction({ action, target });
  res.json({ ok: true, confirmation });
});

app.post("/api/actions/execute", requireAuth, requireRole("owner"), requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { action, target, reason, confirmed } = req.body || {};
  if (!action) {
    res.status(400).json({ ok: false, error: "Action required." });
    return;
  }
  const result = executeAction(
    { action, target, reason, confirmed },
    authReq.accountId!,
    authReq.username!,
  );
  if (result.success) {
    res.json({ ok: true, message: result.message });
  } else {
    res.status(400).json({ ok: false, error: result.message });
  }
});

app.get("/api/audit", requireAuth, requireRole("owner"), (req: Request, res: Response) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "100", 10) || 100;
  const guildId = typeof req.query.guildId === "string" ? req.query.guildId : undefined;
  res.json({ ok: true, entries: getAuditEntries(limit, guildId) });
});

app.post("/api/seraph/investigate", requireAuth, requireRole("owner"), requireCsrf, (req: Request, res: Response) => {
  const { problem } = req.body || {};
  if (!problem) {
    res.status(400).json({ ok: false, error: "Problem description required." });
    return;
  }
  res.json({ ok: true, investigation: runInvestigation(problem) });
});

app.post("/api/seraph/reports/generate", requireAuth, requireRole("owner"), requireCsrf, (req: Request, res: Response) => {
  const { type } = req.body || {};
  const validTypes = ["health", "performance", "security", "diagnostic"];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({ ok: false, error: `Type must be one of: ${validTypes.join(", ")}` });
    return;
  }
  res.json({ ok: true, report: generateSeraphReport(type) });
});

/* ==================== ACCOUNT MANAGEMENT (OWNER + CSRF) ==================== */

app.get("/api/accounts", requireAuth, requireRole("owner"), (_req: Request, res: Response) => {
  res.json({ ok: true, accounts: listAccounts() });
});

app.post("/api/accounts", requireAuth, requireRole("owner"), requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { username, password, role } = req.body || {};

  if (!username || !password || !role) {
    res.status(400).json({ ok: false, error: "Username, password, and role are required." });
    return;
  }

  const result = createAccount({ username, password, role });
  if (result.success) {
    const { recordAudit } = require("../security/audit");
    recordAudit({
      who: authReq.username!,
      what: `Created account: ${username} (role: ${role})`,
      where: "web-accounts",
      result: "success",
    });
    res.json({ ok: true, account: result.account });
  } else {
    res.status(400).json({ ok: false, error: result.error });
  }
});

app.put("/api/accounts/:id", requireAuth, requireRole("owner"), requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const id = String(req.params.id || "");
  const { username, role, enabled } = req.body || {};

  const updates: Record<string, unknown> = {};
  if (username !== undefined) updates.username = username;
  if (role !== undefined) updates.role = role;
  if (enabled !== undefined) updates.enabled = enabled;

  const result = updateAccount(id, updates as any);
  if (result.success) {
    const { recordAudit } = require("../security/audit");
    recordAudit({
      who: authReq.username!,
      what: `Updated account: ${id}`,
      where: "web-accounts",
      result: "success",
      details: JSON.stringify(Object.keys(updates)),
    });
    res.json({ ok: true, account: result.account });
  } else {
    res.status(400).json({ ok: false, error: result.error });
  }
});

app.delete("/api/accounts/:id", requireAuth, requireRole("owner"), requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const id = String(req.params.id || "");

  const account = getAccountById(id);
  if (!account) {
    res.status(404).json({ ok: false, error: "Account not found." });
    return;
  }

  if (account.id === authReq.accountId) {
    res.status(400).json({ ok: false, error: "Cannot delete your own account." });
    return;
  }

  const result = deleteAccount(id);
  if (result.success) {
    destroyAllSessionsForAccount(id);
    const { recordAudit } = require("../security/audit");
    recordAudit({
      who: authReq.username!,
      what: `Deleted account: ${account.username}`,
      where: "web-accounts",
      result: "success",
    });
    res.json({ ok: true });
  } else {
    res.status(400).json({ ok: false, error: result.error });
  }
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
    logger.info(`AshenAI Web listening on port ${PORT}`);
  });
}
