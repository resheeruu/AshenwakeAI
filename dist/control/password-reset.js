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
var password_reset_exports = {};
__export(password_reset_exports, {
  cleanupExpiredTokens: () => cleanupExpiredTokens,
  generateResetToken: () => generateResetToken,
  invalidateResetTokens: () => invalidateResetTokens,
  reloadResetTokens: () => reloadResetTokens,
  useResetToken: () => useResetToken,
  validateResetToken: () => validateResetToken
});
module.exports = __toCommonJS(password_reset_exports);
var import_crypto = __toESM(require("crypto"));
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_logger = require("../logger");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const RESET_TOKENS_FILE = import_path.default.join(DATA_DIR, "password-reset-tokens.json");
const TOKEN_EXPIRY_MS = 60 * 60 * 1e3;
let tokens = [];
function ensureDataDir() {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
function loadTokens() {
  try {
    if (!import_fs.default.existsSync(RESET_TOKENS_FILE)) {
      tokens = [];
      return;
    }
    const raw = import_fs.default.readFileSync(RESET_TOKENS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      tokens = [];
      return;
    }
    const now = Date.now();
    tokens = parsed.filter(
      (t) => t && typeof t.id === "string" && typeof t.accountId === "string" && typeof t.tokenHash === "string" && typeof t.expiresAt === "number" && t.expiresAt > now && !t.used
    );
  } catch {
    tokens = [];
  }
}
function saveTokens() {
  try {
    ensureDataDir();
    const tmpPath = RESET_TOKENS_FILE + ".tmp";
    import_fs.default.writeFileSync(tmpPath, JSON.stringify(tokens, null, 2), "utf8");
    import_fs.default.renameSync(tmpPath, RESET_TOKENS_FILE);
  } catch (error) {
    import_logger.logger.warn(
      `\u26A0\uFE0F Could not save reset tokens: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
loadTokens();
function hashToken(token) {
  return import_crypto.default.createHash("sha256").update(token).digest("hex");
}
function generateResetToken(accountId) {
  tokens = tokens.filter((t) => t.accountId !== accountId);
  const rawToken = import_crypto.default.randomBytes(32).toString("hex");
  const now = Date.now();
  const record = {
    id: import_crypto.default.randomBytes(16).toString("hex"),
    accountId,
    tokenHash: hashToken(rawToken),
    createdAt: now,
    expiresAt: now + TOKEN_EXPIRY_MS,
    used: false
  };
  tokens.push(record);
  saveTokens();
  return rawToken;
}
function validateResetToken(accountId, token) {
  const tokenHash = hashToken(token);
  const record = tokens.find(
    (t) => t.accountId === accountId && t.tokenHash === tokenHash && !t.used && t.expiresAt > Date.now()
  );
  return !!record;
}
function useResetToken(accountId, token) {
  const tokenHash = hashToken(token);
  const record = tokens.find(
    (t) => t.accountId === accountId && t.tokenHash === tokenHash && !t.used && t.expiresAt > Date.now()
  );
  if (!record) return false;
  record.used = true;
  saveTokens();
  return true;
}
function invalidateResetTokens(accountId) {
  tokens = tokens.filter((t) => t.accountId !== accountId);
  saveTokens();
}
function cleanupExpiredTokens() {
  const now = Date.now();
  const before = tokens.length;
  tokens = tokens.filter((t) => t.expiresAt > now && !t.used);
  if (tokens.length !== before) {
    saveTokens();
  }
}
function reloadResetTokens() {
  loadTokens();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanupExpiredTokens,
  generateResetToken,
  invalidateResetTokens,
  reloadResetTokens,
  useResetToken,
  validateResetToken
});
