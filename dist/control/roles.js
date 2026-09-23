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
var roles_exports = {};
__export(roles_exports, {
  hasRole: () => hasRole,
  requireAuth: () => requireAuth,
  requireCsrf: () => requireCsrf,
  requireGuildAuth: () => requireGuildAuth,
  requireRole: () => requireRole
});
module.exports = __toCommonJS(roles_exports);
var import_session_store = require("./session-store");
var import_account_store = require("./account-store");
var import_audit = require("../security/audit");
const ROLE_HIERARCHY = ["owner", "admin", "user"];
function roleLevel(role) {
  return ROLE_HIERARCHY.indexOf(role);
}
function hasRole(userRole, requiredRole) {
  return roleLevel(userRole) <= roleLevel(requiredRole);
}
function requireAuth(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const sessionId = (0, import_session_store.getSessionFromCookie)(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ ok: false, error: "Authentication required." });
    return;
  }
  const rotated = (0, import_session_store.rotateSession)(sessionId);
  if (rotated && rotated.newSessionId !== sessionId) {
    (0, import_session_store.setSessionCookie)(res, rotated.newSessionId, rotated.expiresAt);
  }
  const effectiveSessionId = rotated?.newSessionId || sessionId;
  const session = (0, import_session_store.validateSession)(effectiveSessionId);
  if (!session) {
    (0, import_session_store.clearSessionCookie)(res);
    res.status(401).json({ ok: false, error: "Session expired or invalid." });
    return;
  }
  (0, import_session_store.touchSession)(session.sessionId, ip);
  const account = (0, import_account_store.getAccountById)(session.accountId);
  if (!account || !account.enabled) {
    const { destroySession } = require("./session-store");
    destroySession(session.sessionId);
    (0, import_session_store.clearSessionCookie)(res);
    res.status(401).json({ ok: false, error: "Account not found or disabled." });
    return;
  }
  if (account.role !== session.role) {
    const { destroySession } = require("./session-store");
    destroySession(session.sessionId);
    (0, import_session_store.clearSessionCookie)(res);
    res.status(401).json({ ok: false, error: "Session role outdated. Please log in again." });
    return;
  }
  const authReq = req;
  authReq.accountId = session.accountId;
  authReq.username = account.username;
  authReq.role = session.role;
  authReq.sessionId = session.sessionId;
  next();
}
function requireRole(requiredRole) {
  return (req, res, next) => {
    const authReq = req;
    if (!authReq.role) {
      res.status(401).json({ ok: false, error: "Authentication required." });
      return;
    }
    if (!hasRole(authReq.role, requiredRole)) {
      (0, import_audit.recordAudit)({
        who: authReq.username || "unknown",
        what: `Access denied: requires ${requiredRole} role`,
        where: "web-auth",
        result: "denied",
        details: `Endpoint: ${req.method} ${req.path}, user role: ${authReq.role}`
      });
      res.status(403).json({
        ok: false,
        error: `Requires ${requiredRole} privileges.`
      });
      return;
    }
    next();
  };
}
function requireCsrf(req, res, next) {
  if (req.method === "GET" || req.method === "OPTIONS") {
    next();
    return;
  }
  const sessionId = (0, import_session_store.getSessionFromCookie)(req.headers.cookie);
  const csrfToken = req.headers["x-csrf-token"];
  if (!sessionId || !csrfToken || typeof csrfToken !== "string") {
    res.status(403).json({ ok: false, error: "CSRF token required." });
    return;
  }
  if (!(0, import_session_store.validateCsrfToken)(sessionId, csrfToken)) {
    res.status(403).json({ ok: false, error: "Invalid CSRF token." });
    return;
  }
  next();
}
function requireGuildAuth(req, res, next) {
  const authReq = req;
  if (!authReq.accountId || !authReq.role) {
    res.status(401).json({ ok: false, error: "Authentication required." });
    return;
  }
  const guildId = req.params.guildId;
  if (!guildId || typeof guildId !== "string") {
    res.status(400).json({ ok: false, error: "Guild ID required." });
    return;
  }
  if (!/^\d{17,20}$/.test(guildId)) {
    res.status(400).json({ ok: false, error: "Invalid guild ID format." });
    return;
  }
  if (authReq.role === "owner") {
    next();
    return;
  }
  if (!(0, import_account_store.isGuildAuthorizedForAccount)(authReq.accountId, guildId)) {
    (0, import_audit.recordAudit)({
      who: authReq.username || "unknown",
      what: `Unauthorized guild access attempt`,
      where: "web-auth",
      result: "denied",
      details: `Guild: ${guildId}, user role: ${authReq.role}`
    });
    res.status(403).json({ ok: false, error: "Not authorized for this server." });
    return;
  }
  next();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  hasRole,
  requireAuth,
  requireCsrf,
  requireGuildAuth,
  requireRole
});
