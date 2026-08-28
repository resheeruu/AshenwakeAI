import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "../logger";

const DATA_DIR = path.join(process.cwd(), "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

const ITERATIONS = 100_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export interface Account {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  role: "owner" | "admin" | "user";
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  oauthProvider?: "google" | "discord";
  oauthId?: string;
}

export interface SanitizedAccount {
  id: string;
  username: string;
  role: "owner" | "admin" | "user";
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  oauthProvider?: "google" | "discord";
}

let accounts: Account[] = [];

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAccounts(): void {
  try {
    if (!fs.existsSync(ACCOUNTS_FILE)) {
      accounts = [];
      return;
    }
    const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logger.warn("⚠️ accounts.json is not an array, resetting");
      accounts = [];
      return;
    }
    accounts = parsed.filter(
      (a: any) =>
        a &&
        typeof a.id === "string" &&
        typeof a.username === "string" &&
        typeof a.passwordHash === "string" &&
        typeof a.passwordSalt === "string" &&
        ["owner", "admin", "user"].includes(a.role),
    );
  } catch {
    accounts = [];
  }
}

function saveAccounts(): void {
  try {
    ensureDataDir();
    const tmpPath = ACCOUNTS_FILE + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(accounts, null, 2), "utf8");
    fs.renameSync(tmpPath, ACCOUNTS_FILE);
  } catch (error) {
    logger.warn(
      `⚠️ Could not save accounts: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

loadAccounts();

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || crypto.randomBytes(32).toString("hex");
  const hash = crypto.pbkdf2Sync(password, useSalt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return { hash, salt: useSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const { hash: computed } = hashPassword(password, salt);
  const hashBuf = Buffer.from(computed, "hex");
  const expectedBuf = Buffer.from(hash, "hex");
  if (hashBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, expectedBuf);
}

export function generateId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function sanitizeAccount(account: Account): SanitizedAccount {
  const { passwordHash: _, passwordSalt: __, ...rest } = account;
  return rest;
}

export function getAccountById(id: string): Account | undefined {
  return accounts.find((a) => a.id === id);
}

export function getAccountByUsername(username: string): Account | undefined {
  return accounts.find((a) => a.username.toLowerCase() === username.toLowerCase());
}

export function getEnabledAccountByUsername(username: string): Account | undefined {
  const account = getAccountByUsername(username);
  if (account && !account.enabled) return undefined;
  return account;
}

export function listAccounts(): SanitizedAccount[] {
  return accounts.map(sanitizeAccount);
}

export function createAccount(params: {
  username: string;
  password: string;
  role: "owner" | "admin" | "user";
}): { success: boolean; account?: SanitizedAccount; error?: string } {
  const { username, password, role } = params;

  const trimmed = username.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 32) {
    return { success: false, error: "Username must be 2-32 characters." };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { success: false, error: "Username may only contain letters, numbers, underscores, and hyphens." };
  }
  if (!password || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }
  if (!["owner", "admin", "user"].includes(role)) {
    return { success: false, error: "Invalid role." };
  }

  if (getAccountByUsername(trimmed)) {
    return { success: false, error: "Username already exists." };
  }

  const { hash, salt } = hashPassword(password);
  const now = Date.now();
  const account: Account = {
    id: generateId(),
    username: trimmed,
    passwordHash: hash,
    passwordSalt: salt,
    role,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  accounts.push(account);
  saveAccounts();

  logger.info(`👤 Account created: ${trimmed} (role: ${role})`);
  return { success: true, account: sanitizeAccount(account) };
}

export function updateAccount(
  id: string,
  updates: Partial<Pick<Account, "username" | "role" | "enabled">>,
): { success: boolean; account?: SanitizedAccount; error?: string } {
  const account = getAccountById(id);
  if (!account) {
    return { success: false, error: "Account not found." };
  }

  if (updates.username !== undefined) {
    const trimmed = updates.username.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 32) {
      return { success: false, error: "Username must be 2-32 characters." };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return { success: false, error: "Username may only contain letters, numbers, underscores, and hyphens." };
    }
    const existing = getAccountByUsername(trimmed);
    if (existing && existing.id !== id) {
      return { success: false, error: "Username already exists." };
    }
    account.username = trimmed;
  }

  if (updates.role !== undefined) {
    if (!["owner", "admin", "user"].includes(updates.role)) {
      return { success: false, error: "Invalid role." };
    }
    account.role = updates.role;
  }

  if (updates.enabled !== undefined) {
    if (updates.enabled === false && account.role === "owner") {
      const enabledOwners = accounts.filter((a) => a.role === "owner" && a.enabled && a.id !== id);
      if (enabledOwners.length === 0) {
        return { success: false, error: "Cannot disable the last enabled owner account." };
      }
    }
    account.enabled = updates.enabled;
  }

  account.updatedAt = Date.now();
  saveAccounts();

  return { success: true, account: sanitizeAccount(account) };
}

export function updateAccountCredentials(
  id: string,
  updates: Partial<Pick<Account, "passwordHash" | "passwordSalt" | "lastLoginAt">>,
): { success: boolean; account?: SanitizedAccount; error?: string } {
  const account = getAccountById(id);
  if (!account) {
    return { success: false, error: "Account not found." };
  }

  if (updates.passwordHash !== undefined) account.passwordHash = updates.passwordHash;
  if (updates.passwordSalt !== undefined) account.passwordSalt = updates.passwordSalt;
  if (updates.lastLoginAt !== undefined) account.lastLoginAt = updates.lastLoginAt;

  account.updatedAt = Date.now();
  saveAccounts();

  return { success: true, account: sanitizeAccount(account) };
}

export function deleteAccount(id: string): { success: boolean; error?: string } {
  const account = getAccountById(id);
  if (!account) {
    return { success: false, error: "Account not found." };
  }

  if (account.role === "owner") {
    const otherOwners = accounts.filter((a) => a.role === "owner" && a.id !== id);
    if (otherOwners.length === 0) {
      return { success: false, error: "Cannot delete the last owner account." };
    }
  }

  accounts = accounts.filter((a) => a.id !== id);
  saveAccounts();

  logger.info(`👤 Account deleted: ${account.username}`);
  return { success: true };
}

export function changePassword(
  id: string,
  newPassword: string,
): { success: boolean; error?: string } {
  const account = getAccountById(id);
  if (!account) {
    return { success: false, error: "Account not found." };
  }

  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const { hash, salt } = hashPassword(newPassword);
  account.passwordHash = hash;
  account.passwordSalt = salt;
  account.updatedAt = Date.now();
  saveAccounts();

  logger.info(`🔑 Password changed for: ${account.username}`);
  return { success: true };
}

export function setOwnerFromEnv(): boolean {
  const username = process.env.ASHENAI_OWNER_USERNAME?.trim();
  const passwordHash = process.env.ASHENAI_OWNER_PASSWORD_HASH?.trim();
  const passwordSalt = process.env.ASHENAI_OWNER_PASSWORD_SALT?.trim();

  if (!username || !passwordHash || !passwordSalt) return false;

  const existing = getAccountByUsername(username);
  if (existing) return true;

  const now = Date.now();
  const account: Account = {
    id: generateId(),
    username,
    passwordHash,
    passwordSalt,
    role: "owner",
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  accounts.push(account);
  saveAccounts();

  logger.info(`👤 Owner account migrated from environment variables: ${username}`);
  return true;
}

export function hasOwnerAccount(): boolean {
  return accounts.some((a) => a.role === "owner" && a.enabled);
}

export function reloadAccounts(): void {
  loadAccounts();
}
