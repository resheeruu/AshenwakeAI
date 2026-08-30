import express, { Request, Response } from "express";
import crypto from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { AIRouter } from "../ai/router";
import { UsageManager } from "../ai/usage-manager";
import { logger } from "../logger";
import { recordAudit } from "../security/audit";
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
  consumePreAuthToken,
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
  createOAuthState,
  getDiscordAuthUrl,
  handleDiscordCallback,
  getGoogleAuthUrl,
  handleGoogleCallback,
} from "../control/oauth";
import {
  generateResetToken,
  validateResetToken,
  useResetToken,
  invalidateResetTokens,
} from "../control/password-reset";
import {
  sendPasswordResetEmail,
} from "../control/email-service";
import {
  createSession,
  listSessionsForAccount,
  revokeSession,
} from "../control/session-store";
import {
  getAccountIdentities,
  unlinkProviderFromAccount,
  hasProviderLinked,
} from "../control/linked-identities";
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
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
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

  // MFA required — return challenge state instead of full session
  if (result.mfaRequired) {
    res.json({
      ok: true,
      mfaRequired: true,
      challengeToken: result.challengeToken,
      username: result.username,
      role: result.role,
    });
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

  if (account.role !== session.role) {
    destroySession(rotated?.newSessionId || sessionId);
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

/* ==================== OAUTH - DISCORD ==================== */

app.get("/auth/discord", (req: Request, res: Response) => {
  const state = createOAuthState("discord", "login");
  const url = getDiscordAuthUrl(state);
  if (!url) {
    res.status(503).json({ ok: false, error: "Discord OAuth not configured." });
    return;
  }
  res.redirect(url);
});

app.get("/auth/discord/callback", async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";

  if (!code || !state) {
    res.status(400).send("Missing authorization code or state.");
    return;
  }

  const result = await handleDiscordCallback(code, state, ip);
  if (result.success && result.sessionId) {
    setSessionCookie(res, result.sessionId, result.expiresAt!);
    res.redirect("/?login=success&provider=discord");
  } else if (result.requiresLinking) {
    res.redirect(`/?link_required=true&provider=discord&linkToken=${result.linkToken}&accountId=${result.accountId}&username=${encodeURIComponent(result.username || "")}`);
  } else {
    res.redirect(`/?login=error&message=${encodeURIComponent(result.error || "OAuth failed")}`);
  }
});

/* ==================== OAUTH - GOOGLE ==================== */

app.get("/auth/google", (req: Request, res: Response) => {
  const state = createOAuthState("google", "login");
  const url = getGoogleAuthUrl(state);
  if (!url) {
    res.status(503).json({ ok: false, error: "Google OAuth not configured." });
    return;
  }
  res.redirect(url);
});

app.get("/auth/google/callback", async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";

  if (!code || !state) {
    res.status(400).send("Missing authorization code or state.");
    return;
  }

  const result = await handleGoogleCallback(code, state, ip);
  if (result.success && result.sessionId) {
    setSessionCookie(res, result.sessionId, result.expiresAt!);
    res.redirect("/?login=success&provider=google");
  } else if (result.requiresLinking) {
    res.redirect(`/?link_required=true&provider=google&linkToken=${result.linkToken}&accountId=${result.accountId}&username=${encodeURIComponent(result.username || "")}`);
  } else {
    res.redirect(`/?login=error&message=${encodeURIComponent(result.error || "OAuth failed")}`);
  }
});

/* ==================== FORGOT PASSWORD ==================== */

const forgotPasswordLimiter = createLoginRateLimiter();

app.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const { email } = req.body || {};

  // Always return generic response
  const genericResponse = { ok: true, message: "If that account exists, a password reset link has been sent." };

  if (!email || typeof email !== "string") {
    res.json(genericResponse);
    return;
  }

  const rateCheck = forgotPasswordLimiter.check(ip);
  if (!rateCheck.allowed) {
    res.json(genericResponse);
    return;
  }

  // Find account by email
  const allAccounts = listAccounts();
  const account = allAccounts.find((a) => a.email?.toLowerCase() === email.toLowerCase());

  if (account) {
    const fullAccount = getAccountById(account.id);
    if (fullAccount) {
      const resetToken = generateResetToken(fullAccount.id);
      recordAudit({
        who: fullAccount.username,
        what: "Password reset requested",
        where: "web-auth",
        result: "success",
        details: `IP: ${ip}`,
      });

      // Send reset email via EmailService
      const baseUrl = process.env.AUTH_BASE_URL || `http://${req.headers.host || "localhost"}`;
      await sendPasswordResetEmail(fullAccount.email!, fullAccount.id, resetToken, baseUrl);
    }
  }

  res.json(genericResponse);
});

const resetPasswordLimiter = createLoginRateLimiter();

app.post("/auth/reset-password", (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const { accountId, token, newPassword } = req.body || {};

  // Rate limit password reset attempts
  const rateCheck = resetPasswordLimiter.check(ip);
  if (!rateCheck.allowed) {
    const retrySeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1000);
    res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${retrySeconds}s.` });
    return;
  }

  if (!accountId || !token || !newPassword) {
    res.status(400).json({ ok: false, error: "Account ID, token, and new password are required." });
    return;
  }

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ ok: false, error: "Password must be at least 8 characters." });
    return;
  }

  if (!validateResetToken(accountId, token)) {
    res.status(400).json({ ok: false, error: "Invalid or expired reset token." });
    return;
  }

  const account = getAccountById(accountId);
  if (!account) {
    res.status(400).json({ ok: false, error: "Invalid reset token." });
    return;
  }

  // Use the token (marks as used)
  useResetToken(accountId, token);

  // Change password
  const { hash, salt } = hashPassword(newPassword);
  updateAccountCredentials(accountId, { passwordHash: hash, passwordSalt: salt });

  // Invalidate all sessions
  destroyAllSessionsForAccount(accountId);

  // Invalidate any remaining reset tokens
  invalidateResetTokens(accountId);

  recordAudit({
    who: account.username,
    what: "Password reset completed",
    where: "web-auth",
    result: "success",
  });

  res.json({ ok: true, message: "Password reset successful. Please log in." });
});

app.get("/auth/reset-password/:accountId/:token", (req: Request, res: Response) => {
  const accountId = typeof req.params.accountId === "string" ? req.params.accountId : "";
  const token = typeof req.params.token === "string" ? req.params.token : "";

  if (!accountId || !token) {
    res.status(400).send("Invalid reset link.");
    return;
  }

  if (!validateResetToken(accountId, token)) {
    res.status(400).send("Invalid or expired reset link.");
    return;
  }

  // Serve a simple reset password form
  // SECURITY: accountId and token are JSON-encoded + HTML-escaped to prevent XSS injection
  // JSON.stringify handles quotes/backslashes; we additionally escape </script> sequences
  const safeAccountId = JSON.stringify(accountId).replace(/<\/script/gi, "<\\/script");
  const safeToken = JSON.stringify(token).replace(/<\/script/gi, "<\\/script");
  res.send(`<!DOCTYPE html>
<html><head><title>Reset Password - AshenAI</title>
<style>body{font-family:system-ui;max-width:400px;margin:50px auto;padding:20px;background:#07070b;color:#f7f7fb}
input{width:100%;padding:10px;margin:8px 0;border:1px solid #333;border-radius:6px;background:#111;color:#fff;box-sizing:border-box}
button{width:100%;padding:10px;border:none;border-radius:6px;background:#9b7cff;color:#fff;font-weight:700;cursor:pointer;margin-top:8px}
.msg{color:#61e294;margin-top:10px}.err{color:#ff6f7d;margin-top:10px}</style></head>
<body><h2>Reset Password</h2>
<form onsubmit="return doReset()">
<input type="password" id="pw" placeholder="New password (min 8 chars)" required minlength="8">
<input type="password" id="pw2" placeholder="Confirm new password" required minlength="8">
<button type="submit">Reset Password</button>
<div id="msg"></div></form>
<script>
var RESETAccountId=${safeAccountId};
var RESETToken=${safeToken};
async function doReset(){
const pw=document.getElementById('pw').value;
const pw2=document.getElementById('pw2').value;
const msg=document.getElementById('msg');
if(pw!==pw2){msg.className='err';msg.textContent='Passwords do not match.';return false}
try{const r=await fetch('/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({accountId:RESETAccountId,token:RESETToken,newPassword:pw})});
const d=await r.json();if(d.ok){msg.className='msg';msg.textContent='Password reset! Redirecting to login...';
setTimeout(()=>window.location.href='/',2000)}else{msg.className='err';msg.textContent=d.error||'Reset failed'}}
catch(e){msg.className='err';msg.textContent='Network error'}return false}
</script></body></html>`);
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
  if (!problem || typeof problem !== "string") {
    res.status(400).json({ ok: false, error: "Problem description required." });
    return;
  }
  const sanitized = problem.trim().slice(0, 2000);
  res.json({ ok: true, investigation: runInvestigation(sanitized) });
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

/* ==================== ACCOUNT SECURITY (requireAuth) ==================== */

app.get("/api/account/security", requireAuth, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const account = getAccountById(authReq.accountId!);
  if (!account) {
    res.status(404).json({ ok: false, error: "Account not found." });
    return;
  }

  const identities = getAccountIdentities(account.id);
  res.json({
    ok: true,
    security: {
      email: account.email || null,
      emailVerified: account.emailVerified || false,
      mfaEnabled: account.mfaEnabled || false,
      hasPassword: !!account.passwordHash,
      linkedProviders: identities.map((i) => ({
        provider: i.provider,
        displayName: i.displayName,
        linkedAt: i.createdAt,
        lastUsedAt: i.lastUsedAt,
      })),
    },
  });
});

app.get("/api/account/sessions", requireAuth, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const sessions = listSessionsForAccount(authReq.accountId!);
  res.json({
    ok: true,
    sessions: sessions.map((s) => ({
      sessionId: s.sessionId.slice(0, 8) + "...",
      isCurrent: s.sessionId === authReq.sessionId,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      lastSeenIp: s.lastSeenIp,
    })),
  });
});

app.post("/api/account/sessions/:id/revoke", requireAuth, requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const sessionId = typeof req.params.id === "string" ? req.params.id : "";

  // For security, we need the full session ID - but we only sent prefix to frontend
  // This endpoint revokes ALL other sessions
  const sessions = listSessionsForAccount(authReq.accountId!);
  let revoked = 0;
  for (const s of sessions) {
    if (s.sessionId !== authReq.sessionId) {
      if (revokeSession(s.sessionId, authReq.accountId!)) {
        revoked++;
      }
    }
  }

  recordAudit({
    who: authReq.username!,
    what: "Sessions revoked",
    where: "web-auth",
    result: "success",
    details: `Revoked ${revoked} sessions`,
  });

  res.json({ ok: true, revoked });
});

app.post("/api/account/sessions/revoke-all", requireAuth, requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const count = destroyAllSessionsForAccount(authReq.accountId!);

  recordAudit({
    who: authReq.username!,
    what: "All sessions revoked",
    where: "web-auth",
    result: "success",
    details: `Revoked ${count} sessions`,
  });

  res.json({ ok: true, revoked: count });
});

app.post("/api/account/identities/:provider/link", requireAuth, requireCsrf, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const provider = typeof req.params.provider === "string" ? req.params.provider : "";

  if (provider !== "discord" && provider !== "google") {
    res.status(400).json({ ok: false, error: "Invalid provider." });
    return;
  }

  if (hasProviderLinked(authReq.accountId!, provider)) {
    res.status(400).json({ ok: false, error: `Already linked to ${provider}.` });
    return;
  }

  const state = createOAuthState(provider, "link", authReq.accountId!);
  const url = provider === "discord"
    ? getDiscordAuthUrl(state)
    : getGoogleAuthUrl(state);

  if (!url) {
    res.status(503).json({ ok: false, error: `${provider} OAuth not configured.` });
    return;
  }

  res.json({ ok: true, url });
});

app.post("/api/account/identities/:provider/unlink", requireAuth, requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const provider = typeof req.params.provider === "string" ? req.params.provider : "";

  if (provider !== "discord" && provider !== "google") {
    res.status(400).json({ ok: false, error: "Invalid provider." });
    return;
  }

  const account = getAccountById(authReq.accountId!);
  if (!account) {
    res.status(404).json({ ok: false, error: "Account not found." });
    return;
  }

  // Don't allow unlinking the last authentication method
  const identities = getAccountIdentities(authReq.accountId!);
  const hasPassword = !!account.passwordHash;
  if (identities.length <= 1 && !hasPassword) {
    res.status(400).json({ ok: false, error: "Cannot unlink the last authentication method. Add a password or another provider first." });
    return;
  }

  if (unlinkProviderFromAccount(authReq.accountId!, provider)) {
    recordAudit({
      who: authReq.username!,
      what: `${provider} identity unlinked`,
      where: "web-auth",
      result: "success",
    });
    res.json({ ok: true });
  } else {
    res.status(400).json({ ok: false, error: `No ${provider} identity linked.` });
  }
});

/* ==================== MFA ENDPOINTS ==================== */

app.post("/auth/mfa/setup", requireAuth, requireCsrf, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const account = getAccountById(authReq.accountId!);
  if (!account) {
    res.status(404).json({ ok: false, error: "Account not found." });
    return;
  }

  if (account.role !== "owner" && account.role !== "admin") {
    res.status(403).json({ ok: false, error: "MFA is only available for owner/admin accounts." });
    return;
  }

  if (account.mfaEnabled) {
    res.status(400).json({ ok: false, error: "MFA is already enabled. Disable it first." });
    return;
  }

  const { authenticator } = require("otplib");
  const QRCode = require("qrcode");
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(account.email || account.username, "AshenAI", secret);

  // Store the secret temporarily (not enabled yet until verified)
  updateAccount(account.id, { mfaSecret: secret });

  // Generate QR code as data URL for easy scanning
  let qrCodeDataUrl: string | undefined;
  try {
    qrCodeDataUrl = await QRCode.toDataURL(otpauth, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch (err) {
    logger.warn(`QR code generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  res.json({
    ok: true,
    secret,
    otpauth,
    qrCode: qrCodeDataUrl,
    message: "Scan this QR code or enter the secret in your authenticator app.",
  });
});

app.post("/auth/mfa/verify", requireAuth, requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { code, enable } = req.body || {};
  const account = getAccountById(authReq.accountId!);

  if (!account || !account.mfaSecret) {
    res.status(400).json({ ok: false, error: "MFA setup not initiated." });
    return;
  }

  if (!code || typeof code !== "string") {
    res.status(400).json({ ok: false, error: "Verification code required." });
    return;
  }

  const { authenticator } = require("otplib");
  const isValid = authenticator.verify({ token: code, secret: account.mfaSecret });

  if (!isValid) {
    res.status(400).json({ ok: false, error: "Invalid verification code." });
    return;
  }

  if (enable) {
    // Generate recovery codes
    const recoveryCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString("hex").toUpperCase()
    );
    const recoveryHash = crypto.createHash("sha256")
      .update(recoveryCodes.join("\n"))
      .digest("hex");

    updateAccount(account.id, {
      mfaEnabled: true,
      recoveryCodesHash: recoveryHash,
    });

    recordAudit({
      who: account.username,
      what: "MFA enabled",
      where: "web-auth",
      result: "success",
    });

    res.json({
      ok: true,
      message: "MFA enabled successfully.",
      recoveryCodes,
      warning: "Save these recovery codes securely. They will not be shown again.",
    });
  } else {
    res.json({ ok: true, message: "MFA code verified." });
  }
});

app.post("/auth/mfa/disable", requireAuth, requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { password, code } = req.body || {};
  const account = getAccountById(authReq.accountId!);

  if (!account) {
    res.status(404).json({ ok: false, error: "Account not found." });
    return;
  }

  if (!account.mfaEnabled) {
    res.status(400).json({ ok: false, error: "MFA is not enabled." });
    return;
  }

  // Require password for reauthentication
  if (password && account.passwordHash) {
    if (!verifyPassword(password, account.passwordHash, account.passwordSalt)) {
      res.status(401).json({ ok: false, error: "Invalid password." });
      return;
    }
  } else if (account.passwordHash) {
    res.status(400).json({ ok: false, error: "Password required to disable MFA." });
    return;
  }

  // Require TOTP code to confirm MFA disable (prevents account takeover if session is compromised)
  if (!code || typeof code !== "string") {
    res.status(400).json({ ok: false, error: "MFA verification code required to disable." });
    return;
  }

  const { authenticator } = require("otplib");
  if (!account.mfaSecret || !authenticator.verify({ token: code, secret: account.mfaSecret })) {
    res.status(401).json({ ok: false, error: "Invalid MFA verification code." });
    return;
  }

  updateAccount(account.id, {
    mfaEnabled: false,
    mfaSecret: undefined,
    recoveryCodesHash: undefined,
  });

  recordAudit({
    who: account.username,
    what: "MFA disabled",
    where: "web-auth",
    result: "success",
  });

  res.json({ ok: true, message: "MFA disabled." });
});

app.post("/auth/mfa/recovery-codes", requireAuth, requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { password } = req.body || {};
  const account = getAccountById(authReq.accountId!);

  if (!account || !account.mfaEnabled) {
    res.status(400).json({ ok: false, error: "MFA is not enabled." });
    return;
  }

  // Require password for reauthentication
  if (password && account.passwordHash) {
    if (!verifyPassword(password, account.passwordHash, account.passwordSalt)) {
      res.status(401).json({ ok: false, error: "Invalid password." });
      return;
    }
  } else if (account.passwordHash) {
    res.status(400).json({ ok: false, error: "Password required to regenerate recovery codes." });
    return;
  }

  const recoveryCodes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
  const recoveryHash = crypto.createHash("sha256")
    .update(recoveryCodes.join("\n"))
    .digest("hex");

  updateAccount(account.id, { recoveryCodesHash: recoveryHash });

  recordAudit({
    who: account.username,
    what: "Recovery codes regenerated",
    where: "web-auth",
    result: "success",
  });

  res.json({
    ok: true,
    recoveryCodes,
    warning: "Save these recovery codes securely. They will not be shown again.",
  });
});

/* ==================== MFA CHALLENGE (pre-auth token verification) ==================== */

const mfaChallengeLimiter = createLoginRateLimiter();

app.post("/auth/mfa/challenge", (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const { challengeToken, code, recoveryCode } = req.body || {};

  // Rate limit MFA challenge attempts
  const rateCheck = mfaChallengeLimiter.check(ip);
  if (!rateCheck.allowed) {
    const retrySeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1000);
    res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${retrySeconds}s.` });
    return;
  }

  if (!challengeToken || typeof challengeToken !== "string") {
    res.status(400).json({ ok: false, error: "Challenge token required." });
    return;
  }

  // Validate pre-auth token (one-time use)
  const preAuth = consumePreAuthToken(challengeToken);
  if (!preAuth) {
    res.status(401).json({ ok: false, error: "Invalid or expired challenge token." });
    return;
  }

  const account = getAccountById(preAuth.accountId);
  if (!account || !account.enabled) {
    res.status(401).json({ ok: false, error: "Account not found or disabled." });
    return;
  }

  if (!account.mfaEnabled || !account.mfaSecret) {
    res.status(400).json({ ok: false, error: "MFA is not enabled on this account." });
    return;
  }

  let verified = false;

  if (code && typeof code === "string") {
    // TOTP verification
    const { authenticator } = require("otplib");
    verified = authenticator.verify({ token: code, secret: account.mfaSecret });
  } else if (recoveryCode && typeof recoveryCode === "string" && account.recoveryCodesHash) {
    // Recovery code verification
    const normalizedCode = recoveryCode.replace(/-/g, "").toUpperCase();
    const recoveryHash = crypto.createHash("sha256")
      .update(normalizedCode)
      .digest("hex");

    // Check if recovery code matches (SHA-256 of the code matches stored hash)
    // SECURITY: Use timing-safe comparison to prevent timing side-channel attacks
    const storedHashBuf = Buffer.from(account.recoveryCodesHash, "hex");
    const computedHashBuf = Buffer.from(recoveryHash, "hex");
    if (storedHashBuf.length === computedHashBuf.length &&
        crypto.timingSafeEqual(storedHashBuf, computedHashBuf)) {
      verified = true;
      // Regenerate recovery codes after use
      const newRecoveryCodes = Array.from({ length: 10 }, () =>
        crypto.randomBytes(4).toString("hex").toUpperCase()
      );
      const newRecoveryHash = crypto.createHash("sha256")
        .update(newRecoveryCodes.join("\n"))
        .digest("hex");
      updateAccount(account.id, { recoveryCodesHash: newRecoveryHash });
    }
  }

  if (!verified) {
    recordAudit({
      who: account.username,
      what: "MFA challenge failed",
      where: "web-auth",
      result: "failure",
      details: `IP: ${ip}`,
    });
    res.status(401).json({ ok: false, error: "Invalid MFA code." });
    return;
  }

  // Create full session
  const session = createSession(account.id, account.role, ip);

  setSessionCookie(res, session.sessionId, session.expiresAt);

  logger.info(`✅ MFA challenge passed: ${account.username} from ${ip}`);
  recordAudit({
    who: account.username,
    what: "MFA challenge passed",
    where: "web-auth",
    result: "success",
    details: `IP: ${ip}`,
  });

  res.json({
    ok: true,
    user: { username: account.username, role: account.role },
    csrfToken: session.csrfToken,
  });
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

/* ==================== ERROR HANDLER ==================== */

app.use((err: any, _req: Request, res: Response, _next: any) => {
  logger.error("Unhandled Express error:", err?.message || String(err));
  if (res.headersSent) return;
  const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (err?.message || "Unknown error");
  res.status(500).json({ ok: false, error: msg });
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
