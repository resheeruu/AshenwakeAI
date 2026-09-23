import express, { Request, Response } from "express";
import crypto from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { AIRouter } from "../ai/router";
import { UsageManager } from "../ai/usage-manager";
import { logger } from "../logger";
import { recordAudit } from "../security/audit";
import { getDiscordHealth } from "../core/discord-health";
import { getUpdateStatus } from "../core/update-manager";
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
  requireGuildAuth,
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
  getConfigurationState,
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
import { providerService, testProviderConnection } from "../ai/providers/platform";
import { providerRegistry } from "../ai/providers";
import { loadGuildConfig, getAllGuildConfigs } from "../core/guild-config";

const app = express();
const trustProxySetting = process.env.TRUST_PROXY ? parseInt(process.env.TRUST_PROXY, 10) : 1;
app.set("trust proxy", trustProxySetting);

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
const API_RATE_MAX_IPS = 10_000;

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

  // Evict oldest IPs if map grows too large
  if (apiRequestCounts.size > API_RATE_MAX_IPS) {
    const sorted = [...apiRequestCounts.entries()].sort((a, b) => {
      const aMin = Math.min(...a[1]);
      const bMin = Math.min(...b[1]);
      return aMin - bMin;
    });
    const toRemove = sorted.slice(0, sorted.length - API_RATE_MAX_IPS);
    for (const [key] of toRemove) {
      apiRequestCounts.delete(key);
    }
  }

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

const DEFAULT_PORT = 8080;
const rawPort = process.env.PORT?.trim();
const PORT = rawPort === undefined || rawPort === ""
  ? DEFAULT_PORT
  : Number(rawPort);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(
    "PORT must be an integer between 1 and 65535 when set (default 8080 if unset)",
  );
}

let router: AIRouter;
let usageManager: UsageManager;
let usageStats: UsageStats;
let getHealthStatus: (() => { discordReady: boolean }) | null = null;
let getVersionFn: () => string = () => "unknown";

function getVersion(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "unknown";
  }
}

const VERSION = getVersion();

const loginRateLimiter = createLoginRateLimiter();

app.use(express.json({ limit: "64kb" }));
app.use(globalRateLimit);
app.use(express.static(path.join(__dirname, "public")));

/* ==================== MUTATION INPUT VALIDATION HELPERS ==================== */

const VALID_PROVIDER_PROTOCOLS = new Set(["openai_compatible", "anthropic", "gemini", "ollama"]);
const VALID_PROVIDER_TYPES = new Set(["builtin", "custom", "local"]);
const VALID_ADMIN_ACTIONS = new Set([
  "restart", "stop", "reload_config", "clear_memory", "reset_usage",
  "run_diagnostics", "backup", "provider_disable", "provider_enable",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "string") return { ok: false, error: `${field} must be a string` };
  if (value.length > maxLength) return { ok: false, error: `${field} must be at most ${maxLength} characters` };
  return { ok: true, value };
}

function optionalBoundedNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
  integerOnly = false,
): { ok: true; value?: number } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `${field} must be a finite number` };
  }
  if (integerOnly && !Number.isInteger(value)) {
    return { ok: false, error: `${field} must be an integer` };
  }
  if (value < min || value > max) {
    return { ok: false, error: `${field} must be between ${min} and ${max}` };
  }
  return { ok: true, value };
}

function providerErrorStatus(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "Provider not found") return 404;
  return 400;
}

function sendValidationError(res: Response, message: string): void {
  res.status(400).json({ ok: false, error: message });
}

/* ==================== PUBLIC ==================== */

app.get("/api/health", (_req: Request, res: Response) => {
  const health = getHealthStatus ? getHealthStatus() : { discordReady: false };
  const available = router.getAvailableProviders();
  const ok = health.discordReady && available.length > 0;
  res.status(ok ? 200 : 503).json({
    ok, name: "AshenAI", version: VERSION, uptime: Math.floor(process.uptime()),
    discord: { ready: health.discordReady },
    providers: { available: available.length },
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
    // No linkToken / accountId / username in the URL — identifiers stay server-side.
    res.redirect(`/?link_required=true&provider=discord&message=${encodeURIComponent(result.error || "Account linking required")}`);
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
    res.redirect(`/?link_required=true&provider=google&message=${encodeURIComponent(result.error || "Account linking required")}`);
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

app.get("/api/system/config", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, config: getConfigurationState() });
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

// ── Provider Management API ──

app.get("/api/providers/manage", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  try {
    const providers = providerService.listProviders();
    res.json({ ok: true, providers });
  } catch (err) {
    logger.error("Failed to list providers:", err);
    res.status(500).json({ ok: false, error: "Failed to list providers" });
  }
});

app.get("/api/providers/manage/:id", requireAuth, requireRole("admin"), (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const provider = providerService.getProvider(id);
    if (!provider) return res.status(404).json({ ok: false, error: "Provider not found" });
    res.json({ ok: true, provider });
  } catch (err) {
    logger.error("Failed to get provider:", err);
    res.status(500).json({ ok: false, error: "Failed to get provider" });
  }
});

app.post("/api/providers/manage", requireAuth, requireRole("owner"), requireCsrf, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = isPlainObject(req.body) ? req.body : {};
    const { name, displayName, providerType, protocol, endpoint, apiKey, defaultModel, priority, timeoutMs, retryMaxAttempts, metadata } = body;

    if (name === undefined || displayName === undefined || providerType === undefined || protocol === undefined) {
      return sendValidationError(res, "Missing required fields: name, displayName, providerType, protocol");
    }
    if (typeof name !== "string" || !/^[a-z0-9_-]{1,64}$/.test(name)) {
      return sendValidationError(res, "Name must be 1-64 characters, lowercase alphanumeric with hyphens/underscores");
    }
    if (typeof displayName !== "string" || displayName.trim().length < 1 || displayName.length > 128) {
      return sendValidationError(res, "displayName must be a non-empty string (max 128 characters)");
    }
    if (typeof providerType !== "string" || !VALID_PROVIDER_TYPES.has(providerType)) {
      return sendValidationError(res, "Invalid providerType");
    }
    if (typeof protocol !== "string" || !VALID_PROVIDER_PROTOCOLS.has(protocol)) {
      return sendValidationError(res, "Invalid protocol");
    }

    const ep = optionalBoundedString(endpoint, "endpoint", 2048);
    if (!ep.ok) return sendValidationError(res, ep.error);
    if (ep.value !== undefined) {
      try {
        const parsed = new URL(ep.value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return sendValidationError(res, "endpoint must be http or https");
        }
        if (parsed.username || parsed.password) {
          return sendValidationError(res, "endpoint must not include credentials");
        }
      } catch {
        return sendValidationError(res, "endpoint must be a valid absolute URL");
      }
    }

    const key = optionalBoundedString(apiKey, "apiKey", 4096);
    if (!key.ok) return sendValidationError(res, key.error);
    const model = optionalBoundedString(defaultModel, "defaultModel", 256);
    if (!model.ok) return sendValidationError(res, model.error);

    const pri = optionalBoundedNumber(priority, "priority", 0, 1000);
    if (!pri.ok) return sendValidationError(res, pri.error);
    const tmo = optionalBoundedNumber(timeoutMs, "timeoutMs", 1000, 120000);
    if (!tmo.ok) return sendValidationError(res, tmo.error);
    const ret = optionalBoundedNumber(retryMaxAttempts, "retryMaxAttempts", 0, 10, true);
    if (!ret.ok) return sendValidationError(res, ret.error);

    let meta: Record<string, unknown> = {};
    if (metadata !== undefined && metadata !== null) {
      if (!isPlainObject(metadata)) {
        return sendValidationError(res, "metadata must be a plain object");
      }
      meta = metadata;
    }

    const provider = await providerService.createProvider({
      name,
      displayName: displayName.trim(),
      providerType: providerType as any,
      protocol: protocol as any,
      endpoint: ep.value,
      apiKey: key.value,
      defaultModel: model.value,
      priority: pri.value ?? 100,
      timeoutMs: tmo.value ?? 15000,
      retryMaxAttempts: ret.value ?? 2,
      metadata: meta,
    }, authReq.accountId!, authReq.username!);
    res.status(201).json({ ok: true, provider: providerService.getProvider(provider.id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to create provider:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});

app.put("/api/providers/manage/:id", requireAuth, requireRole("owner"), requireCsrf, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = String(req.params.id);
    const body = isPlainObject(req.body) ? req.body : {};

    const displayName = optionalBoundedString(body.displayName, "displayName", 128);
    if (!displayName.ok) return sendValidationError(res, displayName.error);
    if (displayName.value !== undefined && displayName.value.trim().length < 1) {
      return sendValidationError(res, "displayName must be a non-empty string");
    }

    const endpoint = optionalBoundedString(body.endpoint, "endpoint", 2048);
    if (!endpoint.ok) return sendValidationError(res, endpoint.error);
    if (endpoint.value !== undefined) {
      try {
        const parsed = new URL(endpoint.value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return sendValidationError(res, "endpoint must be http or https");
        }
        if (parsed.username || parsed.password) {
          return sendValidationError(res, "endpoint must not include credentials");
        }
      } catch {
        return sendValidationError(res, "endpoint must be a valid absolute URL");
      }
    }

    const apiKey = optionalBoundedString(body.apiKey, "apiKey", 4096);
    if (!apiKey.ok) return sendValidationError(res, apiKey.error);
    const defaultModel = optionalBoundedString(body.defaultModel, "defaultModel", 256);
    if (!defaultModel.ok) return sendValidationError(res, defaultModel.error);

    const priority = optionalBoundedNumber(body.priority, "priority", 0, 1000);
    if (!priority.ok) return sendValidationError(res, priority.error);
    const timeoutMs = optionalBoundedNumber(body.timeoutMs, "timeoutMs", 1000, 120000);
    if (!timeoutMs.ok) return sendValidationError(res, timeoutMs.error);
    const retryMaxAttempts = optionalBoundedNumber(body.retryMaxAttempts, "retryMaxAttempts", 0, 10, true);
    if (!retryMaxAttempts.ok) return sendValidationError(res, retryMaxAttempts.error);

    if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
      return sendValidationError(res, "enabled must be a boolean");
    }

    let metadata: Record<string, unknown> | undefined;
    if (body.metadata !== undefined && body.metadata !== null) {
      if (!isPlainObject(body.metadata)) {
        return sendValidationError(res, "metadata must be a plain object");
      }
      metadata = body.metadata;
    }

    await providerService.updateProvider(id, {
      displayName: displayName.value !== undefined ? displayName.value.trim() : undefined,
      endpoint: endpoint.value,
      apiKey: apiKey.value,
      defaultModel: defaultModel.value,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      priority: priority.value,
      timeoutMs: timeoutMs.value,
      retryMaxAttempts: retryMaxAttempts.value,
      metadata,
    }, authReq.accountId!, authReq.username!);
    res.json({ ok: true, provider: providerService.getProvider(id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to update provider:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});

app.delete("/api/providers/manage/:id", requireAuth, requireRole("owner"), requireCsrf, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = String(req.params.id);
    await providerService.deleteProvider(id, authReq.accountId!, authReq.username!);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to delete provider:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});

app.post("/api/providers/manage/:id/test", requireAuth, requireRole("admin"), requireCsrf, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const result = await providerService.testConnection(id);
    res.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to test provider:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});

app.post("/api/providers/manage/:id/discover-models", requireAuth, requireRole("admin"), requireCsrf, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const result = await providerService.discoverModelsForProvider(id);
    res.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to discover models:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});

app.post("/api/providers/manage/:id/toggle", requireAuth, requireRole("owner"), requireCsrf, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = String(req.params.id);
    const body = isPlainObject(req.body) ? req.body : {};
    const enabled = body.enabled;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "enabled must be a boolean" });
    }
    await providerService.toggleProvider(id, enabled, authReq.accountId!, authReq.username!);
    res.json({ ok: true, provider: providerService.getProvider(id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to toggle provider:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});

app.put("/api/providers/manage/:id/default-model", requireAuth, requireRole("owner"), requireCsrf, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = String(req.params.id);
    const body = isPlainObject(req.body) ? req.body : {};
    const modelId = body.modelId;
    if (typeof modelId !== "string" || modelId.length < 1 || modelId.length > 256) {
      return res.status(400).json({ ok: false, error: "modelId must be a non-empty string (max 256 characters)" });
    }
    if (!/^[\w./:@+-]{1,256}$/.test(modelId)) {
      return res.status(400).json({ ok: false, error: "modelId contains invalid characters" });
    }
    providerService.setDefaultModel(id, modelId, authReq.accountId!, authReq.username!);
    res.json({ ok: true, provider: providerService.getProvider(id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to set default model:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
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

app.get("/api/guilds", requireAuth, requireRole("admin"), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const allGuilds = getGuildConfigs();
  if (authReq.role === "owner") {
    res.json({ ok: true, guilds: allGuilds });
    return;
  }
  const { getAuthorizedGuildIds } = require("../control/account-store");
  const allowedIds = getAuthorizedGuildIds(authReq.accountId!);
  if (allowedIds.length === 0) {
    res.json({ ok: true, guilds: [] });
    return;
  }
  const filtered = allGuilds.filter((g: any) => allowedIds.includes(g.guildId));
  res.json({ ok: true, guilds: filtered });
});

app.get("/api/guilds/:guildId", requireAuth, requireRole("admin"), requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  res.json({ ok: true, config: getGuildConfig(guildId) });
});

app.get("/api/seraph/status", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, seraph: getSeraphStatus() });
});

// POST only: runDoctor records audit (state mutation) — must not be CSRF-free GET.
app.post("/api/seraph/doctor", requireAuth, requireRole("admin"), requireCsrf, (_req: Request, res: Response) => {
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

app.put("/api/guilds/:guildId", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Request body must be a JSON object");
  }
  const result = updateGuildConfig(guildId, req.body);
  if (result.success) {
    res.json({ ok: true, message: result.message });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

app.post("/api/actions/confirm", requireAuth, requireRole("owner"), requireCsrf, (req: Request, res: Response) => {
  const body = isPlainObject(req.body) ? req.body : {};
  const action = body.action;
  const target = body.target;
  if (!action || typeof action !== "string" || !VALID_ADMIN_ACTIONS.has(action)) {
    return sendValidationError(res, "Valid action required.");
  }
  if (target !== undefined && typeof target !== "string") {
    return sendValidationError(res, "target must be a string");
  }
  const confirmation = confirmAction({ action: action as any, target });
  res.json({ ok: true, confirmation });
});

app.post("/api/actions/execute", requireAuth, requireRole("owner"), requireCsrf, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const body = isPlainObject(req.body) ? req.body : {};
  const { action, target, reason, confirmed } = body;

  if (!action || typeof action !== "string" || !VALID_ADMIN_ACTIONS.has(action)) {
    return sendValidationError(res, "Valid action required.");
  }
  if (target !== undefined && target !== null && typeof target !== "string") {
    return sendValidationError(res, "target must be a string");
  }
  if (reason !== undefined && reason !== null && typeof reason !== "string") {
    return sendValidationError(res, "reason must be a string");
  }

  // Provider enable/disable must perform the real platform mutation (no fake success).
  if (action === "provider_enable" || action === "provider_disable") {
    if (!target) {
      return sendValidationError(res, "Provider target required.");
    }
    if (!confirmed) {
      const confirmation = confirmAction({ action: action as any, target });
      return res.status(409).json({ ok: false, error: confirmation.message, confirmation });
    }
    try {
      const providers = providerService.listProviders();
      const match = providers.find((p) => p.id === target || p.name === target);
      if (!match) {
        return res.status(404).json({ ok: false, error: "Provider not found" });
      }
      const enable = action === "provider_enable";
      await providerService.toggleProvider(match.id, enable, authReq.accountId!, authReq.username!);
      recordAudit({
        who: authReq.accountId!,
        whoName: authReq.username!,
        what: `${enable ? "Enabled" : "Disabled"} provider via action: ${match.displayName}`,
        where: "control",
        result: "success",
        details: `action=${action} target=${match.id}`,
      });
      return res.json({ ok: true, message: `Provider "${match.displayName}" ${enable ? "enabled" : "disabled"}.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Provider action failed:", msg);
      return res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
    }
  }

  const result = await executeAction(
    { action: action as any, target: typeof target === "string" ? target : undefined, reason: typeof reason === "string" ? reason : undefined, confirmed: confirmed === true },
    authReq.accountId!,
    authReq.username!,
  );
  if (result.success) {
    res.json({ ok: true, message: result.message, details: result.details });
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
  if (!sessionId || sessionId.length < 8) {
    return sendValidationError(res, "Session id required (minimum 8 characters).");
  }

  // Frontend only receives an 8-char prefix; match by prefix against own sessions only.
  const sessions = listSessionsForAccount(authReq.accountId!);
  let revoked = 0;
  for (const s of sessions) {
    if (s.sessionId === authReq.sessionId) continue;
    if (s.sessionId === sessionId || s.sessionId.startsWith(sessionId)) {
      if (revokeSession(s.sessionId, authReq.accountId!)) {
        revoked++;
      }
    }
  }

  recordAudit({
    who: authReq.username!,
    what: "Session revoked",
    where: "web-auth",
    result: "success",
    details: `Revoked ${revoked} matching session(s)`,
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
    // Store individual SHA-256 hashes (one per code, newline-separated)
    // so each code can be verified independently
    const recoveryHash = recoveryCodes
      .map((code) => crypto.createHash("sha256").update(code).digest("hex"))
      .join("\n");

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
  const recoveryHash = recoveryCodes
    .map((code) => crypto.createHash("sha256").update(code).digest("hex"))
    .join("\n");

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
    // Recovery code verification — check against individual SHA-256 hashes
    const normalizedCode = recoveryCode.replace(/-/g, "").toUpperCase();
    const submittedHash = crypto.createHash("sha256").update(normalizedCode).digest("hex");

    // Stored hash is newline-separated individual hashes
    const storedHashes = account.recoveryCodesHash.split("\n");
    const matchIndex = storedHashes.findIndex((h) => h === submittedHash);

    if (matchIndex !== -1) {
      verified = true;
      // Regenerate recovery codes after use (all codes invalidated)
      const newRecoveryCodes = Array.from({ length: 10 }, () =>
        crypto.randomBytes(4).toString("hex").toUpperCase()
      );
      const newRecoveryHash = newRecoveryCodes
        .map((code) => crypto.createHash("sha256").update(code).digest("hex"))
        .join("\n");
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
  const body = isPlainObject(req.body) ? req.body : {};
  const { username, role, enabled } = body;

  if (username !== undefined && typeof username !== "string") {
    return sendValidationError(res, "username must be a string");
  }
  if (role !== undefined && (typeof role !== "string" || !["owner", "admin", "user"].includes(role))) {
    return sendValidationError(res, "role must be one of: owner, admin, user");
  }
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return sendValidationError(res, "enabled must be a boolean");
  }

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
    res.status(result.error === "Account not found." ? 404 : 400).json({ ok: false, error: result.error });
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

app.get("/features", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "features.html"));
});

app.get("/docs", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "docs.html"));
});

app.get("/status", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "status.html"));
});

app.get("/privacy", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "privacy.html"));
});

app.get("/terms", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "terms.html"));
});

/* ==================== DASHBOARD ==================== */

app.get("/dashboard", requireAuth, (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/{*splat}", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ==================== DASHBOARD API ==================== */

// Provider connection test
app.post("/api/providers/test-connection", requireAuth, requireRole("admin"), requireCsrf, async (req: Request, res: Response) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    const { protocol, endpoint, apiKey, timeout } = body as { protocol?: unknown; endpoint?: unknown; apiKey?: unknown; timeout?: unknown };
    if (!protocol || typeof protocol !== "string" || !VALID_PROVIDER_PROTOCOLS.has(protocol)) {
      return sendValidationError(res, "Protocol must be one of: openai_compatible, anthropic, gemini, ollama.");
    }
    if (endpoint !== undefined && endpoint !== null && typeof endpoint !== "string") {
      return sendValidationError(res, "endpoint must be a string");
    }
    if (endpoint && endpoint.length > 2048) {
      return sendValidationError(res, "endpoint must be at most 2048 characters");
    }
    if (apiKey !== undefined && apiKey !== null && typeof apiKey !== "string") {
      return sendValidationError(res, "apiKey must be a string");
    }
    if (apiKey && apiKey.length > 4096) {
      return sendValidationError(res, "apiKey must be at most 4096 characters");
    }
    let timeoutMs = 15000;
    if (timeout !== undefined && timeout !== null) {
      if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout < 1000 || timeout > 120000) {
        return sendValidationError(res, "timeout must be a number between 1000 and 120000");
      }
      timeoutMs = timeout;
    }
    const apiKeyStr = typeof apiKey === "string" ? apiKey : "";
    const endpointStr = typeof endpoint === "string" ? endpoint : undefined;
    const result = await testProviderConnection(protocol as any, endpointStr, apiKeyStr, timeoutMs);
    res.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Connection test failed:", msg);
    res.status(400).json({ ok: false, error: msg });
  }
});

// Guild settings endpoints
app.get("/api/guilds/:guildId/settings", requireAuth, requireRole("admin"), requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = getGuildConfig(guildId);
  res.json({ ok: true, config });
});

app.put("/api/guilds/:guildId/settings", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Request body must be a JSON object");
  }
  const result = updateGuildConfig(guildId, req.body);
  if (result.success) {
    res.json({ ok: true, message: result.message });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

// Personality endpoints
app.get("/api/guilds/:guildId/personality", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = getGuildConfig(guildId);
  res.json({ ok: true, config: config.personality });
});

app.put("/api/guilds/:guildId/personality", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Personality body must be a JSON object");
  }
  const result = updateGuildConfig(guildId, { personality: req.body as any });
  if (result.success) {
    res.json({ ok: true, message: "Personality updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

// Moderation settings
app.get("/api/guilds/:guildId/moderation", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = getGuildConfig(guildId);
  res.json({ ok: true, config: config.moderation });
});

app.put("/api/guilds/:guildId/moderation", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Moderation body must be a JSON object");
  }
  const result = updateGuildConfig(guildId, { moderation: req.body as any });
  if (result.success) {
    res.json({ ok: true, message: "Moderation settings updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

// Automation settings
app.get("/api/guilds/:guildId/automation", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = getGuildConfig(guildId);
  res.json({ ok: true, config: config.automation });
});

// Social settings
app.get("/api/guilds/:guildId/social", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = getGuildConfig(guildId);
  res.json({ ok: true, config: config.community });
});

// Analytics
app.get("/api/guilds/:guildId/analytics", requireAuth, requireGuildAuth, (_req: Request, res: Response) => {
  const usage = getUsageStats();
  res.json({ ok: true, usage });
});

// System health
app.get("/api/system/health", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  res.json({ ok: true, health: getHealth() });
});

// SSE stream for real-time logs
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
  const heartbeat = setInterval(() => { res.write(": heartbeat\n\n"); }, 15000);
  req.on("close", () => { clearInterval(heartbeat); unsubscribe(); res.end(); });
});

/* ==================== AI CONTROL CENTER ==================== */

app.get("/api/guilds/:guildId/ai", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = getGuildConfig(guildId);
  res.json({ ok: true, config: config.ai || {} });
});

app.put("/api/guilds/:guildId/ai", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "AI body must be a JSON object");
  }
  const result = updateGuildConfig(guildId, { ai: req.body as any });
  if (result.success) {
    res.json({ ok: true, message: "AI configuration updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

app.get("/api/guilds/:guildId/ai/routing", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = getGuildConfig(guildId);
  res.json({ ok: true, config: config.routing || {} });
});

app.put("/api/guilds/:guildId/ai/routing", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Routing body must be a JSON object");
  }
  const result = updateGuildConfig(guildId, { routing: req.body as any });
  if (result.success) {
    res.json({ ok: true, message: "Routing configuration updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

app.get("/api/guilds/:guildId/ai/limits", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = getGuildConfig(guildId);
  res.json({ ok: true, config: config.limits || {} });
});

app.put("/api/guilds/:guildId/ai/limits", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Limits body must be a JSON object");
  }
  const result = updateGuildConfig(guildId, { limits: req.body as any });
  if (result.success) {
    res.json({ ok: true, message: "Usage limits updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

/* ==================== MODELS ==================== */

app.get("/api/guilds/:guildId/models", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = getGuildConfig(guildId);
  const allModels = providerService.getAllDiscoveredModels();
  res.json({ ok: true, models: allModels, configured: config.models || [] });
});

app.put("/api/guilds/:guildId/models", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!Array.isArray(req.body)) {
    return sendValidationError(res, "models body must be a JSON array");
  }
  const result = updateGuildConfig(guildId, { models: req.body });
  if (result.success) {
    res.json({ ok: true, message: "Model configuration updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

/* ==================== SECURITY ==================== */

app.get("/api/security/sessions", requireAuth, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { listSessionsForAccount } = require("../control/session-store");
  const sessions = listSessionsForAccount(authReq.accountId!);
  res.json({ ok: true, sessions: sessions.map((s: any) => ({
    sessionId: s.sessionId.slice(0, 8) + "...",
    isCurrent: s.sessionId === authReq.sessionId,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    lastSeenIp: s.lastSeenIp,
  })) });
});

app.post("/api/security/sessions/:id/revoke", requireAuth, requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const sessionId = typeof req.params.id === "string" ? req.params.id : "";
  if (!sessionId || sessionId.length < 8) {
    return sendValidationError(res, "Session id required (minimum 8 characters).");
  }
  const { listSessionsForAccount, revokeSession } = require("../control/session-store");
  const sessions = listSessionsForAccount(authReq.accountId!);
  let revoked = 0;
  for (const s of sessions) {
    if (s.sessionId === authReq.sessionId) continue;
    if (s.sessionId === sessionId || s.sessionId.startsWith(sessionId)) {
      if (revokeSession(s.sessionId, authReq.accountId!)) revoked++;
    }
  }
  recordAudit({
    who: authReq.username || "unknown",
    what: "Session revoked",
    where: "web-auth",
    result: "success",
    details: `Revoked ${revoked} matching session(s)`,
  });
  res.json({ ok: true, revoked });
});

app.post("/api/security/sessions/revoke-all", requireAuth, requireCsrf, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { destroyAllSessionsForAccount } = require("../control/session-store");
  const count = destroyAllSessionsForAccount(authReq.accountId!);
  recordAudit({
    who: authReq.username || "unknown",
    what: "All sessions revoked",
    where: "web-auth",
    result: "success",
    details: `Revoked ${count} sessions`,
  });
  res.json({ ok: true, revoked: count });
});

app.get("/api/security/rate-limits", requireAuth, (req: Request, res: Response) => {
  res.json({ ok: true, rateLimits: { globalEnabled: true, windowMs: 60000, maxRequests: 120 } });
});

app.get("/api/security/credentials", requireAuth, requireRole("owner"), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { getAccountIdentities } = require("../control/linked-identities");
  const identities = getAccountIdentities(authReq.accountId!);
  res.json({ ok: true, credentials: identities.map((i: any) => ({
    provider: i.provider,
    displayName: i.displayName,
    linkedAt: i.createdAt,
    lastUsedAt: i.lastUsedAt,
    hasApiKey: true,
  })) });
});

/* ==================== SUPPORT ==================== */

app.get("/api/guilds/:guildId/support", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  try {
    const { getSupportCaseManager } = require("../support");
    const manager = getSupportCaseManager();
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const cases = manager.getGuildCases(
      guildId,
      status as any,
      undefined,
      100,
    );
    res.json({ ok: true, cases, guildId });
  } catch (err) {
    logger.error("Failed to list support cases:", err);
    res.status(500).json({ ok: false, error: "Failed to load support cases" });
  }
});

app.get("/api/guilds/:guildId/support/:caseId", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const caseId = typeof req.params.caseId === "string" ? req.params.caseId : "";
  try {
    const { getSupportCaseManager } = require("../support");
    const manager = getSupportCaseManager();
    const supportCase = manager.getCase(caseId);
    if (!supportCase || supportCase.guildId !== guildId) {
      return res.status(404).json({ ok: false, error: "Case not found" });
    }
    res.json({ ok: true, case: supportCase, messages: manager.getMessages(caseId) });
  } catch (err) {
    logger.error("Failed to load support case:", err);
    res.status(500).json({ ok: false, error: "Failed to load support case" });
  }
});

app.put("/api/guilds/:guildId/support/:caseId", requireAuth, requireRole("admin"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const caseId = typeof req.params.caseId === "string" ? req.params.caseId : "";
  const authReq = req as AuthenticatedRequest;
  try {
    const { getSupportCaseManager } = require("../support");
    const { canTransition } = require("../support");
    const manager = getSupportCaseManager();

    const supportCase = manager.getCase(caseId);
    if (!supportCase || supportCase.guildId !== guildId) {
      return res.status(404).json({ ok: false, error: "Case not found" });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const newStatus = body.status as string | undefined;
    const note = typeof body.note === "string" ? body.note : undefined;

    if (!newStatus || typeof newStatus !== "string") {
      return res.status(400).json({ ok: false, error: "status is required" });
    }
    if (note !== undefined) {
      if (note.length > 4000) {
        return res.status(400).json({ ok: false, error: "note must be at most 4000 characters" });
      }
      if (note.length > 0 && note.trim().length === 0) {
        return res.status(400).json({ ok: false, error: "note must not be blank" });
      }
    }

    if (!canTransition(supportCase.status, newStatus as any)) {
      return res.status(409).json({
        ok: false,
        error: `Invalid transition: ${supportCase.status} → ${newStatus}`,
      });
    }

    const updated = manager.transitionCase(caseId, newStatus as any, authReq.accountId || "web");
    if (!updated) {
      return res.status(409).json({ ok: false, error: "Transition rejected (conflict or invalid)" });
    }

    if (note) {
      manager.addMessage(caseId, authReq.accountId || "web", note, false);
    }

    res.json({ ok: true, case: updated });
  } catch (err) {
    logger.error("Failed to update support case:", err);
    res.status(500).json({ ok: false, error: "Failed to update support case" });
  }
});

/* ==================== AUTOMATION ==================== */

app.get("/api/guilds/:guildId/automation/rules", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  try {
    const { getAutomationRules } = require("../community/automation");
    const rules = getAutomationRules(guildId);
    res.json({ ok: true, rules });
  } catch (err) {
    logger.error("Failed to list automation rules:", err);
    res.status(500).json({ ok: false, error: "Failed to load automation rules" });
  }
});

app.post("/api/guilds/:guildId/automation/rules", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const authReq = req as AuthenticatedRequest;
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const triggerType = typeof body.triggerType === "string" ? body.triggerType.trim() : "";
    if (!name || name.length > 120) {
      return res.status(400).json({ ok: false, error: "name is required (max 120 chars)" });
    }
    if (!triggerType || triggerType.length > 64) {
      return res.status(400).json({ ok: false, error: "triggerType is required (max 64 chars)" });
    }
    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== "string" || body.description.length > 500) {
        return res.status(400).json({ ok: false, error: "description must be a string (max 500 chars)" });
      }
    }
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "enabled must be a boolean" });
    }
    if (body.triggerConfig !== undefined && body.triggerConfig !== null && !isPlainObject(body.triggerConfig)) {
      return res.status(400).json({ ok: false, error: "triggerConfig must be a plain object" });
    }
    if (body.conditions !== undefined && !Array.isArray(body.conditions)) {
      return res.status(400).json({ ok: false, error: "conditions must be an array" });
    }
    if (body.actions !== undefined && !Array.isArray(body.actions)) {
      return res.status(400).json({ ok: false, error: "actions must be an array" });
    }
    if (Array.isArray(body.conditions) && body.conditions.length > 50) {
      return res.status(400).json({ ok: false, error: "conditions must contain at most 50 entries" });
    }
    if (Array.isArray(body.actions) && body.actions.length > 50) {
      return res.status(400).json({ ok: false, error: "actions must contain at most 50 entries" });
    }

    const { createAutomationRule } = require("../community/automation");
    const rule = createAutomationRule({
      guildId,
      name,
      description: typeof body.description === "string" ? body.description : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : true,
      triggerType,
      triggerConfig: isPlainObject(body.triggerConfig) ? body.triggerConfig : {},
      conditions: Array.isArray(body.conditions) ? body.conditions : [],
      actions: Array.isArray(body.actions) ? body.actions : [],
      createdBy: authReq.accountId,
    }, authReq.accountId || "web", authReq.username || "web");

    res.status(201).json({ ok: true, rule });
  } catch (err) {
    logger.error("Failed to create automation rule:", err);
    res.status(500).json({ ok: false, error: "Failed to create automation rule" });
  }
});

app.put("/api/guilds/:guildId/automation/rules/:ruleId", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const ruleId = typeof req.params.ruleId === "string" ? req.params.ruleId : "";
  const authReq = req as AuthenticatedRequest;
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name || name.length > 120) {
        return res.status(400).json({ ok: false, error: "name must be 1-120 characters" });
      }
      updates.name = name;
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string" || body.description.length > 500) {
        return res.status(400).json({ ok: false, error: "description must be a string (max 500 chars)" });
      }
      updates.description = body.description;
    }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        return res.status(400).json({ ok: false, error: "enabled must be a boolean" });
      }
      updates.enabled = body.enabled;
    }
    if (typeof body.triggerType === "string") {
      const triggerType = body.triggerType.trim();
      if (!triggerType || triggerType.length > 64) {
        return res.status(400).json({ ok: false, error: "triggerType must be 1-64 characters" });
      }
      updates.triggerType = triggerType;
    }
    if (body.triggerConfig !== undefined) {
      if (!isPlainObject(body.triggerConfig)) {
        return res.status(400).json({ ok: false, error: "triggerConfig must be a plain object" });
      }
      updates.triggerConfig = body.triggerConfig;
    }
    if (Array.isArray(body.conditions)) {
      if (body.conditions.length > 50) {
        return res.status(400).json({ ok: false, error: "conditions must contain at most 50 entries" });
      }
      updates.conditions = body.conditions;
    } else if (body.conditions !== undefined) {
      return res.status(400).json({ ok: false, error: "conditions must be an array" });
    }
    if (Array.isArray(body.actions)) {
      if (body.actions.length > 50) {
        return res.status(400).json({ ok: false, error: "actions must contain at most 50 entries" });
      }
      updates.actions = body.actions;
    } else if (body.actions !== undefined) {
      return res.status(400).json({ ok: false, error: "actions must be an array" });
    }

    const { updateAutomationRule } = require("../community/automation");
    const rule = updateAutomationRule(guildId, ruleId, updates as any, authReq.accountId || "web", authReq.username || "web");
    if (!rule) {
      return res.status(404).json({ ok: false, error: "Rule not found" });
    }
    res.json({ ok: true, rule });
  } catch (err) {
    logger.error("Failed to update automation rule:", err);
    res.status(500).json({ ok: false, error: "Failed to update automation rule" });
  }
});

app.delete("/api/guilds/:guildId/automation/rules/:ruleId", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const ruleId = typeof req.params.ruleId === "string" ? req.params.ruleId : "";
  const authReq = req as AuthenticatedRequest;
  try {
    const { deleteAutomationRule } = require("../community/automation");
    const ok = deleteAutomationRule(guildId, ruleId, authReq.accountId || "web", authReq.username || "web");
    if (!ok) {
      return res.status(404).json({ ok: false, error: "Rule not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error("Failed to delete automation rule:", err);
    res.status(500).json({ ok: false, error: "Failed to delete automation rule" });
  }
});

/* ==================== SOCIAL ==================== */

app.get("/api/guilds/:guildId/social/config", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = getGuildConfig(guildId);
  res.json({ ok: true, config: config.community || {} });
});

app.put("/api/guilds/:guildId/social/config", requireAuth, requireRole("owner"), requireCsrf, requireGuildAuth, (req: Request, res: Response) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Social config body must be a JSON object");
  }
  const result = updateGuildConfig(guildId, { community: req.body as any });
  if (result.success) {
    res.json({ ok: true, message: "Social configuration updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});

/* ==================== AUDIT LOGS ==================== */

app.get("/api/audit/search", requireAuth, requireRole("owner"), (req: Request, res: Response) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "100", 10) || 100;
  const guildId = typeof req.query.guildId === "string" ? req.query.guildId : undefined;
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const entries = getAuditEntries(limit, guildId);
  const filtered = action ? entries.filter((e: any) => e.what?.includes(action)) : entries;
  res.json({ ok: true, entries: filtered, total: filtered.length });
});

/* ==================== PROVIDER HEALTH ==================== */

app.get("/api/guilds/:guildId/providers/health", requireAuth, requireGuildAuth, (req: Request, res: Response) => {
  const health = getProviderStatus();
  res.json({ ok: true, health });
});

app.post("/api/providers/:id/health", requireAuth, requireRole("admin"), requireCsrf, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    if (!providerService.getProvider(id)) {
      return res.status(404).json({ ok: false, error: "Provider not found" });
    }
    const router = new (require("../ai/router").AIRouter)([]);
    const result = await router.probeProvider(id);
    res.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg === "Provider not found" ? 404 : 502;
    res.status(status).json({ ok: false, error: msg });
  }
});

/* ==================== SYSTEM DIAGNOSTICS ==================== */

app.get("/api/system/diagnostics/extended", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  const diagnostics = runDiagnostics();
  const providerHealth = getProviderStatus();
  const guildConfigs = getAllGuildConfigs ? getAllGuildConfigs() : [];
  res.json({ ok: true, diagnostics, providerHealth, guildConfigs: guildConfigs.length });
});

/* ==================== PROVIDER CATALOG ==================== */

app.get("/api/providers/catalog", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  try {
    const { providerCatalog } = require("../ai/providers");
    res.json({ ok: true, catalog: providerCatalog, total: providerCatalog.length });
  } catch {
    res.json({ ok: true, catalog: [], total: 0 });
  }
});

app.get("/api/providers/catalog/free", requireAuth, requireRole("admin"), (_req: Request, res: Response) => {
  try {
    const { getProvidersByPricing } = require("../ai/providers");
    const free = getProvidersByPricing("free");
    const freeTier = getProvidersByPricing("free-tier");
    const local = getProvidersByPricing("local");
    res.json({ ok: true, free, freeTier, local });
  } catch {
    res.json({ ok: true, free: [], freeTier: [], local: [] });
  }
});

app.get("/api/providers/discover", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const results = [];
    const allProviders = providerRegistry.getAll();
    for (const p of allProviders) {
      results.push({
        name: p.name,
        available: p.isAvailable(),
        models: [],
      });
    }
    res.json({ ok: true, providers: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, error: msg });
  }
});

/* ==================== ERROR HANDLER ==================== */

app.use((err: any, _req: Request, res: Response, _next: any) => {
  logger.error("Unhandled Express error:", err?.message || String(err));
  if (res.headersSent) return;
  const msg = process.env.NODE_ENV === "production" ? "Internal server error" : (err?.message || "Unknown error");
  res.status(500).json({ ok: false, error: msg });
});

/* ==================== START ==================== */

let httpServer: import("http").Server | null = null;

export function getHttpServer(): import("http").Server | null {
  return httpServer;
}

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

  httpServer = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`AshenAI Web listening on port ${PORT}`);
  });
}
