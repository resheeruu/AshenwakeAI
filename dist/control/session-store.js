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
var session_store_exports = {};
__export(session_store_exports, {
  SESSION_COOKIE: () => SESSION_COOKIE,
  clearSessionCookie: () => clearSessionCookie,
  consumePreAuthToken: () => consumePreAuthToken,
  createPreAuthToken: () => createPreAuthToken,
  createSession: () => createSession,
  destroyAllSessionsForAccount: () => destroyAllSessionsForAccount,
  destroySession: () => destroySession,
  getActiveSessionCount: () => getActiveSessionCount,
  getCsrfToken: () => getCsrfToken,
  getSessionFromCookie: () => getSessionFromCookie,
  listSessionsForAccount: () => listSessionsForAccount,
  revokeSession: () => revokeSession,
  rotateSession: () => rotateSession,
  setSessionCookie: () => setSessionCookie,
  touchSession: () => touchSession,
  validateCsrfToken: () => validateCsrfToken,
  validateSession: () => validateSession
});
module.exports = __toCommonJS(session_store_exports);
var import_crypto = __toESM(require("crypto"));
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_logger = require("../logger");
var import_encrypt = require("../security/encrypt");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const SESSIONS_FILE = import_path.default.join(DATA_DIR, "sessions.json");
const SESSION_DURATION_MS = 24 * 60 * 60 * 1e3;
const SESSION_ROTATION_MS = 60 * 60 * 1e3;
const MAX_SESSIONS = 1e3;
const SESSION_COOKIE = "ashenai_owner_sid";
let sessionStore = /* @__PURE__ */ new Map();
let pendingSave = false;
let debounceTimer = null;
let encryptionWarningLogged = false;
function ensureDataDir() {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
function loadSessions() {
  try {
    if (!import_fs.default.existsSync(SESSIONS_FILE)) {
      sessionStore = /* @__PURE__ */ new Map();
      return;
    }
    const raw = import_fs.default.readFileSync(SESSIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      sessionStore = /* @__PURE__ */ new Map();
      return;
    }
    const now = Date.now();
    sessionStore = /* @__PURE__ */ new Map();
    for (const encryptedEntry of parsed) {
      if (!encryptedEntry || typeof encryptedEntry !== "object") continue;
      try {
        const data = (0, import_encrypt.decrypt)(encryptedEntry.data);
        const s = JSON.parse(data);
        if (s && typeof s.sessionId === "string" && typeof s.accountId === "string" && typeof s.expiresAt === "number" && s.expiresAt > now) {
          sessionStore.set(s.sessionId, s);
        }
      } catch {
        continue;
      }
    }
  } catch {
    sessionStore = /* @__PURE__ */ new Map();
  }
}
function saveSessions() {
  try {
    ensureDataDir();
    const arr = Array.from(sessionStore.values());
    const encryptedArr = arr.map((s) => ({
      data: (0, import_encrypt.encrypt)(JSON.stringify(s))
    }));
    const tmpPath = SESSIONS_FILE + ".tmp";
    import_fs.default.writeFileSync(tmpPath, JSON.stringify(encryptedArr, null, 2), "utf8");
    import_fs.default.renameSync(tmpPath, SESSIONS_FILE);
  } catch (error) {
    import_logger.logger.warn(
      `\u26A0\uFE0F Could not save sessions: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
function debouncedSave() {
  if (pendingSave) return;
  pendingSave = true;
  debounceTimer = setTimeout(() => {
    pendingSave = false;
    debounceTimer = null;
    saveSessions();
  }, 500);
}
function pruneExpired() {
  const now = Date.now();
  for (const [id, session] of sessionStore) {
    if (session.expiresAt <= now) {
      sessionStore.delete(id);
    }
  }
}
function enforceMaxSessions() {
  if (sessionStore.size <= MAX_SESSIONS) return;
  const entries = Array.from(sessionStore.entries());
  entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
  const toRemove = entries.slice(0, sessionStore.size - MAX_SESSIONS);
  for (const [id] of toRemove) {
    sessionStore.delete(id);
  }
}
if (!(0, import_encrypt.isEncryptionAvailable)()) {
  import_logger.logger.warn(
    "[SECURITY] Session encryption is not available. SESSION_SECRET must be set for production. Session secrets will be stored encrypted with an ephemeral key that does not survive restarts."
  );
} else if (process.env.NODE_ENV === "production") {
  import_logger.logger.info("[SECURITY] Session secrets encrypted with AES-256-GCM using SESSION_SECRET.");
}
loadSessions();
pruneExpired();
saveSessions();
function createSession(accountId, role, ip) {
  pruneExpired();
  enforceMaxSessions();
  const now = Date.now();
  const session = {
    sessionId: import_crypto.default.randomBytes(32).toString("hex"),
    accountId,
    role,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
    csrfToken: import_crypto.default.randomBytes(32).toString("hex"),
    lastRotatedAt: now,
    lastSeenIp: ip
  };
  sessionStore.set(session.sessionId, session);
  saveSessions();
  return session;
}
function validateSession(sessionId) {
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
function touchSession(sessionId, ip) {
  const session = sessionStore.get(sessionId);
  if (!session) return;
  session.lastSeenIp = ip;
  sessionStore.set(sessionId, session);
  debouncedSave();
}
function rotateSession(sessionId) {
  const session = validateSession(sessionId);
  if (!session) return null;
  const age = Date.now() - session.lastRotatedAt;
  if (age < SESSION_ROTATION_MS) {
    return {
      newSessionId: session.sessionId,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt
    };
  }
  const now = Date.now();
  const newSession = {
    ...session,
    sessionId: import_crypto.default.randomBytes(32).toString("hex"),
    csrfToken: import_crypto.default.randomBytes(32).toString("hex"),
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
    lastRotatedAt: now
  };
  sessionStore.delete(sessionId);
  sessionStore.set(newSession.sessionId, newSession);
  saveSessions();
  import_logger.logger.info(`\u{1F504} Session rotated for account ${session.accountId}`);
  return {
    newSessionId: newSession.sessionId,
    csrfToken: newSession.csrfToken,
    expiresAt: newSession.expiresAt
  };
}
function destroySession(sessionId) {
  const session = sessionStore.get(sessionId);
  if (!session) return false;
  sessionStore.delete(sessionId);
  saveSessions();
  return true;
}
function destroyAllSessionsForAccount(accountId) {
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
function validateCsrfToken(sessionId, token) {
  const session = validateSession(sessionId);
  if (!session) return false;
  if (!token || token.length !== 64) return false;
  return import_crypto.default.timingSafeEqual(
    Buffer.from(session.csrfToken, "hex"),
    Buffer.from(token, "hex")
  );
}
function getCsrfToken(sessionId) {
  const session = validateSession(sessionId);
  return session?.csrfToken ?? null;
}
function getSessionFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([a-f0-9]+)`));
  return match ? match[1] : null;
}
function setSessionCookie(res, sessionId, expiresAt) {
  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = Math.floor((expiresAt - Date.now()) / 1e3);
  const cookie = [
    `${SESSION_COOKIE}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    isProduction ? "Secure" : "",
    `Max-Age=${maxAge}`
  ].filter(Boolean).join("; ");
  res.setHeader("Set-Cookie", cookie);
}
function clearSessionCookie(res) {
  const isProduction = process.env.NODE_ENV === "production";
  const cookie = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    isProduction ? "Secure" : "",
    "Max-Age=0"
  ].filter(Boolean).join("; ");
  res.setHeader("Set-Cookie", cookie);
}
function getActiveSessionCount() {
  pruneExpired();
  return sessionStore.size;
}
function listSessionsForAccount(accountId) {
  pruneExpired();
  const result = [];
  for (const session of sessionStore.values()) {
    if (session.accountId === accountId) {
      result.push({
        sessionId: session.sessionId,
        accountId: session.accountId,
        role: session.role,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastSeenIp: session.lastSeenIp,
        lastRotatedAt: session.lastRotatedAt
      });
    }
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}
function revokeSession(sessionId, accountId) {
  const session = sessionStore.get(sessionId);
  if (!session || session.accountId !== accountId) return false;
  sessionStore.delete(sessionId);
  saveSessions();
  return true;
}
const PREAUTH_DURATION_MS = 5 * 60 * 1e3;
const MAX_PREAUTH_TOKENS = 100;
let preAuthTokens = /* @__PURE__ */ new Map();
function prunePreAuthTokens() {
  const now = Date.now();
  for (const [token, record] of preAuthTokens) {
    if (record.expiresAt <= now) {
      preAuthTokens.delete(token);
    }
  }
  if (preAuthTokens.size > MAX_PREAUTH_TOKENS) {
    const entries = Array.from(preAuthTokens.entries());
    entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toRemove = entries.slice(0, preAuthTokens.size - MAX_PREAUTH_TOKENS);
    for (const [token] of toRemove) {
      preAuthTokens.delete(token);
    }
  }
}
function createPreAuthToken(accountId, role, username, ip) {
  prunePreAuthTokens();
  const now = Date.now();
  const token = import_crypto.default.randomBytes(32).toString("hex");
  preAuthTokens.set(token, {
    token,
    accountId,
    role,
    username,
    createdAt: now,
    expiresAt: now + PREAUTH_DURATION_MS,
    ip
  });
  return token;
}
function consumePreAuthToken(token) {
  const record = preAuthTokens.get(token);
  if (!record) return null;
  preAuthTokens.delete(token);
  if (Date.now() > record.expiresAt) return null;
  return record;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SESSION_COOKIE,
  clearSessionCookie,
  consumePreAuthToken,
  createPreAuthToken,
  createSession,
  destroyAllSessionsForAccount,
  destroySession,
  getActiveSessionCount,
  getCsrfToken,
  getSessionFromCookie,
  listSessionsForAccount,
  revokeSession,
  rotateSession,
  setSessionCookie,
  touchSession,
  validateCsrfToken,
  validateSession
});
