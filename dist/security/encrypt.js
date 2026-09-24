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
var encrypt_exports = {};
__export(encrypt_exports, {
  KEY_DOMAINS: () => KEY_DOMAINS,
  MIN_SECRET_LENGTH: () => MIN_SECRET_LENGTH,
  decrypt: () => decrypt,
  decryptMFA: () => decryptMFA,
  decryptSessionData: () => decryptSessionData,
  encrypt: () => encrypt,
  encryptMFA: () => encryptMFA,
  encryptSessionData: () => encryptSessionData,
  getAuditIntegrityKey: () => getAuditIntegrityKey,
  isEncryptionAvailable: () => isEncryptionAvailable
});
module.exports = __toCommonJS(encrypt_exports);
var import_node_crypto = __toESM(require("node:crypto"));
var import_logger = require("../logger");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const MIN_SECRET_LENGTH = 32;
const KEY_DOMAINS = {
  sessionEncryption: "ashenai-session-encryption-v1",
  mfaEncryption: "ashenai-mfa-encryption-v1",
  auditIntegrity: "ashenai-audit-integrity-v1"
};
let cachedKeys = {
  sessionEncryption: null,
  mfaEncryption: null,
  auditIntegrity: null
};
function getEncryptionKey(domain) {
  if (cachedKeys[domain]) return cachedKeys[domain];
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      import_logger.logger.error(
        "[FATAL] SESSION_SECRET is required for encryption in production. Set it in your environment."
      );
      throw new Error(
        "SESSION_SECRET is required for encryption. Set it in your .env file."
      );
    }
    import_logger.logger.warn(
      "[WARN] SESSION_SECRET not set \u2014 using ephemeral encryption key. Data encrypted with this key is not persistent across restarts."
    );
    cachedKeys[domain] = import_node_crypto.default.randomBytes(32);
    return cachedKeys[domain];
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      import_logger.logger.error(
        "[FATAL] SESSION_SECRET must be at least 32 characters for encryption. A short password is insufficient cryptographic key material."
      );
      throw new Error(
        "SESSION_SECRET must be at least 32 characters. Use a high-entropy secret."
      );
    }
    import_logger.logger.warn(
      "[WARN] SESSION_SECRET is shorter than 32 chars. Using PBKDF2 stretching (non-production only)."
    );
    const stretched = import_node_crypto.default.pbkdf2Sync(secret, "ashenai-key-stretch", 1e5, 32, "sha512");
    cachedKeys[domain] = import_node_crypto.default.createHash("sha256").update(stretched).update(KEY_DOMAINS[domain]).digest();
    return cachedKeys[domain];
  }
  const salt = import_node_crypto.default.createHash("sha256").update(secret).digest();
  const info = Buffer.from(KEY_DOMAINS[domain], "utf8");
  const derived = import_node_crypto.default.createHmac("sha256", salt).update(info).digest();
  const okm = import_node_crypto.default.createHmac("sha256", derived).update(Buffer.concat([info, Buffer.alloc(32)])).digest();
  cachedKeys[domain] = okm;
  return cachedKeys[domain];
}
function encrypt(plaintext) {
  const key = getEncryptionKey("sessionEncryption");
  const iv = import_node_crypto.default.randomBytes(IV_LENGTH);
  const cipher = import_node_crypto.default.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString("base64");
}
function decrypt(encryptedBase64) {
  const key = getEncryptionKey("sessionEncryption");
  const buf = Buffer.from(encryptedBase64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = import_node_crypto.default.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
function encryptSessionData(data) {
  const plaintext = JSON.stringify(data);
  return encrypt(plaintext);
}
function decryptSessionData(encryptedBase64) {
  const plaintext = decrypt(encryptedBase64);
  return JSON.parse(plaintext);
}
function encryptMFA(secret) {
  const key = getEncryptionKey("mfaEncryption");
  const iv = import_node_crypto.default.randomBytes(IV_LENGTH);
  const cipher = import_node_crypto.default.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString("base64");
}
function decryptMFA(encryptedBase64) {
  const key = getEncryptionKey("mfaEncryption");
  const buf = Buffer.from(encryptedBase64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = import_node_crypto.default.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
function getAuditIntegrityKey() {
  return getEncryptionKey("auditIntegrity");
}
function isEncryptionAvailable() {
  try {
    getEncryptionKey("sessionEncryption");
    return true;
  } catch {
    return false;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  KEY_DOMAINS,
  MIN_SECRET_LENGTH,
  decrypt,
  decryptMFA,
  decryptSessionData,
  encrypt,
  encryptMFA,
  encryptSessionData,
  getAuditIntegrityKey,
  isEncryptionAvailable
});
