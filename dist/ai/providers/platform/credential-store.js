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
var credential_store_exports = {};
__export(credential_store_exports, {
  decryptCredential: () => decryptCredential,
  deleteAllCredentials: () => deleteAllCredentials,
  deleteCredential: () => deleteCredential,
  encryptCredential: () => encryptCredential,
  getCredential: () => getCredential,
  hasCredential: () => hasCredential,
  storeCredential: () => storeCredential
});
module.exports = __toCommonJS(credential_store_exports);
var import_node_crypto = __toESM(require("node:crypto"));
var import_database = require("../../../database/database");
var import_logger = require("../../../logger");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
function getCredentialKey() {
  const secret = process.env.SESSION_SECRET || process.env.ASHENAI_CREDENTIAL_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is required for credential encryption. Set it in your .env file.");
  }
  return import_node_crypto.default.createHash("sha256").update(secret).digest();
}
function encryptCredential(plaintext) {
  const key = getCredentialKey();
  const iv = import_node_crypto.default.randomBytes(IV_LENGTH);
  const cipher = import_node_crypto.default.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString("base64");
}
function decryptCredential(encryptedBase64) {
  const key = getCredentialKey();
  const buf = Buffer.from(encryptedBase64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = import_node_crypto.default.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
function storeCredential(providerId, key, value) {
  const db = (0, import_database.getDatabase)();
  const encrypted = encryptCredential(value);
  (0, import_database.safeDbOperation)(() => {
    db.prepare(`
      INSERT INTO provider_credentials (provider_id, credential_key, credential_value, updated_at)
      VALUES (?, ?, ?, unixepoch() * 1000)
      ON CONFLICT(provider_id, credential_key)
      DO UPDATE SET credential_value = excluded.credential_value, updated_at = excluded.updated_at
    `).run(providerId, key, encrypted);
  }, void 0, `storeCredential:${providerId}`);
}
function getCredential(providerId, key) {
  const db = (0, import_database.getDatabase)();
  const row = (0, import_database.safeDbOperation)(() => {
    return db.prepare(
      "SELECT credential_value FROM provider_credentials WHERE provider_id = ? AND credential_key = ?"
    ).get(providerId, key);
  }, void 0, `getCredential:${providerId}`);
  if (!row) return void 0;
  try {
    return decryptCredential(row.credential_value);
  } catch {
    import_logger.logger.warn(`\u26A0\uFE0F Failed to decrypt credential ${key} for provider ${providerId}`);
    return void 0;
  }
}
function deleteCredential(providerId, key) {
  const db = (0, import_database.getDatabase)();
  (0, import_database.safeDbOperation)(() => {
    db.prepare("DELETE FROM provider_credentials WHERE provider_id = ? AND credential_key = ?").run(providerId, key);
  }, void 0, `deleteCredential:${providerId}`);
}
function deleteAllCredentials(providerId) {
  const db = (0, import_database.getDatabase)();
  (0, import_database.safeDbOperation)(() => {
    db.prepare("DELETE FROM provider_credentials WHERE provider_id = ?").run(providerId);
  }, void 0, `deleteAllCredentials:${providerId}`);
}
function hasCredential(providerId, key) {
  const db = (0, import_database.getDatabase)();
  const row = (0, import_database.safeDbOperation)(() => {
    return db.prepare(
      "SELECT 1 FROM provider_credentials WHERE provider_id = ? AND credential_key = ?"
    ).get(providerId, key);
  }, void 0, `hasCredential:${providerId}`);
  return !!row;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  decryptCredential,
  deleteAllCredentials,
  deleteCredential,
  encryptCredential,
  getCredential,
  hasCredential,
  storeCredential
});
