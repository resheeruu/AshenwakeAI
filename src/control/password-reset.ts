import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "../logger";

const DATA_DIR = path.join(process.cwd(), "data");
const RESET_TOKENS_FILE = path.join(DATA_DIR, "password-reset-tokens.json");

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
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadTokens(): void {
  try {
    if (!fs.existsSync(RESET_TOKENS_FILE)) {
      tokens = [];
      return;
    }
    const raw = fs.readFileSync(RESET_TOKENS_FILE, "utf8");
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
    const tmpPath = RESET_TOKENS_FILE + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(tokens, null, 2), "utf8");
    fs.renameSync(tmpPath, RESET_TOKENS_FILE);
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

export function validateResetToken(
  accountId: string,
  token: string,
): boolean {
  const tokenHash = hashToken(token);
  const record = tokens.find(
    (t) =>
      t.accountId === accountId &&
      t.tokenHash === tokenHash &&
      !t.used &&
      t.expiresAt > Date.now(),
  );
  return !!record;
}

export function useResetToken(accountId: string, token: string): boolean {
  const tokenHash = hashToken(token);
  const record = tokens.find(
    (t) =>
      t.accountId === accountId &&
      t.tokenHash === tokenHash &&
      !t.used &&
      t.expiresAt > Date.now(),
  );

  if (!record) return false;

  record.used = true;
  saveTokens();
  return true;
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
