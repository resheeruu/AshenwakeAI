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
var audit_integrity_exports = {};
__export(audit_integrity_exports, {
  getGenesisHash: () => getGenesisHash,
  signEntry: () => signEntry,
  verifyAuditChain: () => verifyAuditChain,
  verifyEntry: () => verifyEntry
});
module.exports = __toCommonJS(audit_integrity_exports);
var import_node_crypto = __toESM(require("node:crypto"));
var import_encrypt = require("./encrypt");
const INTEGRITY_CONTEXT = "ashenai-audit-integrity-v1";
let integrityKey = null;
let keyValidated = false;
function validateKeyForProduction() {
  if (keyValidated) return;
  keyValidated = true;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      console.error(
        "[FATAL] SESSION_SECRET is required in production (minimum 32 characters). Audit log integrity cannot be guaranteed without a high-entropy secret."
      );
      process.exit(1);
    } else {
      console.warn(
        "[WARN] SESSION_SECRET not set or too short \u2014 audit signatures use a weaker fallback key. Set SESSION_SECRET for production deployments."
      );
    }
  }
}
function getIntegrityKey() {
  if (integrityKey) return integrityKey;
  validateKeyForProduction();
  integrityKey = (0, import_encrypt.getAuditIntegrityKey)();
  return integrityKey;
}
function computeSignature(entry) {
  const key = getIntegrityKey();
  const payload = [
    entry.id,
    entry.timestamp,
    entry.who,
    entry.whoName ?? "",
    entry.what,
    entry.where,
    entry.guildId ?? "",
    entry.reason ?? "",
    entry.result,
    entry.details ?? ""
  ].join("|");
  return import_node_crypto.default.createHmac("sha256", key).update(payload).digest("hex");
}
function signEntry(entry, previousSignature) {
  const signature = computeSignature(entry);
  const prevHash = previousSignature ? import_node_crypto.default.createHash("sha256").update(previousSignature).digest("hex") : "genesis";
  return { signature, prevHash };
}
function verifyEntry(entry, expectedPrevHash) {
  const expectedPrevHashComputed = entry.prevHash === expectedPrevHash;
  if (!expectedPrevHashComputed) return false;
  const { signature: _sig, prevHash: _prev, ...signable } = entry;
  const expectedSignature = computeSignature(signable);
  return import_node_crypto.default.timingSafeEqual(
    Buffer.from(entry.signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}
function verifyAuditChain(entries) {
  const result = {
    valid: true,
    trustedFromIndex: null,
    legacyEntries: 0,
    firstInvalidIndex: null,
    totalEntries: entries.length,
    signedEntriesVerified: 0,
    tamperingDetected: false
  };
  if (entries.length === 0) return result;
  let lastSignature = null;
  let firstSignedIndex = -1;
  let expectedNextIndex = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.signature || !entry.prevHash) {
      result.legacyEntries++;
      continue;
    }
    const signed = entry;
    const { signature: _sig, prevHash: _prev, ...signable } = signed;
    if (firstSignedIndex === -1) {
      firstSignedIndex = i;
      result.trustedFromIndex = i;
      if (entry.prevHash !== "genesis") {
        const expectedSig = computeSignature(signable);
        if (!import_node_crypto.default.timingSafeEqual(
          Buffer.from(signed.signature, "hex"),
          Buffer.from(expectedSig, "hex")
        )) {
          result.valid = false;
          result.firstInvalidIndex = i;
          result.tamperingDetected = true;
          return result;
        }
      }
      lastSignature = signed.signature;
      result.signedEntriesVerified++;
      continue;
    }
    const expectedPrevHash = import_node_crypto.default.createHash("sha256").update(lastSignature).digest("hex");
    if (!verifyEntry(signed, expectedPrevHash)) {
      result.valid = false;
      result.firstInvalidIndex = i;
      result.tamperingDetected = true;
      return result;
    }
    if (i !== expectedNextIndex) {
      result.tamperingDetected = true;
    }
    expectedNextIndex = i + 1;
    lastSignature = signed.signature;
    result.signedEntriesVerified++;
  }
  if (firstSignedIndex === -1) {
    result.trustedFromIndex = null;
    result.valid = false;
  }
  return result;
}
function getGenesisHash() {
  return "genesis";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getGenesisHash,
  signEntry,
  verifyAuditChain,
  verifyEntry
});
