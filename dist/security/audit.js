"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var audit_exports = {};
__export(audit_exports, {
  getAuditLog: () => getAuditLog,
  recordAudit: () => recordAudit
});
module.exports = __toCommonJS(audit_exports);
var import_nanoid = require("nanoid");
var import_logger = require("../logger");
var import_redact = require("./redact");
var import_audit_integrity = require("./audit-integrity");
var import_database = require("../database");
let lastSignature = null;
let signatureLoaded = false;
function ensureSignatureLoaded() {
  if (signatureLoaded) return;
  signatureLoaded = true;
  try {
    const recentEntries = (0, import_database.getAuditLogDB)({ limit: 1 });
    if (recentEntries.length > 0 && recentEntries[0].signature) {
      lastSignature = recentEntries[0].signature;
      import_logger.logger.debug("\u{1F510} Audit chain loaded from database");
    }
  } catch {
    import_logger.logger.warn("\u26A0\uFE0F Could not load audit chain from database \u2014 starting new chain");
  }
}
function recordAudit(entry) {
  ensureSignatureLoaded();
  const full = {
    id: (0, import_nanoid.nanoid)(12),
    timestamp: Date.now(),
    ...entry,
    details: entry.details ? String((0, import_redact.redact)(entry.details)) : void 0
  };
  const { signature, prevHash } = (0, import_audit_integrity.signEntry)(full, lastSignature);
  full.signature = signature;
  full.prevHash = prevHash;
  lastSignature = signature;
  (0, import_database.insertAuditEntryDB)(full);
  import_logger.logger.info(`\u{1F4CB} AUDIT: [${full.result}] ${full.what} by ${full.who} in ${full.where}`);
  return full;
}
function getAuditLog(options = {}) {
  const entries = (0, import_database.getAuditLogDB)(options);
  if (options.verifyIntegrity && entries.length > 0) {
    const chainResult = (0, import_audit_integrity.verifyAuditChain)(entries);
    if (!chainResult.valid) {
      import_logger.logger.warn(
        `\u26A0\uFE0F Audit log integrity check failed at entry index ${chainResult.firstInvalidIndex}. Entries may have been modified.`
      );
    }
  }
  return entries;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getAuditLog,
  recordAudit
});
