"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var auth_exports = {};
__export(auth_exports, {
  authenticateOwner: () => authenticateOwner,
  clearSessionCookie: () => import_session_store.clearSessionCookie,
  consumePreAuthToken: () => import_session_store.consumePreAuthToken,
  createLoginRateLimiter: () => createLoginRateLimiter,
  destroyAllSessionsForAccount: () => import_session_store.destroyAllSessionsForAccount,
  destroySession: () => destroySession,
  getCsrfToken: () => import_session_store.getCsrfToken,
  getSessionFromCookie: () => import_session_store.getSessionFromCookie,
  rotateSession: () => import_session_store.rotateSession,
  setSessionCookie: () => import_session_store.setSessionCookie,
  validateCsrfToken: () => import_session_store.validateCsrfToken,
  validateSession: () => validateSession
});
module.exports = __toCommonJS(auth_exports);
var import_audit = require("../security/audit");
var import_account_store = require("./account-store");
var import_session_store = require("./session-store");
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1e3;
const loginAttempts = /* @__PURE__ */ new Map();
const usernameAttempts = /* @__PURE__ */ new Map();
function cleanupAttempts() {
  const now = Date.now();
  for (const [key, attempts] of loginAttempts) {
    const recent = attempts.filter((t) => now - t < LOGIN_WINDOW_MS);
    if (recent.length === 0) loginAttempts.delete(key);
    else loginAttempts.set(key, recent);
  }
  for (const [key, attempts] of usernameAttempts) {
    const recent = attempts.filter((t) => now - t < LOGIN_WINDOW_MS);
    if (recent.length === 0) usernameAttempts.delete(key);
    else usernameAttempts.set(key, recent);
  }
}
setInterval(cleanupAttempts, LOGIN_WINDOW_MS).unref();
function authenticateOwner(username, password, ip) {
  const ipAttempts = loginAttempts.get(ip) || [];
  const now = Date.now();
  const recentIpAttempts = ipAttempts.filter((t) => now - t < LOGIN_WINDOW_MS);
  if (recentIpAttempts.length >= MAX_LOGIN_ATTEMPTS) {
    logger_warn(`\u{1F512} Login rate limit exceeded for IP ${ip}.`);
    (0, import_audit.recordAudit)({
      who: `ip:${ip}`,
      what: "Login rate limit exceeded",
      where: "control-auth",
      result: "denied",
      details: `${recentIpAttempts.length} attempts in window`
    });
    return { success: false, reason: "rate_limited" };
  }
  const userAttempts = usernameAttempts.get(username) || [];
  const recentUserAttempts = userAttempts.filter((t) => now - t < LOGIN_WINDOW_MS);
  if (recentUserAttempts.length >= MAX_LOGIN_ATTEMPTS) {
    logger_warn(`\u{1F512} Login rate limit exceeded for username ${username}.`);
    (0, import_audit.recordAudit)({
      who: `ip:${ip}`,
      what: `Login rate limit exceeded for user: ${username}`,
      where: "control-auth",
      result: "denied",
      details: `${recentUserAttempts.length} attempts in window`
    });
    return { success: false, reason: "rate_limited" };
  }
  const account = (0, import_account_store.getAccountByUsername)(username);
  if (!account) {
    recentIpAttempts.push(now);
    loginAttempts.set(ip, recentIpAttempts);
    recentUserAttempts.push(now);
    usernameAttempts.set(username, recentUserAttempts);
    (0, import_audit.recordAudit)({
      who: `ip:${ip}`,
      what: `Failed login: invalid credentials for user: ${username}`,
      where: "control-auth",
      result: "failure"
    });
    return { success: false, reason: "invalid_credentials" };
  }
  if (!account.enabled) {
    (0, import_audit.recordAudit)({
      who: account.username,
      what: "Login attempt on disabled account",
      where: "control-auth",
      result: "denied"
    });
    return { success: false, reason: "disabled" };
  }
  if (!(0, import_account_store.verifyPassword)(password, account.passwordHash, account.passwordSalt)) {
    recentIpAttempts.push(now);
    loginAttempts.set(ip, recentIpAttempts);
    recentUserAttempts.push(now);
    usernameAttempts.set(username, recentUserAttempts);
    (0, import_audit.recordAudit)({
      who: account.username,
      what: "Failed login: wrong password",
      where: "control-auth",
      result: "failure",
      details: `IP: ${ip}`
    });
    return { success: false, reason: "invalid_credentials" };
  }
  loginAttempts.delete(ip);
  usernameAttempts.delete(username);
  const { updateAccountCredentials } = require("./account-store");
  updateAccountCredentials(account.id, { lastLoginAt: Date.now() });
  if (account.mfaEnabled) {
    const challengeToken = (0, import_session_store.createPreAuthToken)(account.id, account.role, account.username, ip);
    logger_info(`\u{1F510} MFA required for: ${account.username} from ${ip}`);
    (0, import_audit.recordAudit)({
      who: account.username,
      what: "MFA challenge required",
      where: "control-auth",
      result: "denied",
      details: `IP: ${ip}`
    });
    return {
      success: true,
      mfaRequired: true,
      challengeToken,
      mfaAccountId: account.id,
      username: account.username,
      role: account.role
    };
  }
  const session = (0, import_session_store.createSession)(account.id, account.role, ip);
  logger_info(`\u2705 Login successful: ${account.username} (role: ${account.role}) from ${ip}`);
  (0, import_audit.recordAudit)({
    who: account.username,
    what: "Login successful",
    where: "control-auth",
    result: "success",
    details: `IP: ${ip}, role: ${account.role}`
  });
  return {
    success: true,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    csrfToken: session.csrfToken,
    role: session.role,
    username: account.username
  };
}
function validateSession(sessionId) {
  return (0, import_session_store.validateSession)(sessionId);
}
function destroySession(sessionId) {
  return (0, import_session_store.destroySession)(sessionId);
}
function createLoginRateLimiter() {
  const ownAttempts = /* @__PURE__ */ new Map();
  return {
    check(ip) {
      const now = Date.now();
      const attempts = ownAttempts.get(ip) || [];
      const recentAttempts = attempts.filter((t) => now - t < LOGIN_WINDOW_MS);
      if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
        const oldestAttempt = Math.min(...recentAttempts);
        const retryAfterMs = LOGIN_WINDOW_MS - (now - oldestAttempt);
        return { allowed: false, retryAfterMs };
      }
      recentAttempts.push(now);
      ownAttempts.set(ip, recentAttempts);
      return { allowed: true };
    },
    reset(ip) {
      ownAttempts.delete(ip);
    }
  };
}
function logger_warn(msg) {
  try {
    const { logger } = require("../logger");
    logger.warn(msg);
  } catch {
    console.warn(msg);
  }
}
function logger_info(msg) {
  try {
    const { logger } = require("../logger");
    logger.info(msg);
  } catch {
    console.log(msg);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  authenticateOwner,
  clearSessionCookie,
  consumePreAuthToken,
  createLoginRateLimiter,
  destroyAllSessionsForAccount,
  destroySession,
  getCsrfToken,
  getSessionFromCookie,
  rotateSession,
  setSessionCookie,
  validateCsrfToken,
  validateSession
});
