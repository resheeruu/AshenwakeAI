import crypto from "crypto";
import { logger } from "../logger";
import { recordAudit } from "../security/audit";

const ITERATIONS = 100_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export interface OwnerSession {
  sessionId: string;
  ownerUsername: string;
  createdAt: number;
  expiresAt: number;
  ip: string;
}

export interface LoginResult {
  success: boolean;
  sessionId?: string;
  expiresAt?: number;
  reason?: "not_configured" | "rate_limited" | "invalid_credentials";
}

interface SessionStore {
  sessions: Map<string, OwnerSession>;
  loginAttempts: Map<string, number[]>;
}

const store: SessionStore = {
  sessions: new Map(),
  loginAttempts: new Map(),
};

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const SESSION_COOKIE = "ashenai_owner_sid";

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || crypto.randomBytes(32).toString("hex");
  const hash = crypto.pbkdf2Sync(password, useSalt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return { hash, salt: useSalt };
}

function getOwnerCredentials(): { username: string; passwordHash: string; salt: string } | null {
  const username = process.env.ASHENAI_OWNER_USERNAME?.trim();
  const passwordHash = process.env.ASHENAI_OWNER_PASSWORD_HASH?.trim();
  const salt = process.env.ASHENAI_OWNER_PASSWORD_SALT?.trim();

  if (!username || !passwordHash || !salt) return null;
  return { username, passwordHash, salt };
}

export function authenticateOwner(
  username: string,
  password: string,
  ip: string,
): LoginResult {
  const credentials = getOwnerCredentials();
  if (!credentials) {
    logger.warn("⚠️ Owner credentials not configured in environment.");
    return { success: false, reason: "not_configured" };
  }

  const attempts = store.loginAttempts.get(ip) || [];
  const now = Date.now();
  const recentAttempts = attempts.filter((t) => now - t < LOGIN_WINDOW_MS);

  if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
    logger.warn(`🔒 Login rate limit exceeded for IP ${ip}.`);
    recordAudit({
      who: `ip:${ip}`,
      what: `Login rate limit exceeded for user: ${username}`,
      where: "control-auth",
      result: "denied",
      details: `${recentAttempts.length} attempts in window`,
    });
    return { success: false, reason: "rate_limited" };
  }

  if (username !== credentials.username) {
    recentAttempts.push(now);
    store.loginAttempts.set(ip, recentAttempts);
    recordAudit({
      who: `ip:${ip}`,
      what: `Failed login: wrong username: ${username}`,
      where: "control-auth",
      result: "failure",
    });
    return { success: false, reason: "invalid_credentials" };
  }

  const { hash } = hashPassword(password, credentials.salt);
  if (hash !== credentials.passwordHash) {
    recentAttempts.push(now);
    store.loginAttempts.set(ip, recentAttempts);
    recordAudit({
      who: `ip:${ip}`,
      what: `Failed login: wrong password for ${username}`,
      where: "control-auth",
      result: "failure",
    });
    return { success: false, reason: "invalid_credentials" };
  }

  store.loginAttempts.delete(ip);

  const sessionId = crypto.randomBytes(32).toString("hex");
  const session: OwnerSession = {
    sessionId,
    ownerUsername: username,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
    ip,
  };

  store.sessions.set(sessionId, session);

  logger.info(`✅ Owner login successful: ${username} from ${ip}`);
  recordAudit({
    who: username,
    what: "Owner login successful",
    where: "control-auth",
    result: "success",
    details: `IP: ${ip}`,
  });

  return { success: true, sessionId, expiresAt: session.expiresAt };
}

export function validateSession(sessionId: string, ip: string): OwnerSession | null {
  if (!sessionId) return null;

  const session = store.sessions.get(sessionId);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    store.sessions.delete(sessionId);
    return null;
  }

  if (session.ip !== ip) {
    logger.warn(`⚠️ Session IP mismatch: expected ${session.ip}, got ${ip}`);
    return null;
  }

  return session;
}

export function destroySession(sessionId: string): boolean {
  const session = store.sessions.get(sessionId);
  if (!session) return false;

  store.sessions.delete(sessionId);
  logger.info(`🔒 Session destroyed for ${session.ownerUsername}`);
  return true;
}

export function createLoginRateLimiter(): {
  check: (ip: string) => { allowed: boolean; retryAfterMs?: number };
  reset: (ip: string) => void;
} {
  return {
    check(ip: string) {
      const attempts = store.loginAttempts.get(ip) || [];
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
      store.loginAttempts.delete(ip);
    },
  };
}

export function setSessionCookie(
  res: { setHeader: (name: string, value: string) => void },
  sessionId: string,
  expiresAt: number,
): void {
  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
  const cookie = [
    `${SESSION_COOKIE}=${sessionId}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    isProduction ? `Secure` : "",
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join("; ");

  res.setHeader("Set-Cookie", cookie);
}

export function getSessionFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([a-f0-9]+)`));
  return match ? match[1] : null;
}

export function clearSessionCookie(
  res: { setHeader: (name: string, value: string) => void },
): void {
  const isProduction = process.env.NODE_ENV === "production";
  const cookie = [
    `${SESSION_COOKIE}=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    isProduction ? `Secure` : "",
    `Max-Age=0`,
  ].filter(Boolean).join("; ");

  res.setHeader("Set-Cookie", cookie);
}

export function hashPasswordPublic(password: string): { hash: string; salt: string } {
  return hashPassword(password);
}
