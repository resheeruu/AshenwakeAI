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
  decrypt: () => decrypt,
  decryptSessionData: () => decryptSessionData,
  encrypt: () => encrypt,
  encryptSessionData: () => encryptSessionData,
  isEncryptionAvailable: () => isEncryptionAvailable
});
module.exports = __toCommonJS(encrypt_exports);
var import_node_crypto = __toESM(require("node:crypto"));
var import_logger = require("../logger");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_HASH_CONTEXT = "ashenai-encryption-v1";
let cachedKey = null;
function getEncryptionKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
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
    cachedKey = import_node_crypto.default.randomBytes(32);
    return cachedKey;
  }
  cachedKey = import_node_crypto.default.createHash("sha256").update(secret).update(KEY_HASH_CONTEXT).digest();
  return cachedKey;
}
function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = import_node_crypto.default.randomBytes(IV_LENGTH);
  const cipher = import_node_crypto.default.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString("base64");
}
function decrypt(encryptedBase64) {
  const key = getEncryptionKey();
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
function isEncryptionAvailable() {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  decrypt,
  decryptSessionData,
  encrypt,
  encryptSessionData,
  isEncryptionAvailable
});
