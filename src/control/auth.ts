import { recordAudit } from "../security/audit";
import {
  getEnabledAccountByUsername,
  verifyPassword,
  hashPassword,
  changePassword as changeAccountPassword,
  type Account,
} from "./account-store";
import {
  createSession,
  validateSession as validateSessionRaw,
  destroySession as destroySessionRaw,
  destroyAllSessionsForAccount,
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
  validateCsrfToken,
  getCsrfToken,
  rotateSession,
  type Session,
} from "./session-store";

export interface LoginResult {
  success: boolean;
  sessionId?: string;
  expiresAt?: number;
  csrfToken?: string;
  role?: "owner" | "admin" | "user";
  username?: string;
  reason?: "not_configured" | "rate_limited" | "invalid_credentials" | "disabled";
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const loginAttempts = new Map<string, number[]>();
const usernameAttempts = new Map<string, number[]>();

function cleanupAttempts(): void {
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

export function authenticateOwner(
  username: string,
  password: string,
  ip: string,
): LoginResult {
  const ipAttempts = loginAttempts.get(ip) || [];
  const now = Date.now();
  const recentIpAttempts = ipAttempts.filter((t) => now - t < LOGIN_WINDOW_MS);

  if (recentIpAttempts.length >= MAX_LOGIN_ATTEMPTS) {
    logger_warn(`🔒 Login rate limit exceeded for IP ${ip}.`);
    recordAudit({
      who: `ip:${ip}`,
      what: "Login rate limit exceeded",
      where: "control-auth",
      result: "denied",
      details: `${recentIpAttempts.length} attempts in window`,
    });
    return { success: false, reason: "rate_limited" };
  }

  const userAttempts = usernameAttempts.get(username) || [];
  const recentUserAttempts = userAttempts.filter((t) => now - t < LOGIN_WINDOW_MS);
  if (recentUserAttempts.length >= MAX_LOGIN_ATTEMPTS) {
    logger_warn(`🔒 Login rate limit exceeded for username ${username}.`);
    recordAudit({
      who: `ip:${ip}`,
      what: `Login rate limit exceeded for user: ${username}`,
      where: "control-auth",
      result: "denied",
      details: `${recentUserAttempts.length} attempts in window`,
    });
    return { success: false, reason: "rate_limited" };
  }

  const account = getEnabledAccountByUsername(username);
  if (!account) {
    recentIpAttempts.push(now);
    loginAttempts.set(ip, recentIpAttempts);
    recentUserAttempts.push(now);
    usernameAttempts.set(username, recentUserAttempts);
    recordAudit({
      who: `ip:${ip}`,
      what: `Failed login: invalid credentials for user: ${username}`,
      where: "control-auth",
      result: "failure",
    });
    return { success: false, reason: "invalid_credentials" };
  }

  if (!account.enabled) {
    recordAudit({
      who: account.username,
      what: "Login attempt on disabled account",
      where: "control-auth",
      result: "denied",
    });
    return { success: false, reason: "disabled" };
  }

  if (!verifyPassword(password, account.passwordHash, account.passwordSalt)) {
    recentIpAttempts.push(now);
    loginAttempts.set(ip, recentIpAttempts);
    recentUserAttempts.push(now);
    usernameAttempts.set(username, recentUserAttempts);
    recordAudit({
      who: account.username,
      what: "Failed login: wrong password",
      where: "control-auth",
      result: "failure",
      details: `IP: ${ip}`,
    });
    return { success: false, reason: "invalid_credentials" };
  }

  loginAttempts.delete(ip);
  usernameAttempts.delete(username);

  const session = createSession(account.id, account.role, ip);

  const { updateAccountCredentials } = require("./account-store");
  updateAccountCredentials(account.id, { lastLoginAt: Date.now() });

  logger_info(`✅ Login successful: ${account.username} (role: ${account.role}) from ${ip}`);
  recordAudit({
    who: account.username,
    what: "Login successful",
    where: "control-auth",
    result: "success",
    details: `IP: ${ip}, role: ${account.role}`,
  });

  return {
    success: true,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    csrfToken: session.csrfToken,
    role: session.role,
    username: account.username,
  };
}

export function validateSession(sessionId: string): Session | null {
  return validateSessionRaw(sessionId);
}

export function destroySession(sessionId: string): boolean {
  return destroySessionRaw(sessionId);
}

export function createLoginRateLimiter(): {
  check: (ip: string) => { allowed: boolean; retryAfterMs?: number };
  reset: (ip: string) => void;
} {
  return {
    check(ip: string) {
      const attempts = loginAttempts.get(ip) || [];
      const now = Date.now();
      const recentAttempts = attempts.filter((t) => now - t < LOGIN_WINDOW_MS);
      if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
        const oldestAttempt = Math.min(...recentAttempts);
        const retryAfterMs = LOGIN_WINDOW_MS - (now - oldestAttempt);
        return { allowed: false, retryAfterMs };
      }
      return { allowed: true };
    },
    reset(ip: string) {
      loginAttempts.delete(ip);
    },
  };
}

export {
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
  validateCsrfToken,
  getCsrfToken,
  rotateSession,
  destroyAllSessionsForAccount,
  type Session,
};

function logger_warn(msg: string): void {
  try {
    const { logger } = require("../logger");
    logger.warn(msg);
  } catch {
    console.warn(msg);
  }
}

function logger_info(msg: string): void {
  try {
    const { logger } = require("../logger");
    logger.info(msg);
  } catch {
    console.log(msg);
  }
}
