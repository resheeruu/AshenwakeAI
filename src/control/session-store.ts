import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "../logger";

const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const SESSION_ROTATION_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 1000;
const SESSION_COOKIE = "ashenai_owner_sid";

export interface Session {
  sessionId: string;
  accountId: string;
  role: "owner" | "admin" | "user";
  createdAt: number;
  expiresAt: number;
  csrfToken: string;
  lastRotatedAt: number;
  lastSeenIp: string;
}

let sessionStore: Map<string, Session> = new Map();

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSessions(): void {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) {
      sessionStore = new Map();
      return;
    }
    const raw = fs.readFileSync(SESSIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      sessionStore = new Map();
      return;
    }
    const now = Date.now();
    sessionStore = new Map();
    for (const s of parsed) {
      if (
        s &&
        typeof s.sessionId === "string" &&
        typeof s.accountId === "string" &&
        typeof s.expiresAt === "number" &&
        s.expiresAt > now
      ) {
        sessionStore.set(s.sessionId, s as Session);
      }
    }
  } catch {
    sessionStore = new Map();
  }
}

function saveSessions(): void {
  try {
    ensureDataDir();
    const arr = Array.from(sessionStore.values());
    const tmpPath = SESSIONS_FILE + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(arr, null, 2), "utf8");
    fs.renameSync(tmpPath, SESSIONS_FILE);
  } catch (error) {
    logger.warn(
      `⚠️ Could not save sessions: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessionStore) {
    if (session.expiresAt <= now) {
      sessionStore.delete(id);
    }
  }
}

function enforceMaxSessions(): void {
  if (sessionStore.size <= MAX_SESSIONS) return;
  const entries = Array.from(sessionStore.entries());
  entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
  const toRemove = entries.slice(0, sessionStore.size - MAX_SESSIONS);
  for (const [id] of toRemove) {
    sessionStore.delete(id);
  }
}

loadSessions();
pruneExpired();
saveSessions();

export function createSession(
  accountId: string,
  role: "owner" | "admin" | "user",
  ip: string,
): Session {
  pruneExpired();
  enforceMaxSessions();

  const now = Date.now();
  const session: Session = {
    sessionId: crypto.randomBytes(32).toString("hex"),
    accountId,
    role,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
    csrfToken: crypto.randomBytes(32).toString("hex"),
    lastRotatedAt: now,
    lastSeenIp: ip,
  };

  sessionStore.set(session.sessionId, session);
  saveSessions();

  return session;
}

export function validateSession(sessionId: string): Session | null {
  if (!sessionId) return null;
  const session = sessionStore.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(sessionId);
    saveSessions();
    return null;
  }
  return session;
}

export function touchSession(sessionId: string, ip: string): void {
  const session = sessionStore.get(sessionId);
  if (!session) return;
  session.lastSeenIp = ip;
  sessionStore.set(sessionId, session);
  saveSessions();
}

export function rotateSession(sessionId: string): {
  newSessionId: string;
  csrfToken: string;
  expiresAt: number;
} | null {
  const session = validateSession(sessionId);
  if (!session) return null;

  const age = Date.now() - session.lastRotatedAt;
  if (age < SESSION_ROTATION_MS) {
    return {
      newSessionId: session.sessionId,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    };
  }

  const now = Date.now();
  const newSession: Session = {
    ...session,
    sessionId: crypto.randomBytes(32).toString("hex"),
    csrfToken: crypto.randomBytes(32).toString("hex"),
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
    lastRotatedAt: now,
  };

  sessionStore.delete(sessionId);
  sessionStore.set(newSession.sessionId, newSession);
  saveSessions();

  logger.info(`🔄 Session rotated for account ${session.accountId}`);
  return {
    newSessionId: newSession.sessionId,
    csrfToken: newSession.csrfToken,
    expiresAt: newSession.expiresAt,
  };
}

export function destroySession(sessionId: string): boolean {
  const session = sessionStore.get(sessionId);
  if (!session) return false;
  sessionStore.delete(sessionId);
  saveSessions();
  return true;
}

export function destroyAllSessionsForAccount(accountId: string): number {
  let count = 0;
  for (const [id, session] of sessionStore) {
    if (session.accountId === accountId) {
      sessionStore.delete(id);
      count++;
    }
  }
  if (count > 0) saveSessions();
  return count;
}

export function validateCsrfToken(
  sessionId: string,
  token: string,
): boolean {
  const session = validateSession(sessionId);
  if (!session) return false;
  if (!token || token.length !== 64) return false;
  return crypto.timingSafeEqual(
    Buffer.from(session.csrfToken, "hex"),
    Buffer.from(token, "hex"),
  );
}

export function getCsrfToken(sessionId: string): string | null {
  const session = validateSession(sessionId);
  return session?.csrfToken ?? null;
}

export function getSessionFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([a-f0-9]+)`));
  return match ? match[1] : null;
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
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    isProduction ? "Secure" : "",
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");

  res.setHeader("Set-Cookie", cookie);
}

export function clearSessionCookie(
  res: { setHeader: (name: string, value: string) => void },
): void {
  const isProduction = process.env.NODE_ENV === "production";
  const cookie = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    isProduction ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");

  res.setHeader("Set-Cookie", cookie);
}

export function getActiveSessionCount(): number {
  pruneExpired();
  return sessionStore.size;
}

export { SESSION_COOKIE };
