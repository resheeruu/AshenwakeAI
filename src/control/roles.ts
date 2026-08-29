import { Request, Response, NextFunction } from "express";
import {
  validateSession,
  getSessionFromCookie,
  clearSessionCookie,
  touchSession,
  rotateSession,
  setSessionCookie,
  getCsrfToken,
  validateCsrfToken,
} from "./session-store";
import { getAccountById } from "./account-store";
import { recordAudit } from "../security/audit";

export type WebRole = "owner" | "admin" | "user";

const ROLE_HIERARCHY: WebRole[] = ["owner", "admin", "user"];

function roleLevel(role: WebRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

export function hasRole(userRole: WebRole, requiredRole: WebRole): boolean {
  return roleLevel(userRole) <= roleLevel(requiredRole);
}

export interface AuthenticatedRequest extends Request {
  accountId?: string;
  username?: string;
  role?: WebRole;
  sessionId?: string;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const sessionId = getSessionFromCookie(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ ok: false, error: "Authentication required." });
    return;
  }

  const rotated = rotateSession(sessionId);
  if (rotated && rotated.newSessionId !== sessionId) {
    setSessionCookie(res, rotated.newSessionId, rotated.expiresAt);
  }

  const effectiveSessionId = rotated?.newSessionId || sessionId;
  const session = validateSession(effectiveSessionId);
  if (!session) {
    clearSessionCookie(res);
    res.status(401).json({ ok: false, error: "Session expired or invalid." });
    return;
  }

  touchSession(session.sessionId, ip);

  const account = getAccountById(session.accountId);
  if (!account || !account.enabled) {
    // SECURITY: Destroy the session when account is disabled/deleted
    const { destroySession } = require("./session-store");
    destroySession(session.sessionId);
    clearSessionCookie(res);
    res.status(401).json({ ok: false, error: "Account not found or disabled." });
    return;
  }

  if (account.role !== session.role) {
    // SECURITY: Destroy the stale session when role has changed
    const { destroySession } = require("./session-store");
    destroySession(session.sessionId);
    clearSessionCookie(res);
    res.status(401).json({ ok: false, error: "Session role outdated. Please log in again." });
    return;
  }

  const authReq = req as AuthenticatedRequest;
  authReq.accountId = session.accountId;
  authReq.username = account.username;
  authReq.role = session.role;
  authReq.sessionId = session.sessionId;

  next();
}

export function requireRole(requiredRole: WebRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.role) {
      res.status(401).json({ ok: false, error: "Authentication required." });
      return;
    }

    if (!hasRole(authReq.role, requiredRole)) {
      recordAudit({
        who: authReq.username || "unknown",
        what: `Access denied: requires ${requiredRole} role`,
        where: "web-auth",
        result: "denied",
        details: `Endpoint: ${req.method} ${req.path}, user role: ${authReq.role}`,
      });
      res.status(403).json({
        ok: false,
        error: `Requires ${requiredRole} privileges.`,
      });
      return;
    }

    next();
  };
}

export function requireCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method === "GET" || req.method === "OPTIONS") {
    next();
    return;
  }

  const sessionId = getSessionFromCookie(req.headers.cookie);
  const csrfToken = req.headers["x-csrf-token"];
  if (!sessionId || !csrfToken || typeof csrfToken !== "string") {
    res.status(403).json({ ok: false, error: "CSRF token required." });
    return;
  }
  if (!validateCsrfToken(sessionId, csrfToken)) {
    res.status(403).json({ ok: false, error: "Invalid CSRF token." });
    return;
  }
  next();
}
