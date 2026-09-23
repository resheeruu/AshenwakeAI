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
var account_store_exports = {};
__export(account_store_exports, {
  changePassword: () => changePassword,
  createAccount: () => createAccount,
  deleteAccount: () => deleteAccount,
  generateId: () => generateId,
  getAccountById: () => getAccountById,
  getAccountByUsername: () => getAccountByUsername,
  getAuthorizedGuildIds: () => getAuthorizedGuildIds,
  getEnabledAccountByUsername: () => getEnabledAccountByUsername,
  hasOwnerAccount: () => hasOwnerAccount,
  hashPassword: () => import_password_hash.hashPassword,
  isAnyMfaEnabled: () => isAnyMfaEnabled,
  isGuildAuthorizedForAccount: () => isGuildAuthorizedForAccount,
  listAccounts: () => listAccounts,
  reloadAccounts: () => reloadAccounts,
  sanitizeAccount: () => sanitizeAccount,
  setOwnerFromEnv: () => setOwnerFromEnv,
  updateAccount: () => updateAccount,
  updateAccountCredentials: () => updateAccountCredentials,
  verifyPassword: () => import_password_hash.verifyPassword
});
module.exports = __toCommonJS(account_store_exports);
var import_crypto = __toESM(require("crypto"));
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_logger = require("../logger");
var import_password_hash = require("../utils/password-hash");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const ACCOUNTS_FILE = import_path.default.join(DATA_DIR, "accounts.json");
let accounts = [];
function ensureDataDir() {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
function loadAccounts() {
  try {
    if (!import_fs.default.existsSync(ACCOUNTS_FILE)) {
      accounts = [];
      return;
    }
    const raw = import_fs.default.readFileSync(ACCOUNTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      import_logger.logger.warn("\u26A0\uFE0F accounts.json is not an array, resetting");
      accounts = [];
      return;
    }
    accounts = parsed.filter(
      (a) => a && typeof a.id === "string" && typeof a.username === "string" && typeof a.passwordHash === "string" && typeof a.passwordSalt === "string" && ["owner", "admin", "user"].includes(a.role)
    );
  } catch {
    accounts = [];
  }
}
function saveAccounts() {
  try {
    ensureDataDir();
    const tmpPath = ACCOUNTS_FILE + ".tmp";
    import_fs.default.writeFileSync(tmpPath, JSON.stringify(accounts, null, 2), "utf8");
    import_fs.default.renameSync(tmpPath, ACCOUNTS_FILE);
  } catch (error) {
    import_logger.logger.warn(
      `\u26A0\uFE0F Could not save accounts: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
loadAccounts();
function generateId() {
  return import_crypto.default.randomBytes(16).toString("hex");
}
function sanitizeAccount(account) {
  const { passwordHash: _, passwordSalt: __, mfaSecret: ___, recoveryCodesHash: ____, ...rest } = account;
  return rest;
}
function getAccountById(id) {
  return accounts.find((a) => a.id === id);
}
function getAccountByUsername(username) {
  return accounts.find((a) => a.username.toLowerCase() === username.toLowerCase());
}
function getEnabledAccountByUsername(username) {
  const account = getAccountByUsername(username);
  if (account && !account.enabled) return void 0;
  return account;
}
function listAccounts() {
  return accounts.map(sanitizeAccount);
}
function createAccount(params) {
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
  const { hash, salt } = (0, import_password_hash.hashPassword)(password);
  const now = Date.now();
  const account = {
    id: generateId(),
    username: trimmed,
    passwordHash: hash,
    passwordSalt: salt,
    role,
    enabled: true,
    createdAt: now,
    updatedAt: now
  };
  accounts.push(account);
  saveAccounts();
  import_logger.logger.info(`\u{1F464} Account created: ${trimmed} (role: ${role})`);
  return { success: true, account: sanitizeAccount(account) };
}
function updateAccount(id, updates) {
  const account = getAccountById(id);
  if (!account) {
    return { success: false, error: "Account not found." };
  }
  if (updates.username !== void 0) {
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
  if (updates.role !== void 0) {
    if (!["owner", "admin", "user"].includes(updates.role)) {
      return { success: false, error: "Invalid role." };
    }
    account.role = updates.role;
  }
  if (updates.enabled !== void 0) {
    if (updates.enabled === false && account.role === "owner") {
      const enabledOwners = accounts.filter((a) => a.role === "owner" && a.enabled && a.id !== id);
      if (enabledOwners.length === 0) {
        return { success: false, error: "Cannot disable the last enabled owner account." };
      }
    }
    account.enabled = updates.enabled;
  }
  if (updates.email !== void 0) {
    account.email = updates.email || void 0;
  }
  if (updates.emailVerified !== void 0) {
    account.emailVerified = updates.emailVerified;
  }
  if (updates.mfaEnabled !== void 0) {
    account.mfaEnabled = updates.mfaEnabled;
  }
  if (updates.mfaSecret !== void 0) {
    account.mfaSecret = updates.mfaSecret || void 0;
  }
  if (updates.recoveryCodesHash !== void 0) {
    account.recoveryCodesHash = updates.recoveryCodesHash || void 0;
  }
  if (updates.allowedGuildIds !== void 0) {
    account.allowedGuildIds = Array.isArray(updates.allowedGuildIds) ? updates.allowedGuildIds : [];
  }
  account.updatedAt = Date.now();
  saveAccounts();
  return { success: true, account: sanitizeAccount(account) };
}
function updateAccountCredentials(id, updates) {
  const account = getAccountById(id);
  if (!account) {
    return { success: false, error: "Account not found." };
  }
  if (updates.passwordHash !== void 0) account.passwordHash = updates.passwordHash;
  if (updates.passwordSalt !== void 0) account.passwordSalt = updates.passwordSalt;
  if (updates.lastLoginAt !== void 0) account.lastLoginAt = updates.lastLoginAt;
  account.updatedAt = Date.now();
  saveAccounts();
  return { success: true, account: sanitizeAccount(account) };
}
function deleteAccount(id) {
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
  import_logger.logger.info(`\u{1F464} Account deleted: ${account.username}`);
  return { success: true };
}
function changePassword(id, newPassword) {
  const account = getAccountById(id);
  if (!account) {
    return { success: false, error: "Account not found." };
  }
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }
  const { hash, salt } = (0, import_password_hash.hashPassword)(newPassword);
  account.passwordHash = hash;
  account.passwordSalt = salt;
  account.updatedAt = Date.now();
  saveAccounts();
  import_logger.logger.info(`\u{1F511} Password changed for: ${account.username}`);
  return { success: true };
}
function setOwnerFromEnv() {
  const username = process.env.ASHENAI_OWNER_USERNAME?.trim();
  const passwordHash = process.env.ASHENAI_OWNER_PASSWORD_HASH?.trim();
  const passwordSalt = process.env.ASHENAI_OWNER_PASSWORD_SALT?.trim();
  if (!username || !passwordHash || !passwordSalt) return false;
  const existing = getAccountByUsername(username);
  if (existing) return true;
  const now = Date.now();
  const account = {
    id: generateId(),
    username,
    passwordHash,
    passwordSalt,
    role: "owner",
    enabled: true,
    createdAt: now,
    updatedAt: now
  };
  accounts.push(account);
  saveAccounts();
  import_logger.logger.info(`\u{1F464} Owner account migrated from environment variables: ${username}`);
  return true;
}
function hasOwnerAccount() {
  return accounts.some((a) => a.role === "owner" && a.enabled);
}
function isAnyMfaEnabled() {
  return accounts.some((a) => a.mfaEnabled);
}
function isGuildAuthorizedForAccount(accountId, guildId) {
  const account = getAccountById(accountId);
  if (!account) return false;
  if (account.role === "owner") return true;
  if (account.role !== "admin") return false;
  if (!account.allowedGuildIds || account.allowedGuildIds.length === 0) return false;
  return account.allowedGuildIds.includes(guildId);
}
function getAuthorizedGuildIds(accountId) {
  const account = getAccountById(accountId);
  if (!account) return [];
  if (account.role === "owner") return [];
  if (account.role !== "admin") return [];
  return account.allowedGuildIds || [];
}
function reloadAccounts() {
  loadAccounts();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  changePassword,
  createAccount,
  deleteAccount,
  generateId,
  getAccountById,
  getAccountByUsername,
  getAuthorizedGuildIds,
  getEnabledAccountByUsername,
  hasOwnerAccount,
  hashPassword,
  isAnyMfaEnabled,
  isGuildAuthorizedForAccount,
  listAccounts,
  reloadAccounts,
  sanitizeAccount,
  setOwnerFromEnv,
  updateAccount,
  updateAccountCredentials,
  verifyPassword
});
