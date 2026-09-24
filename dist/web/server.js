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
var server_exports = {};
__export(server_exports, {
  getHttpServer: () => getHttpServer,
  startWebServer: () => startWebServer
});
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"));
var import_node_crypto = __toESM(require("node:crypto"));
var import_node_path = __toESM(require("node:path"));
var import_node_child_process = require("node:child_process");
var import_logger = require("../logger");
var import_audit = require("../security/audit");
var import_log_stream = require("../log-stream");
var import_auth = require("../control/auth");
var import_roles = require("../control/roles");
var import_account_store = require("../control/account-store");
var import_oauth = require("../control/oauth");
var import_password_reset = require("../control/password-reset");
var import_email_service = require("../control/email-service");
var import_session_store = require("../control/session-store");
var import_linked_identities = require("../control/linked-identities");
var import_control = require("../control");
var import_seraph = require("../seraph");
var import_platform = require("../ai/providers/platform");
var import_providers = require("../ai/providers");
var import_guild_config = require("../core/guild-config");
const app = (0, import_express.default)();
const trustProxySetting = process.env.TRUST_PROXY ? parseInt(process.env.TRUST_PROXY, 10) : 1;
app.set("trust proxy", trustProxySetting);
app.use((_req, res, next) => {
  const cspNonce = import_node_crypto.default.randomBytes(16).toString("base64");
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'nonce-' + cspNonce",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
  res.setHeader("Content-Security-Policy", cspHeader);
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
const ALLOWED_ORIGINS = (process.env.ASHENAI_CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
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
const apiRequestCounts = /* @__PURE__ */ new Map();
const API_RATE_WINDOW_MS = 6e4;
const API_RATE_MAX = 120;
const API_RATE_MAX_IPS = 1e4;
function globalRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const hits = (apiRequestCounts.get(ip) || []).filter((t) => now - t < API_RATE_WINDOW_MS);
  if (hits.length >= API_RATE_MAX) {
    res.status(429).json({ ok: false, error: "Rate limit exceeded." });
    return;
  }
  hits.push(now);
  apiRequestCounts.set(ip, hits);
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
const PORT = rawPort === void 0 || rawPort === "" ? DEFAULT_PORT : Number(rawPort);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(
    "PORT must be an integer between 1 and 65535 when set (default 8080 if unset)"
  );
}
let router;
let usageManager;
let usageStats;
let getHealthStatus = null;
let getVersionFn = () => "unknown";
function getVersion() {
  try {
    return (0, import_node_child_process.execFileSync)("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "unknown";
  }
}
const VERSION = getVersion();
const loginRateLimiter = (0, import_auth.createLoginRateLimiter)();
app.use(import_express.default.json({ limit: "64kb" }));
app.use(globalRateLimit);
app.use(import_express.default.static(import_node_path.default.join(__dirname, "public")));
const VALID_PROVIDER_PROTOCOLS = /* @__PURE__ */ new Set(["openai_compatible", "anthropic", "gemini", "ollama"]);
const VALID_PROVIDER_TYPES = /* @__PURE__ */ new Set(["builtin", "custom", "local"]);
const VALID_ADMIN_ACTIONS = /* @__PURE__ */ new Set([
  "restart",
  "stop",
  "reload_config",
  "clear_memory",
  "reset_usage",
  "run_diagnostics",
  "backup",
  "provider_disable",
  "provider_enable"
]);
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionalBoundedString(value, field, maxLength) {
  if (value === void 0 || value === null) return { ok: true, value: void 0 };
  if (typeof value !== "string") return { ok: false, error: `${field} must be a string` };
  if (value.length > maxLength) return { ok: false, error: `${field} must be at most ${maxLength} characters` };
  return { ok: true, value };
}
function optionalBoundedNumber(value, field, min, max, integerOnly = false) {
  if (value === void 0 || value === null) return { ok: true, value: void 0 };
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
function providerErrorStatus(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "Provider not found") return 404;
  return 400;
}
function sendValidationError(res, message) {
  res.status(400).json({ ok: false, error: message });
}
app.get("/api/health", (_req, res) => {
  const health = getHealthStatus ? getHealthStatus() : { discordReady: false };
  const available = router.getAvailableProviders();
  const ok = health.discordReady && available.length > 0;
  res.status(ok ? 200 : 503).json({
    ok,
    name: "AshenAI",
    version: VERSION,
    uptime: Math.floor(process.uptime()),
    discord: { ready: health.discordReady },
    providers: { available: available.length }
  });
});
app.post("/auth/login", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ ok: false, error: "Username and password required." });
    return;
  }
  const rateCheck = loginRateLimiter.check(ip);
  if (!rateCheck.allowed) {
    const retrySeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1e3);
    res.status(429).json({ ok: false, error: `Too many login attempts. Try again in ${retrySeconds}s.` });
    return;
  }
  const result = (0, import_auth.authenticateOwner)(username, password, ip);
  if (!result.success) {
    const msg = result.reason === "not_configured" ? "Owner credentials not configured." : result.reason === "disabled" ? "Invalid credentials." : "Invalid credentials.";
    res.status(401).json({ ok: false, error: msg });
    return;
  }
  if (result.mfaRequired) {
    res.json({
      ok: true,
      mfaRequired: true,
      challengeToken: result.challengeToken,
      username: result.username,
      role: result.role
    });
    return;
  }
  (0, import_auth.setSessionCookie)(res, result.sessionId, result.expiresAt);
  res.json({
    ok: true,
    user: { username: result.username, role: result.role },
    csrfToken: result.csrfToken
  });
});
app.post("/auth/logout", import_roles.requireCsrf, (req, res) => {
  const sessionId = (0, import_auth.getSessionFromCookie)(req.headers.cookie);
  if (sessionId) (0, import_auth.destroySession)(sessionId);
  (0, import_auth.clearSessionCookie)(res);
  res.json({ ok: true });
});
app.get("/api/me", (req, res) => {
  const sessionId = (0, import_auth.getSessionFromCookie)(req.headers.cookie);
  if (!sessionId) {
    res.json({ ok: true, authenticated: false });
    return;
  }
  const rotated = (0, import_auth.rotateSession)(sessionId);
  if (rotated && rotated.newSessionId !== sessionId) {
    (0, import_auth.setSessionCookie)(res, rotated.newSessionId, rotated.expiresAt);
  }
  const session = (0, import_auth.validateSession)(rotated?.newSessionId || sessionId);
  if (!session) {
    res.json({ ok: true, authenticated: false });
    return;
  }
  const account = (0, import_account_store.getAccountById)(session.accountId);
  if (!account || !account.enabled) {
    (0, import_auth.clearSessionCookie)(res);
    res.json({ ok: true, authenticated: false });
    return;
  }
  if (account.role !== session.role) {
    (0, import_auth.destroySession)(rotated?.newSessionId || sessionId);
    (0, import_auth.clearSessionCookie)(res);
    res.json({ ok: true, authenticated: false });
    return;
  }
  res.json({
    ok: true,
    authenticated: true,
    user: { username: account.username, role: session.role },
    csrfToken: session.csrfToken
  });
});
app.get("/auth/discord", (req, res) => {
  const state = (0, import_oauth.createOAuthState)("discord", "login");
  const url = (0, import_oauth.getDiscordAuthUrl)(state);
  if (!url) {
    res.status(503).json({ ok: false, error: "Discord OAuth not configured." });
    return;
  }
  res.redirect(url);
});
app.get("/auth/discord/callback", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) {
    res.status(400).send("Missing authorization code or state.");
    return;
  }
  const result = await (0, import_oauth.handleDiscordCallback)(code, state, ip);
  if (result.success && result.sessionId) {
    (0, import_auth.setSessionCookie)(res, result.sessionId, result.expiresAt);
    res.redirect("/?login=success&provider=discord");
  } else if (result.requiresLinking) {
    res.redirect(`/?link_required=true&provider=discord&message=${encodeURIComponent(result.error || "Account linking required")}`);
  } else {
    res.redirect(`/?login=error&message=${encodeURIComponent(result.error || "OAuth failed")}`);
  }
});
app.get("/auth/google", (req, res) => {
  const state = (0, import_oauth.createOAuthState)("google", "login");
  const url = (0, import_oauth.getGoogleAuthUrl)(state);
  if (!url) {
    res.status(503).json({ ok: false, error: "Google OAuth not configured." });
    return;
  }
  res.redirect(url);
});
app.get("/auth/google/callback", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) {
    res.status(400).send("Missing authorization code or state.");
    return;
  }
  const result = await (0, import_oauth.handleGoogleCallback)(code, state, ip);
  if (result.success && result.sessionId) {
    (0, import_auth.setSessionCookie)(res, result.sessionId, result.expiresAt);
    res.redirect("/?login=success&provider=google");
  } else if (result.requiresLinking) {
    res.redirect(`/?link_required=true&provider=google&message=${encodeURIComponent(result.error || "Account linking required")}`);
  } else {
    res.redirect(`/?login=error&message=${encodeURIComponent(result.error || "OAuth failed")}`);
  }
});
const forgotPasswordLimiter = (0, import_auth.createLoginRateLimiter)();
app.post("/auth/forgot-password", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const { email } = req.body || {};
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
  const allAccounts = (0, import_account_store.listAccounts)();
  const account = allAccounts.find((a) => a.email?.toLowerCase() === email.toLowerCase());
  if (account) {
    const fullAccount = (0, import_account_store.getAccountById)(account.id);
    if (fullAccount) {
      const resetToken = (0, import_password_reset.generateResetToken)(fullAccount.id);
      (0, import_audit.recordAudit)({
        who: fullAccount.username,
        what: "Password reset requested",
        where: "web-auth",
        result: "success",
        details: `IP: ${ip}`
      });
      const baseUrl = process.env.AUTH_BASE_URL || `http://${req.headers.host || "localhost"}`;
      await (0, import_email_service.sendPasswordResetEmail)(fullAccount.email, fullAccount.id, resetToken, baseUrl);
    }
  }
  res.json(genericResponse);
});
const resetPasswordLimiter = (0, import_auth.createLoginRateLimiter)();
app.post("/auth/reset-password", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const { accountId, token, newPassword } = req.body || {};
  const rateCheck = resetPasswordLimiter.check(ip);
  if (!rateCheck.allowed) {
    const retrySeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1e3);
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
  if (!(0, import_password_reset.validateResetToken)(accountId, token)) {
    res.status(400).json({ ok: false, error: "Invalid or expired reset token." });
    return;
  }
  const account = (0, import_account_store.getAccountById)(accountId);
  if (!account) {
    res.status(400).json({ ok: false, error: "Invalid reset token." });
    return;
  }
  (0, import_password_reset.useResetToken)(accountId, token);
  const { hash, salt } = (0, import_account_store.hashPassword)(newPassword);
  (0, import_account_store.updateAccountCredentials)(accountId, { passwordHash: hash, passwordSalt: salt });
  (0, import_auth.destroyAllSessionsForAccount)(accountId);
  (0, import_password_reset.invalidateResetTokens)(accountId);
  (0, import_audit.recordAudit)({
    who: account.username,
    what: "Password reset completed",
    where: "web-auth",
    result: "success"
  });
  res.json({ ok: true, message: "Password reset successful. Please log in." });
});
app.get("/auth/reset-password/:accountId/:token", (req, res) => {
  const accountId = typeof req.params.accountId === "string" ? req.params.accountId : "";
  const token = typeof req.params.token === "string" ? req.params.token : "";
  if (!accountId || !token) {
    res.status(400).send("Invalid reset link.");
    return;
  }
  if (!(0, import_password_reset.validateResetToken)(accountId, token)) {
    res.status(400).send("Invalid or expired reset link.");
    return;
  }
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
app.post("/auth/change-password", import_roles.requireAuth, import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ ok: false, error: "Current password and new password required." });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ ok: false, error: "New password must be at least 8 characters." });
    return;
  }
  const account = (0, import_account_store.getAccountById)(authReq.accountId);
  if (!account) {
    res.status(401).json({ ok: false, error: "Account not found." });
    return;
  }
  if (!(0, import_account_store.verifyPassword)(currentPassword, account.passwordHash, account.passwordSalt)) {
    res.status(401).json({ ok: false, error: "Current password is incorrect." });
    return;
  }
  const { hash, salt } = (0, import_account_store.hashPassword)(newPassword);
  (0, import_account_store.updateAccountCredentials)(account.id, { passwordHash: hash, passwordSalt: salt });
  (0, import_auth.destroyAllSessionsForAccount)(account.id);
  (0, import_auth.clearSessionCookie)(res);
  res.json({ ok: true, message: "Password changed. Please log in again." });
});
app.get("/api/system/status", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), async (_req, res) => {
  res.json({ ok: true, status: await (0, import_control.getStatus)() });
});
app.get("/api/system/health", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, health: (0, import_control.getHealth)() });
});
app.get("/api/system/info", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, info: (0, import_control.getSystemInfo)() });
});
app.get("/api/system/diagnostics", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, diagnostics: (0, import_control.runDiagnostics)() });
});
app.get("/api/system/features", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, features: (0, import_control.getFeatureStatus)() });
});
app.get("/api/system/config", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, config: (0, import_control.getConfigurationState)() });
});
app.get("/api/providers/status", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, providers: (0, import_control.getProviderStatus)() });
});
app.get("/api/providers/performance", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, performance: (0, import_control.getProviderPerformance)() });
});
app.get("/api/providers/current", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, model: (0, import_control.getCurrentModel)() });
});
app.get("/api/providers/manage", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  try {
    const providers = import_platform.providerService.listProviders();
    res.json({ ok: true, providers });
  } catch (err) {
    import_logger.logger.error("Failed to list providers:", err);
    res.status(500).json({ ok: false, error: "Failed to list providers" });
  }
});
app.get("/api/providers/manage/:id", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (req, res) => {
  try {
    const id = String(req.params.id);
    const provider = import_platform.providerService.getProvider(id);
    if (!provider) return res.status(404).json({ ok: false, error: "Provider not found" });
    res.json({ ok: true, provider });
  } catch (err) {
    import_logger.logger.error("Failed to get provider:", err);
    res.status(500).json({ ok: false, error: "Failed to get provider" });
  }
});
app.post("/api/providers/manage", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, async (req, res) => {
  try {
    const authReq = req;
    const body = isPlainObject(req.body) ? req.body : {};
    const { name, displayName, providerType, protocol, endpoint, apiKey, defaultModel, priority, timeoutMs, retryMaxAttempts, metadata } = body;
    if (name === void 0 || displayName === void 0 || providerType === void 0 || protocol === void 0) {
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
    if (ep.value !== void 0) {
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
    const pri = optionalBoundedNumber(priority, "priority", 0, 1e3);
    if (!pri.ok) return sendValidationError(res, pri.error);
    const tmo = optionalBoundedNumber(timeoutMs, "timeoutMs", 1e3, 12e4);
    if (!tmo.ok) return sendValidationError(res, tmo.error);
    const ret = optionalBoundedNumber(retryMaxAttempts, "retryMaxAttempts", 0, 10, true);
    if (!ret.ok) return sendValidationError(res, ret.error);
    let meta = {};
    if (metadata !== void 0 && metadata !== null) {
      if (!isPlainObject(metadata)) {
        return sendValidationError(res, "metadata must be a plain object");
      }
      meta = metadata;
    }
    const provider = await import_platform.providerService.createProvider({
      name,
      displayName: displayName.trim(),
      providerType,
      protocol,
      endpoint: ep.value,
      apiKey: key.value,
      defaultModel: model.value,
      priority: pri.value ?? 100,
      timeoutMs: tmo.value ?? 15e3,
      retryMaxAttempts: ret.value ?? 2,
      metadata: meta
    }, authReq.accountId, authReq.username);
    res.status(201).json({ ok: true, provider: import_platform.providerService.getProvider(provider.id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    import_logger.logger.error("Failed to create provider:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});
app.put("/api/providers/manage/:id", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, async (req, res) => {
  try {
    const authReq = req;
    const id = String(req.params.id);
    const body = isPlainObject(req.body) ? req.body : {};
    const displayName = optionalBoundedString(body.displayName, "displayName", 128);
    if (!displayName.ok) return sendValidationError(res, displayName.error);
    if (displayName.value !== void 0 && displayName.value.trim().length < 1) {
      return sendValidationError(res, "displayName must be a non-empty string");
    }
    const endpoint = optionalBoundedString(body.endpoint, "endpoint", 2048);
    if (!endpoint.ok) return sendValidationError(res, endpoint.error);
    if (endpoint.value !== void 0) {
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
    const priority = optionalBoundedNumber(body.priority, "priority", 0, 1e3);
    if (!priority.ok) return sendValidationError(res, priority.error);
    const timeoutMs = optionalBoundedNumber(body.timeoutMs, "timeoutMs", 1e3, 12e4);
    if (!timeoutMs.ok) return sendValidationError(res, timeoutMs.error);
    const retryMaxAttempts = optionalBoundedNumber(body.retryMaxAttempts, "retryMaxAttempts", 0, 10, true);
    if (!retryMaxAttempts.ok) return sendValidationError(res, retryMaxAttempts.error);
    if (body.enabled !== void 0 && typeof body.enabled !== "boolean") {
      return sendValidationError(res, "enabled must be a boolean");
    }
    let metadata;
    if (body.metadata !== void 0 && body.metadata !== null) {
      if (!isPlainObject(body.metadata)) {
        return sendValidationError(res, "metadata must be a plain object");
      }
      metadata = body.metadata;
    }
    await import_platform.providerService.updateProvider(id, {
      displayName: displayName.value !== void 0 ? displayName.value.trim() : void 0,
      endpoint: endpoint.value,
      apiKey: apiKey.value,
      defaultModel: defaultModel.value,
      enabled: typeof body.enabled === "boolean" ? body.enabled : void 0,
      priority: priority.value,
      timeoutMs: timeoutMs.value,
      retryMaxAttempts: retryMaxAttempts.value,
      metadata
    }, authReq.accountId, authReq.username);
    res.json({ ok: true, provider: import_platform.providerService.getProvider(id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    import_logger.logger.error("Failed to update provider:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});
app.delete("/api/providers/manage/:id", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, async (req, res) => {
  try {
    const authReq = req;
    const id = String(req.params.id);
    await import_platform.providerService.deleteProvider(id, authReq.accountId, authReq.username);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    import_logger.logger.error("Failed to delete provider:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});
app.post("/api/providers/manage/:id/test", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), import_roles.requireCsrf, async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await import_platform.providerService.testConnection(id);
    res.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    import_logger.logger.error("Failed to test provider:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});
app.post("/api/providers/manage/:id/discover-models", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), import_roles.requireCsrf, async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await import_platform.providerService.discoverModelsForProvider(id);
    res.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    import_logger.logger.error("Failed to discover models:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});
app.post("/api/providers/manage/:id/toggle", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, async (req, res) => {
  try {
    const authReq = req;
    const id = String(req.params.id);
    const body = isPlainObject(req.body) ? req.body : {};
    const enabled = body.enabled;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "enabled must be a boolean" });
    }
    await import_platform.providerService.toggleProvider(id, enabled, authReq.accountId, authReq.username);
    res.json({ ok: true, provider: import_platform.providerService.getProvider(id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    import_logger.logger.error("Failed to toggle provider:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});
app.put("/api/providers/manage/:id/default-model", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, (req, res) => {
  try {
    const authReq = req;
    const id = String(req.params.id);
    const body = isPlainObject(req.body) ? req.body : {};
    const modelId = body.modelId;
    if (typeof modelId !== "string" || modelId.length < 1 || modelId.length > 256) {
      return res.status(400).json({ ok: false, error: "modelId must be a non-empty string (max 256 characters)" });
    }
    if (!/^[\w./:@+-]{1,256}$/.test(modelId)) {
      return res.status(400).json({ ok: false, error: "modelId contains invalid characters" });
    }
    import_platform.providerService.setDefaultModel(id, modelId, authReq.accountId, authReq.username);
    res.json({ ok: true, provider: import_platform.providerService.getProvider(id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    import_logger.logger.error("Failed to set default model:", msg);
    res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
  }
});
app.get("/api/memory/stats", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, memory: (0, import_control.getMemoryStats)() });
});
app.get("/api/usage/global", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, usage: (0, import_control.getUsageStats)() });
});
app.get("/api/usage/system", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, systemUsage: (0, import_control.getSystemUsageStats)() });
});
app.get("/api/logs", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (req, res) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "100", 10) || 100;
  res.json({ ok: true, logs: (0, import_control.getLogs)(limit) });
});
app.get("/api/logs/errors", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (req, res) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "20", 10) || 20;
  res.json({ ok: true, errors: (0, import_control.getRecentErrors)(limit) });
});
app.get("/api/logs/stream", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const send = (entry) => {
    res.write(`event: log
data: ${JSON.stringify(entry)}

`);
  };
  for (const entry of (0, import_log_stream.getRecentLogs)(100)) send(entry);
  const unsubscribe = (0, import_log_stream.subscribeLogs)(send);
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15e3);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});
app.get("/api/guilds", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (req, res) => {
  const authReq = req;
  const allGuilds = (0, import_control.getGuildConfigs)();
  if (authReq.role === "owner") {
    res.json({ ok: true, guilds: allGuilds });
    return;
  }
  const { getAuthorizedGuildIds } = require("../control/account-store");
  const allowedIds = getAuthorizedGuildIds(authReq.accountId);
  if (allowedIds.length === 0) {
    res.json({ ok: true, guilds: [] });
    return;
  }
  const filtered = allGuilds.filter((g) => allowedIds.includes(g.guildId));
  res.json({ ok: true, guilds: filtered });
});
app.get("/api/guilds/:guildId", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  res.json({ ok: true, config: (0, import_control.getGuildConfig)(guildId) });
});
app.get("/api/seraph/status", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), async (_req, res) => {
  res.json({ ok: true, seraph: await (0, import_seraph.getStatus)() });
});
app.post("/api/seraph/doctor", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), import_roles.requireCsrf, (_req, res) => {
  res.json({ ok: true, doctor: (0, import_seraph.runDoctor)() });
});
app.get("/api/seraph/reports", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, reports: (0, import_seraph.getReports)() });
});
app.get("/api/seraph/tools", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, tools: (0, import_seraph.getTools)() });
});
app.get("/api/seraph/monitoring", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, monitoring: (0, import_seraph.getMonitoringInfo)() });
});
app.get("/api/seraph/system", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, system: (0, import_seraph.getSystemInformation)() });
});
app.put("/api/guilds/:guildId", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Request body must be a JSON object");
  }
  const result = (0, import_control.updateGuildConfig)(guildId, req.body);
  if (result.success) {
    res.json({ ok: true, message: result.message });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});
app.post("/api/actions/confirm", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, (req, res) => {
  const body = isPlainObject(req.body) ? req.body : {};
  const action = body.action;
  const target = body.target;
  if (!action || typeof action !== "string" || !VALID_ADMIN_ACTIONS.has(action)) {
    return sendValidationError(res, "Valid action required.");
  }
  if (target !== void 0 && typeof target !== "string") {
    return sendValidationError(res, "target must be a string");
  }
  const confirmation = (0, import_control.confirmAction)({ action, target });
  res.json({ ok: true, confirmation });
});
app.post("/api/actions/execute", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, async (req, res) => {
  const authReq = req;
  const body = isPlainObject(req.body) ? req.body : {};
  const { action, target, reason, confirmed } = body;
  if (!action || typeof action !== "string" || !VALID_ADMIN_ACTIONS.has(action)) {
    return sendValidationError(res, "Valid action required.");
  }
  if (target !== void 0 && target !== null && typeof target !== "string") {
    return sendValidationError(res, "target must be a string");
  }
  if (reason !== void 0 && reason !== null && typeof reason !== "string") {
    return sendValidationError(res, "reason must be a string");
  }
  if (action === "provider_enable" || action === "provider_disable") {
    if (!target) {
      return sendValidationError(res, "Provider target required.");
    }
    if (!confirmed) {
      const confirmation = (0, import_control.confirmAction)({ action, target });
      return res.status(409).json({ ok: false, error: confirmation.message, confirmation });
    }
    try {
      const providers = import_platform.providerService.listProviders();
      const match = providers.find((p) => p.id === target || p.name === target);
      if (!match) {
        return res.status(404).json({ ok: false, error: "Provider not found" });
      }
      const enable = action === "provider_enable";
      await import_platform.providerService.toggleProvider(match.id, enable, authReq.accountId, authReq.username);
      (0, import_audit.recordAudit)({
        who: authReq.accountId,
        whoName: authReq.username,
        what: `${enable ? "Enabled" : "Disabled"} provider via action: ${match.displayName}`,
        where: "control",
        result: "success",
        details: `action=${action} target=${match.id}`
      });
      return res.json({ ok: true, message: `Provider "${match.displayName}" ${enable ? "enabled" : "disabled"}.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      import_logger.logger.error("Provider action failed:", msg);
      return res.status(providerErrorStatus(err)).json({ ok: false, error: msg });
    }
  }
  const result = await (0, import_control.executeAction)(
    { action, target: typeof target === "string" ? target : void 0, reason: typeof reason === "string" ? reason : void 0, confirmed: confirmed === true },
    authReq.accountId,
    authReq.username
  );
  if (result.success) {
    res.json({ ok: true, message: result.message, details: result.details });
  } else {
    res.status(400).json({ ok: false, error: result.message });
  }
});
app.get("/api/audit", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), (req, res) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "100", 10) || 100;
  const guildId = typeof req.query.guildId === "string" ? req.query.guildId : void 0;
  res.json({ ok: true, entries: (0, import_control.getAuditEntries)(limit, guildId) });
});
app.post("/api/seraph/investigate", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, (req, res) => {
  const { problem } = req.body || {};
  if (!problem || typeof problem !== "string") {
    res.status(400).json({ ok: false, error: "Problem description required." });
    return;
  }
  const sanitized = problem.trim().slice(0, 2e3);
  res.json({ ok: true, investigation: (0, import_seraph.runInvestigation)(sanitized) });
});
app.post("/api/seraph/reports/generate", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, (req, res) => {
  const { type } = req.body || {};
  const validTypes = ["health", "performance", "security", "diagnostic"];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({ ok: false, error: `Type must be one of: ${validTypes.join(", ")}` });
    return;
  }
  res.json({ ok: true, report: (0, import_seraph.generateReport)(type) });
});
app.get("/api/account/security", import_roles.requireAuth, (req, res) => {
  const authReq = req;
  const account = (0, import_account_store.getAccountById)(authReq.accountId);
  if (!account) {
    res.status(404).json({ ok: false, error: "Account not found." });
    return;
  }
  const identities = (0, import_linked_identities.getAccountIdentities)(account.id);
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
        lastUsedAt: i.lastUsedAt
      }))
    }
  });
});
app.get("/api/account/sessions", import_roles.requireAuth, (req, res) => {
  const authReq = req;
  const sessions = (0, import_session_store.listSessionsForAccount)(authReq.accountId);
  res.json({
    ok: true,
    sessions: sessions.map((s) => ({
      sessionId: s.sessionId.slice(0, 8) + "...",
      isCurrent: s.sessionId === authReq.sessionId,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      lastSeenIp: s.lastSeenIp
    }))
  });
});
app.post("/api/account/sessions/:id/revoke", import_roles.requireAuth, import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const sessionId = typeof req.params.id === "string" ? req.params.id : "";
  if (!sessionId || sessionId.length < 8) {
    return sendValidationError(res, "Session id required (minimum 8 characters).");
  }
  const sessions = (0, import_session_store.listSessionsForAccount)(authReq.accountId);
  let revoked = 0;
  for (const s of sessions) {
    if (s.sessionId === authReq.sessionId) continue;
    if (s.sessionId === sessionId || s.sessionId.startsWith(sessionId)) {
      if ((0, import_session_store.revokeSession)(s.sessionId, authReq.accountId)) {
        revoked++;
      }
    }
  }
  (0, import_audit.recordAudit)({
    who: authReq.username,
    what: "Session revoked",
    where: "web-auth",
    result: "success",
    details: `Revoked ${revoked} matching session(s)`
  });
  res.json({ ok: true, revoked });
});
app.post("/api/account/sessions/revoke-all", import_roles.requireAuth, import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const count = (0, import_auth.destroyAllSessionsForAccount)(authReq.accountId);
  (0, import_audit.recordAudit)({
    who: authReq.username,
    what: "All sessions revoked",
    where: "web-auth",
    result: "success",
    details: `Revoked ${count} sessions`
  });
  res.json({ ok: true, revoked: count });
});
app.post("/api/account/identities/:provider/link", import_roles.requireAuth, import_roles.requireCsrf, async (req, res) => {
  const authReq = req;
  const provider = typeof req.params.provider === "string" ? req.params.provider : "";
  if (provider !== "discord" && provider !== "google") {
    res.status(400).json({ ok: false, error: "Invalid provider." });
    return;
  }
  if ((0, import_linked_identities.hasProviderLinked)(authReq.accountId, provider)) {
    res.status(400).json({ ok: false, error: `Already linked to ${provider}.` });
    return;
  }
  const state = (0, import_oauth.createOAuthState)(provider, "link", authReq.accountId);
  const url = provider === "discord" ? (0, import_oauth.getDiscordAuthUrl)(state) : (0, import_oauth.getGoogleAuthUrl)(state);
  if (!url) {
    res.status(503).json({ ok: false, error: `${provider} OAuth not configured.` });
    return;
  }
  res.json({ ok: true, url });
});
app.post("/api/account/identities/:provider/unlink", import_roles.requireAuth, import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const provider = typeof req.params.provider === "string" ? req.params.provider : "";
  if (provider !== "discord" && provider !== "google") {
    res.status(400).json({ ok: false, error: "Invalid provider." });
    return;
  }
  const account = (0, import_account_store.getAccountById)(authReq.accountId);
  if (!account) {
    res.status(404).json({ ok: false, error: "Account not found." });
    return;
  }
  const identities = (0, import_linked_identities.getAccountIdentities)(authReq.accountId);
  const hasPassword = !!account.passwordHash;
  if (identities.length <= 1 && !hasPassword) {
    res.status(400).json({ ok: false, error: "Cannot unlink the last authentication method. Add a password or another provider first." });
    return;
  }
  if ((0, import_linked_identities.unlinkProviderFromAccount)(authReq.accountId, provider)) {
    (0, import_audit.recordAudit)({
      who: authReq.username,
      what: `${provider} identity unlinked`,
      where: "web-auth",
      result: "success"
    });
    res.json({ ok: true });
  } else {
    res.status(400).json({ ok: false, error: `No ${provider} identity linked.` });
  }
});
app.post("/auth/mfa/setup", import_roles.requireAuth, import_roles.requireCsrf, async (req, res) => {
  const authReq = req;
  const account = (0, import_account_store.getAccountById)(authReq.accountId);
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
  (0, import_account_store.updateAccount)(account.id, { mfaSecret: secret });
  let qrCodeDataUrl;
  try {
    qrCodeDataUrl = await QRCode.toDataURL(otpauth, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" }
    });
  } catch (err) {
    import_logger.logger.warn(`QR code generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  res.json({
    ok: true,
    secret,
    otpauth,
    qrCode: qrCodeDataUrl,
    message: "Scan this QR code or enter the secret in your authenticator app."
  });
});
app.post("/auth/mfa/verify", import_roles.requireAuth, import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const { code, enable } = req.body || {};
  const account = (0, import_account_store.getAccountById)(authReq.accountId);
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!account || !account.mfaSecret) {
    res.status(400).json({ ok: false, error: "MFA setup not initiated." });
    return;
  }
  const mfaRateCheck = checkMFARateLimit(account.id, ip);
  if (!mfaRateCheck.allowed) {
    const retrySeconds = Math.ceil((mfaRateCheck.retryAfterMs || 0) / 1e3);
    res.status(429).json({ ok: false, error: `Too many MFA attempts. Try again in ${retrySeconds}s.` });
    return;
  }
  if (!code || typeof code !== "string") {
    res.status(400).json({ ok: false, error: "Verification code required." });
    return;
  }
  const { authenticator } = require("otplib");
  const isValid = authenticator.verify({ token: code, secret: account.mfaSecret });
  if (!isValid) {
    recordMFARefailure(account.id, ip);
    res.status(400).json({ ok: false, error: "Invalid verification code." });
    return;
  }
  resetMFARateLimit(account.id, ip);
  if (enable) {
    const recoveryCodes = Array.from(
      { length: 10 },
      () => import_node_crypto.default.randomBytes(4).toString("hex").toUpperCase()
    );
    const recoveryHash = recoveryCodes.map((code2) => import_node_crypto.default.createHash("sha256").update(code2).digest("hex")).join("\n");
    (0, import_account_store.updateAccount)(account.id, {
      mfaEnabled: true,
      recoveryCodesHash: recoveryHash
    });
    (0, import_audit.recordAudit)({
      who: account.username,
      what: "MFA enabled",
      where: "web-auth",
      result: "success"
    });
    res.json({
      ok: true,
      message: "MFA enabled successfully.",
      recoveryCodes,
      warning: "Save these recovery codes securely. They will not be shown again."
    });
  } else {
    res.json({ ok: true, message: "MFA code verified." });
  }
});
app.post("/auth/mfa/disable", import_roles.requireAuth, import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const { password, code } = req.body || {};
  const account = (0, import_account_store.getAccountById)(authReq.accountId);
  if (!account) {
    res.status(404).json({ ok: false, error: "Account not found." });
    return;
  }
  if (!account.mfaEnabled) {
    res.status(400).json({ ok: false, error: "MFA is not enabled." });
    return;
  }
  if (password && account.passwordHash) {
    if (!(0, import_account_store.verifyPassword)(password, account.passwordHash, account.passwordSalt)) {
      res.status(401).json({ ok: false, error: "Invalid password." });
      return;
    }
  } else if (account.passwordHash) {
    res.status(400).json({ ok: false, error: "Password required to disable MFA." });
    return;
  }
  if (!code || typeof code !== "string") {
    res.status(400).json({ ok: false, error: "MFA verification code required to disable." });
    return;
  }
  const { authenticator } = require("otplib");
  if (!account.mfaSecret || !authenticator.verify({ token: code, secret: account.mfaSecret })) {
    res.status(401).json({ ok: false, error: "Invalid MFA verification code." });
    return;
  }
  (0, import_account_store.updateAccount)(account.id, {
    mfaEnabled: false,
    mfaSecret: void 0,
    recoveryCodesHash: void 0
  });
  (0, import_audit.recordAudit)({
    who: account.username,
    what: "MFA disabled",
    where: "web-auth",
    result: "success"
  });
  res.json({ ok: true, message: "MFA disabled." });
});
app.post("/auth/mfa/recovery-codes", import_roles.requireAuth, import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const { password } = req.body || {};
  const account = (0, import_account_store.getAccountById)(authReq.accountId);
  if (!account || !account.mfaEnabled) {
    res.status(400).json({ ok: false, error: "MFA is not enabled." });
    return;
  }
  if (password && account.passwordHash) {
    if (!(0, import_account_store.verifyPassword)(password, account.passwordHash, account.passwordSalt)) {
      res.status(401).json({ ok: false, error: "Invalid password." });
      return;
    }
  } else if (account.passwordHash) {
    res.status(400).json({ ok: false, error: "Password required to regenerate recovery codes." });
    return;
  }
  const recoveryCodes = Array.from(
    { length: 10 },
    () => import_node_crypto.default.randomBytes(4).toString("hex").toUpperCase()
  );
  const recoveryHash = recoveryCodes.map((code) => import_node_crypto.default.createHash("sha256").update(code).digest("hex")).join("\n");
  (0, import_account_store.updateAccount)(account.id, { recoveryCodesHash: recoveryHash });
  (0, import_audit.recordAudit)({
    who: account.username,
    what: "Recovery codes regenerated",
    where: "web-auth",
    result: "success"
  });
  res.json({
    ok: true,
    recoveryCodes,
    warning: "Save these recovery codes securely. They will not be shown again."
  });
});
const mfaChallengeLimiter = (0, import_auth.createLoginRateLimiter)();
const mfaVerifyLimiter = (0, import_auth.createLoginRateLimiter)();
const mfaFailedAttempts = /* @__PURE__ */ new Map();
const MFA_MAX_FAILED_ATTEMPTS = 5;
const MFA_LOCKOUT_MS = 15 * 60 * 1e3;
const MFA_WINDOW_MS = 5 * 60 * 1e3;
function getMFARateLimitKey(accountId, ip) {
  return `mfa:${accountId}:${ip}`;
}
function checkMFARateLimit(accountId, ip) {
  const key = getMFARateLimitKey(accountId, ip);
  const now = Date.now();
  const attempts = mfaFailedAttempts.get(key) || [];
  const recentAttempts = attempts.filter((t) => now - t < MFA_WINDOW_MS);
  if (recentAttempts.length >= MFA_MAX_FAILED_ATTEMPTS) {
    const oldestAttempt = Math.min(...recentAttempts);
    const retryAfterMs = MFA_LOCKOUT_MS - (now - oldestAttempt);
    return { allowed: false, retryAfterMs };
  }
  return { allowed: true };
}
function recordMFARefailure(accountId, ip) {
  const key = getMFARateLimitKey(accountId, ip);
  const now = Date.now();
  const attempts = mfaFailedAttempts.get(key) || [];
  attempts.push(now);
  mfaFailedAttempts.set(key, attempts);
  setTimeout(() => {
    const current = mfaFailedAttempts.get(key);
    if (current) {
      const filtered = current.filter((t) => now - t < MFA_WINDOW_MS);
      if (filtered.length === 0) {
        mfaFailedAttempts.delete(key);
      } else {
        mfaFailedAttempts.set(key, filtered);
      }
    }
  }, MFA_WINDOW_MS);
}
function resetMFARateLimit(accountId, ip) {
  const key = getMFARateLimitKey(accountId, ip);
  mfaFailedAttempts.delete(key);
}
app.post("/auth/mfa/challenge", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const { challengeToken, code, recoveryCode } = req.body || {};
  const rateCheck = mfaChallengeLimiter.check(ip);
  if (!rateCheck.allowed) {
    const retrySeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1e3);
    res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${retrySeconds}s.` });
    return;
  }
  if (!challengeToken || typeof challengeToken !== "string") {
    res.status(400).json({ ok: false, error: "Challenge token required." });
    return;
  }
  const preAuth = (0, import_auth.consumePreAuthToken)(challengeToken);
  if (!preAuth) {
    res.status(401).json({ ok: false, error: "Invalid or expired challenge token." });
    return;
  }
  const account = (0, import_account_store.getAccountById)(preAuth.accountId);
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
    const { authenticator } = require("otplib");
    verified = authenticator.verify({ token: code, secret: account.mfaSecret });
  } else if (recoveryCode && typeof recoveryCode === "string" && account.recoveryCodesHash) {
    const normalizedCode = recoveryCode.replace(/-/g, "").toUpperCase();
    const submittedHash = import_node_crypto.default.createHash("sha256").update(normalizedCode).digest("hex");
    const storedHashes = account.recoveryCodesHash.split("\n");
    const matchIndex = storedHashes.findIndex((h) => h === submittedHash);
    if (matchIndex !== -1) {
      verified = true;
      const newRecoveryCodes = Array.from(
        { length: 10 },
        () => import_node_crypto.default.randomBytes(4).toString("hex").toUpperCase()
      );
      const newRecoveryHash = newRecoveryCodes.map((code2) => import_node_crypto.default.createHash("sha256").update(code2).digest("hex")).join("\n");
      (0, import_account_store.updateAccount)(account.id, { recoveryCodesHash: newRecoveryHash });
    }
  }
  if (!verified) {
    (0, import_audit.recordAudit)({
      who: account.username,
      what: "MFA challenge failed",
      where: "web-auth",
      result: "failure",
      details: `IP: ${ip}`
    });
    res.status(401).json({ ok: false, error: "Invalid MFA code." });
    return;
  }
  const session = (0, import_session_store.createSession)(account.id, account.role, ip);
  (0, import_auth.setSessionCookie)(res, session.sessionId, session.expiresAt);
  import_logger.logger.info(`\u2705 MFA challenge passed: ${account.username} from ${ip}`);
  (0, import_audit.recordAudit)({
    who: account.username,
    what: "MFA challenge passed",
    where: "web-auth",
    result: "success",
    details: `IP: ${ip}`
  });
  res.json({
    ok: true,
    user: { username: account.username, role: account.role },
    csrfToken: session.csrfToken
  });
});
app.get("/api/accounts", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), (_req, res) => {
  res.json({ ok: true, accounts: (0, import_account_store.listAccounts)() });
});
app.post("/api/accounts", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) {
    res.status(400).json({ ok: false, error: "Username, password, and role are required." });
    return;
  }
  const result = (0, import_account_store.createAccount)({ username, password, role });
  if (result.success) {
    const { recordAudit: recordAudit2 } = require("../security/audit");
    recordAudit2({
      who: authReq.username,
      what: `Created account: ${username} (role: ${role})`,
      where: "web-accounts",
      result: "success"
    });
    res.json({ ok: true, account: result.account });
  } else {
    res.status(400).json({ ok: false, error: result.error });
  }
});
app.put("/api/accounts/:id", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const id = String(req.params.id || "");
  const body = isPlainObject(req.body) ? req.body : {};
  const { username, role, enabled } = body;
  if (username !== void 0 && typeof username !== "string") {
    return sendValidationError(res, "username must be a string");
  }
  if (role !== void 0 && (typeof role !== "string" || !["owner", "admin", "user"].includes(role))) {
    return sendValidationError(res, "role must be one of: owner, admin, user");
  }
  if (enabled !== void 0 && typeof enabled !== "boolean") {
    return sendValidationError(res, "enabled must be a boolean");
  }
  const updates = {};
  if (username !== void 0) updates.username = username;
  if (role !== void 0) updates.role = role;
  if (enabled !== void 0) updates.enabled = enabled;
  const result = (0, import_account_store.updateAccount)(id, updates);
  if (result.success) {
    const { recordAudit: recordAudit2 } = require("../security/audit");
    recordAudit2({
      who: authReq.username,
      what: `Updated account: ${id}`,
      where: "web-accounts",
      result: "success",
      details: JSON.stringify(Object.keys(updates))
    });
    res.json({ ok: true, account: result.account });
  } else {
    res.status(result.error === "Account not found." ? 404 : 400).json({ ok: false, error: result.error });
  }
});
app.delete("/api/accounts/:id", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const id = String(req.params.id || "");
  const account = (0, import_account_store.getAccountById)(id);
  if (!account) {
    res.status(404).json({ ok: false, error: "Account not found." });
    return;
  }
  if (account.id === authReq.accountId) {
    res.status(400).json({ ok: false, error: "Cannot delete your own account." });
    return;
  }
  const result = (0, import_account_store.deleteAccount)(id);
  if (result.success) {
    (0, import_auth.destroyAllSessionsForAccount)(id);
    const { recordAudit: recordAudit2 } = require("../security/audit");
    recordAudit2({
      who: authReq.username,
      what: `Deleted account: ${account.username}`,
      where: "web-accounts",
      result: "success"
    });
    res.json({ ok: true });
  } else {
    res.status(400).json({ ok: false, error: result.error });
  }
});
app.get("/", (_req, res) => {
  res.sendFile(import_node_path.default.join(__dirname, "public", "index.html"));
});
app.get("/features", (_req, res) => {
  res.sendFile(import_node_path.default.join(__dirname, "public", "features.html"));
});
app.get("/docs", (_req, res) => {
  res.sendFile(import_node_path.default.join(__dirname, "public", "docs.html"));
});
app.get("/status", (_req, res) => {
  res.sendFile(import_node_path.default.join(__dirname, "public", "status.html"));
});
app.get("/privacy", (_req, res) => {
  res.sendFile(import_node_path.default.join(__dirname, "public", "privacy.html"));
});
app.get("/terms", (_req, res) => {
  res.sendFile(import_node_path.default.join(__dirname, "public", "terms.html"));
});
app.get("/dashboard", import_roles.requireAuth, (_req, res) => {
  res.sendFile(import_node_path.default.join(__dirname, "public", "dashboard.html"));
});
app.get("/{*splat}", (_req, res) => {
  res.sendFile(import_node_path.default.join(__dirname, "public", "index.html"));
});
app.post("/api/providers/test-connection", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), import_roles.requireCsrf, async (req, res) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    const { protocol, endpoint, apiKey, timeout } = body;
    if (!protocol || typeof protocol !== "string" || !VALID_PROVIDER_PROTOCOLS.has(protocol)) {
      return sendValidationError(res, "Protocol must be one of: openai_compatible, anthropic, gemini, ollama.");
    }
    if (endpoint !== void 0 && endpoint !== null && typeof endpoint !== "string") {
      return sendValidationError(res, "endpoint must be a string");
    }
    if (endpoint && endpoint.length > 2048) {
      return sendValidationError(res, "endpoint must be at most 2048 characters");
    }
    if (apiKey !== void 0 && apiKey !== null && typeof apiKey !== "string") {
      return sendValidationError(res, "apiKey must be a string");
    }
    if (apiKey && apiKey.length > 4096) {
      return sendValidationError(res, "apiKey must be at most 4096 characters");
    }
    let timeoutMs = 15e3;
    if (timeout !== void 0 && timeout !== null) {
      if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout < 1e3 || timeout > 12e4) {
        return sendValidationError(res, "timeout must be a number between 1000 and 120000");
      }
      timeoutMs = timeout;
    }
    const apiKeyStr = typeof apiKey === "string" ? apiKey : "";
    const endpointStr = typeof endpoint === "string" ? endpoint : void 0;
    const result = await (0, import_platform.testProviderConnection)(protocol, endpointStr, apiKeyStr, timeoutMs);
    res.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    import_logger.logger.error("Connection test failed:", msg);
    res.status(400).json({ ok: false, error: msg });
  }
});
app.get("/api/guilds/:guildId/settings", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = (0, import_control.getGuildConfig)(guildId);
  res.json({ ok: true, config });
});
app.put("/api/guilds/:guildId/settings", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Request body must be a JSON object");
  }
  const result = (0, import_control.updateGuildConfig)(guildId, req.body);
  if (result.success) {
    res.json({ ok: true, message: result.message });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});
app.get("/api/guilds/:guildId/personality", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = (0, import_control.getGuildConfig)(guildId);
  res.json({ ok: true, config: config.personality });
});
app.put("/api/guilds/:guildId/personality", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Personality body must be a JSON object");
  }
  const result = (0, import_control.updateGuildConfig)(guildId, { personality: req.body });
  if (result.success) {
    res.json({ ok: true, message: "Personality updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});
app.get("/api/guilds/:guildId/moderation", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = (0, import_control.getGuildConfig)(guildId);
  res.json({ ok: true, config: config.moderation });
});
app.put("/api/guilds/:guildId/moderation", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Moderation body must be a JSON object");
  }
  const result = (0, import_control.updateGuildConfig)(guildId, { moderation: req.body });
  if (result.success) {
    res.json({ ok: true, message: "Moderation settings updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});
app.get("/api/guilds/:guildId/automation", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = (0, import_control.getGuildConfig)(guildId);
  res.json({ ok: true, config: config.automation });
});
app.get("/api/guilds/:guildId/social", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = (0, import_control.getGuildConfig)(guildId);
  res.json({ ok: true, config: config.community });
});
app.get("/api/guilds/:guildId/analytics", import_roles.requireAuth, import_roles.requireGuildAuth, (_req, res) => {
  const usage = (0, import_control.getUsageStats)();
  res.json({ ok: true, usage });
});
app.get("/api/system/health", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  res.json({ ok: true, health: (0, import_control.getHealth)() });
});
app.get("/api/logs/stream", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const send = (entry) => {
    res.write(`event: log
data: ${JSON.stringify(entry)}

`);
  };
  for (const entry of (0, import_log_stream.getRecentLogs)(100)) send(entry);
  const unsubscribe = (0, import_log_stream.subscribeLogs)(send);
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15e3);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});
app.get("/api/guilds/:guildId/ai", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = (0, import_control.getGuildConfig)(guildId);
  res.json({ ok: true, config: config.ai || {} });
});
app.put("/api/guilds/:guildId/ai", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "AI body must be a JSON object");
  }
  const result = (0, import_control.updateGuildConfig)(guildId, { ai: req.body });
  if (result.success) {
    res.json({ ok: true, message: "AI configuration updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});
app.get("/api/guilds/:guildId/ai/routing", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = (0, import_control.getGuildConfig)(guildId);
  res.json({ ok: true, config: config.routing || {} });
});
app.put("/api/guilds/:guildId/ai/routing", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Routing body must be a JSON object");
  }
  const result = (0, import_control.updateGuildConfig)(guildId, { routing: req.body });
  if (result.success) {
    res.json({ ok: true, message: "Routing configuration updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});
app.get("/api/guilds/:guildId/ai/limits", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = (0, import_control.getGuildConfig)(guildId);
  res.json({ ok: true, config: config.limits || {} });
});
app.put("/api/guilds/:guildId/ai/limits", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Limits body must be a JSON object");
  }
  const result = (0, import_control.updateGuildConfig)(guildId, { limits: req.body });
  if (result.success) {
    res.json({ ok: true, message: "Usage limits updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});
app.get("/api/guilds/:guildId/models", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = (0, import_control.getGuildConfig)(guildId);
  const allModels = import_platform.providerService.getAllDiscoveredModels();
  res.json({ ok: true, models: allModels, configured: config.models || [] });
});
app.put("/api/guilds/:guildId/models", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!Array.isArray(req.body)) {
    return sendValidationError(res, "models body must be a JSON array");
  }
  const result = (0, import_control.updateGuildConfig)(guildId, { models: req.body });
  if (result.success) {
    res.json({ ok: true, message: "Model configuration updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});
app.get("/api/security/sessions", import_roles.requireAuth, (req, res) => {
  const authReq = req;
  const { listSessionsForAccount: listSessionsForAccount2 } = require("../control/session-store");
  const sessions = listSessionsForAccount2(authReq.accountId);
  res.json({ ok: true, sessions: sessions.map((s) => ({
    sessionId: s.sessionId.slice(0, 8) + "...",
    isCurrent: s.sessionId === authReq.sessionId,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    lastSeenIp: s.lastSeenIp
  })) });
});
app.post("/api/security/sessions/:id/revoke", import_roles.requireAuth, import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const sessionId = typeof req.params.id === "string" ? req.params.id : "";
  if (!sessionId || sessionId.length < 8) {
    return sendValidationError(res, "Session id required (minimum 8 characters).");
  }
  const { listSessionsForAccount: listSessionsForAccount2, revokeSession: revokeSession2 } = require("../control/session-store");
  const sessions = listSessionsForAccount2(authReq.accountId);
  let revoked = 0;
  for (const s of sessions) {
    if (s.sessionId === authReq.sessionId) continue;
    if (s.sessionId === sessionId || s.sessionId.startsWith(sessionId)) {
      if (revokeSession2(s.sessionId, authReq.accountId)) revoked++;
    }
  }
  (0, import_audit.recordAudit)({
    who: authReq.username || "unknown",
    what: "Session revoked",
    where: "web-auth",
    result: "success",
    details: `Revoked ${revoked} matching session(s)`
  });
  res.json({ ok: true, revoked });
});
app.post("/api/security/sessions/revoke-all", import_roles.requireAuth, import_roles.requireCsrf, (req, res) => {
  const authReq = req;
  const { destroyAllSessionsForAccount: destroyAllSessionsForAccount2 } = require("../control/session-store");
  const count = destroyAllSessionsForAccount2(authReq.accountId);
  (0, import_audit.recordAudit)({
    who: authReq.username || "unknown",
    what: "All sessions revoked",
    where: "web-auth",
    result: "success",
    details: `Revoked ${count} sessions`
  });
  res.json({ ok: true, revoked: count });
});
app.get("/api/security/rate-limits", import_roles.requireAuth, (req, res) => {
  res.json({ ok: true, rateLimits: { globalEnabled: true, windowMs: 6e4, maxRequests: 120 } });
});
app.get("/api/security/credentials", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), (req, res) => {
  const authReq = req;
  const { getAccountIdentities: getAccountIdentities2 } = require("../control/linked-identities");
  const identities = getAccountIdentities2(authReq.accountId);
  res.json({ ok: true, credentials: identities.map((i) => ({
    provider: i.provider,
    displayName: i.displayName,
    linkedAt: i.createdAt,
    lastUsedAt: i.lastUsedAt,
    hasApiKey: true
  })) });
});
app.get("/api/guilds/:guildId/support", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  try {
    const { getSupportCaseManager } = require("../support");
    const manager = getSupportCaseManager();
    const status = typeof req.query.status === "string" ? req.query.status : void 0;
    const cases = manager.getGuildCases(
      guildId,
      status,
      void 0,
      100
    );
    res.json({ ok: true, cases, guildId });
  } catch (err) {
    import_logger.logger.error("Failed to list support cases:", err);
    res.status(500).json({ ok: false, error: "Failed to load support cases" });
  }
});
app.get("/api/guilds/:guildId/support/:caseId", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
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
    import_logger.logger.error("Failed to load support case:", err);
    res.status(500).json({ ok: false, error: "Failed to load support case" });
  }
});
app.put("/api/guilds/:guildId/support/:caseId", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const caseId = typeof req.params.caseId === "string" ? req.params.caseId : "";
  const authReq = req;
  try {
    const { getSupportCaseManager } = require("../support");
    const { canTransition } = require("../support");
    const manager = getSupportCaseManager();
    const supportCase = manager.getCase(caseId);
    if (!supportCase || supportCase.guildId !== guildId) {
      return res.status(404).json({ ok: false, error: "Case not found" });
    }
    const body = req.body || {};
    const newStatus = body.status;
    const note = typeof body.note === "string" ? body.note : void 0;
    if (!newStatus || typeof newStatus !== "string") {
      return res.status(400).json({ ok: false, error: "status is required" });
    }
    if (note !== void 0) {
      if (note.length > 4e3) {
        return res.status(400).json({ ok: false, error: "note must be at most 4000 characters" });
      }
      if (note.length > 0 && note.trim().length === 0) {
        return res.status(400).json({ ok: false, error: "note must not be blank" });
      }
    }
    if (!canTransition(supportCase.status, newStatus)) {
      return res.status(409).json({
        ok: false,
        error: `Invalid transition: ${supportCase.status} \u2192 ${newStatus}`
      });
    }
    const updated = manager.transitionCase(caseId, newStatus, authReq.accountId || "web");
    if (!updated) {
      return res.status(409).json({ ok: false, error: "Transition rejected (conflict or invalid)" });
    }
    if (note) {
      manager.addMessage(caseId, authReq.accountId || "web", note, false);
    }
    res.json({ ok: true, case: updated });
  } catch (err) {
    import_logger.logger.error("Failed to update support case:", err);
    res.status(500).json({ ok: false, error: "Failed to update support case" });
  }
});
app.get("/api/guilds/:guildId/automation/rules", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  try {
    const { getAutomationRules } = require("../community/automation");
    const rules = getAutomationRules(guildId);
    res.json({ ok: true, rules });
  } catch (err) {
    import_logger.logger.error("Failed to list automation rules:", err);
    res.status(500).json({ ok: false, error: "Failed to load automation rules" });
  }
});
app.post("/api/guilds/:guildId/automation/rules", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const authReq = req;
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
    if (body.description !== void 0 && body.description !== null) {
      if (typeof body.description !== "string" || body.description.length > 500) {
        return res.status(400).json({ ok: false, error: "description must be a string (max 500 chars)" });
      }
    }
    if (body.enabled !== void 0 && typeof body.enabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "enabled must be a boolean" });
    }
    if (body.triggerConfig !== void 0 && body.triggerConfig !== null && !isPlainObject(body.triggerConfig)) {
      return res.status(400).json({ ok: false, error: "triggerConfig must be a plain object" });
    }
    if (body.conditions !== void 0 && !Array.isArray(body.conditions)) {
      return res.status(400).json({ ok: false, error: "conditions must be an array" });
    }
    if (body.actions !== void 0 && !Array.isArray(body.actions)) {
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
      description: typeof body.description === "string" ? body.description : void 0,
      enabled: typeof body.enabled === "boolean" ? body.enabled : true,
      triggerType,
      triggerConfig: isPlainObject(body.triggerConfig) ? body.triggerConfig : {},
      conditions: Array.isArray(body.conditions) ? body.conditions : [],
      actions: Array.isArray(body.actions) ? body.actions : [],
      createdBy: authReq.accountId
    }, authReq.accountId || "web", authReq.username || "web");
    res.status(201).json({ ok: true, rule });
  } catch (err) {
    import_logger.logger.error("Failed to create automation rule:", err);
    res.status(500).json({ ok: false, error: "Failed to create automation rule" });
  }
});
app.put("/api/guilds/:guildId/automation/rules/:ruleId", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const ruleId = typeof req.params.ruleId === "string" ? req.params.ruleId : "";
  const authReq = req;
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    const updates = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name || name.length > 120) {
        return res.status(400).json({ ok: false, error: "name must be 1-120 characters" });
      }
      updates.name = name;
    }
    if (body.description !== void 0) {
      if (typeof body.description !== "string" || body.description.length > 500) {
        return res.status(400).json({ ok: false, error: "description must be a string (max 500 chars)" });
      }
      updates.description = body.description;
    }
    if (body.enabled !== void 0) {
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
    if (body.triggerConfig !== void 0) {
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
    } else if (body.conditions !== void 0) {
      return res.status(400).json({ ok: false, error: "conditions must be an array" });
    }
    if (Array.isArray(body.actions)) {
      if (body.actions.length > 50) {
        return res.status(400).json({ ok: false, error: "actions must contain at most 50 entries" });
      }
      updates.actions = body.actions;
    } else if (body.actions !== void 0) {
      return res.status(400).json({ ok: false, error: "actions must be an array" });
    }
    const { updateAutomationRule } = require("../community/automation");
    const rule = updateAutomationRule(guildId, ruleId, updates, authReq.accountId || "web", authReq.username || "web");
    if (!rule) {
      return res.status(404).json({ ok: false, error: "Rule not found" });
    }
    res.json({ ok: true, rule });
  } catch (err) {
    import_logger.logger.error("Failed to update automation rule:", err);
    res.status(500).json({ ok: false, error: "Failed to update automation rule" });
  }
});
app.delete("/api/guilds/:guildId/automation/rules/:ruleId", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const ruleId = typeof req.params.ruleId === "string" ? req.params.ruleId : "";
  const authReq = req;
  try {
    const { deleteAutomationRule } = require("../community/automation");
    const ok = deleteAutomationRule(guildId, ruleId, authReq.accountId || "web", authReq.username || "web");
    if (!ok) {
      return res.status(404).json({ ok: false, error: "Rule not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    import_logger.logger.error("Failed to delete automation rule:", err);
    res.status(500).json({ ok: false, error: "Failed to delete automation rule" });
  }
});
app.get("/api/guilds/:guildId/social/config", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  const config = (0, import_control.getGuildConfig)(guildId);
  res.json({ ok: true, config: config.community || {} });
});
app.put("/api/guilds/:guildId/social/config", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), import_roles.requireCsrf, import_roles.requireGuildAuth, (req, res) => {
  const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
  if (!isPlainObject(req.body)) {
    return sendValidationError(res, "Social config body must be a JSON object");
  }
  const result = (0, import_control.updateGuildConfig)(guildId, { community: req.body });
  if (result.success) {
    res.json({ ok: true, message: "Social configuration updated." });
  } else {
    res.status(500).json({ ok: false, error: result.message });
  }
});
app.get("/api/audit/search", import_roles.requireAuth, (0, import_roles.requireRole)("owner"), (req, res) => {
  const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "100", 10) || 100;
  const guildId = typeof req.query.guildId === "string" ? req.query.guildId : void 0;
  const action = typeof req.query.action === "string" ? req.query.action : void 0;
  const entries = (0, import_control.getAuditEntries)(limit, guildId);
  const filtered = action ? entries.filter((e) => e.what?.includes(action)) : entries;
  res.json({ ok: true, entries: filtered, total: filtered.length });
});
app.get("/api/guilds/:guildId/providers/health", import_roles.requireAuth, import_roles.requireGuildAuth, (req, res) => {
  const health = (0, import_control.getProviderStatus)();
  res.json({ ok: true, health });
});
app.post("/api/providers/:id/health", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), import_roles.requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  try {
    if (!import_platform.providerService.getProvider(id)) {
      return res.status(404).json({ ok: false, error: "Provider not found" });
    }
    const router2 = new (require("../ai/router")).AIRouter([]);
    const result = await router2.probeProvider(id);
    res.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg === "Provider not found" ? 404 : 502;
    res.status(status).json({ ok: false, error: msg });
  }
});
app.get("/api/system/diagnostics/extended", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  const diagnostics = (0, import_control.runDiagnostics)();
  const providerHealth = (0, import_control.getProviderStatus)();
  const guildConfigs = import_guild_config.getAllGuildConfigs ? (0, import_guild_config.getAllGuildConfigs)() : [];
  res.json({ ok: true, diagnostics, providerHealth, guildConfigs: guildConfigs.length });
});
app.get("/api/providers/catalog", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
  try {
    const { providerCatalog } = require("../ai/providers");
    res.json({ ok: true, catalog: providerCatalog, total: providerCatalog.length });
  } catch {
    res.json({ ok: true, catalog: [], total: 0 });
  }
});
app.get("/api/providers/catalog/free", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), (_req, res) => {
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
app.get("/api/providers/discover", import_roles.requireAuth, (0, import_roles.requireRole)("admin"), async (req, res) => {
  try {
    const results = [];
    const allProviders = import_providers.providerRegistry.getAll();
    for (const p of allProviders) {
      results.push({
        name: p.name,
        available: p.isAvailable(),
        models: []
      });
    }
    res.json({ ok: true, providers: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, error: msg });
  }
});
app.use((err, _req, res, _next) => {
  import_logger.logger.error("Unhandled Express error:", err?.message || String(err));
  if (res.headersSent) return;
  const msg = process.env.NODE_ENV === "production" ? "Internal server error" : err?.message || "Unknown error";
  res.status(500).json({ ok: false, error: msg });
});
let httpServer = null;
function getHttpServer() {
  return httpServer;
}
function startWebServer(webRouter, healthStatus, webUsageManager, webUsageStats, versionFn, webMemory, webSystemUsage) {
  router = webRouter;
  getHealthStatus = healthStatus;
  if (webUsageManager) usageManager = webUsageManager;
  if (webUsageStats) usageStats = webUsageStats;
  if (versionFn) getVersionFn = versionFn;
  (0, import_control.initControlLayer)(webRouter, usageManager, webMemory || {}, getVersionFn, webSystemUsage);
  httpServer = app.listen(PORT, "0.0.0.0", () => {
    import_logger.logger.info(`AshenAI Web listening on port ${PORT}`);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getHttpServer,
  startWebServer
});
