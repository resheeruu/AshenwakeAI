import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "../logger";
import { getDataDir, getDataPath } from "../config/data-dir";

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export interface PasswordResetToken {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

let tokens: PasswordResetToken[] = [];

function ensureDataDir(): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

function loadTokens(): void {
  try {
    const tokensPath = getDataPath("password-reset-tokens.json");
    if (!fs.existsSync(tokensPath)) {
      tokens = [];
      return;
    }
    const raw = fs.readFileSync(tokensPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      tokens = [];
      return;
    }
    const now = Date.now();
    tokens = parsed.filter(
      (t: any) =>
        t &&
        typeof t.id === "string" &&
        typeof t.accountId === "string" &&
        typeof t.tokenHash === "string" &&
        typeof t.expiresAt === "number" &&
        t.expiresAt > now &&
        !t.used,
    );
  } catch {
    tokens = [];
  }
}

function saveTokens(): void {
  try {
    ensureDataDir();
    const tokensPath = getDataPath("password-reset-tokens.json");
    const tmpPath = tokensPath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(tokens, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmpPath, tokensPath);
  } catch (error) {
    logger.warn(
      `⚠️ Could not save reset tokens: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

loadTokens();

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateResetToken(accountId: string): string {
  // Invalidate any existing tokens for this account
  tokens = tokens.filter((t) => t.accountId !== accountId);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const now = Date.now();

  const record: PasswordResetToken = {
    id: crypto.randomBytes(16).toString("hex"),
    accountId,
    tokenHash: hashToken(rawToken),
    createdAt: now,
    expiresAt: now + TOKEN_EXPIRY_MS,
    used: false,
  };

  tokens.push(record);
  saveTokens();

  return rawToken;
}

export function consumeResetToken(accountId: string, token: string): boolean {
  const tokenHash = hashToken(token);
  const now = Date.now();
  const recordIndex = tokens.findIndex(
    (t) =>
      t.accountId === accountId &&
      t.tokenHash === tokenHash &&
      !t.used &&
      t.expiresAt > now,
  );

  if (recordIndex === -1) return false;

  tokens[recordIndex].used = true;
  saveTokens();
  return true;
}

export function validateResetToken(
  accountId: string,
  token: string,
): boolean {
  const tokenHash = hashToken(token);
  const now = Date.now();
  const record = tokens.find(
    (t) =>
      t.accountId === accountId &&
      t.tokenHash === tokenHash &&
      !t.used &&
      t.expiresAt > now,
  );
  return !!record;
}

export function useResetToken(accountId: string, token: string): boolean {
  // Legacy alias for consumeResetToken - kept for backwards compatibility
  return consumeResetToken(accountId, token);
}

export function invalidateResetTokens(accountId: string): void {
  tokens = tokens.filter((t) => t.accountId !== accountId);
  saveTokens();
}

export function cleanupExpiredTokens(): void {
  const now = Date.now();
  const before = tokens.length;
  tokens = tokens.filter((t) => t.expiresAt > now && !t.used);
  if (tokens.length !== before) {
    saveTokens();
  }
}

export function reloadResetTokens(): void {
  loadTokens();
}
