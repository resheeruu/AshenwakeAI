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
var audit_exports = {};
__export(audit_exports, {
  getToolAuditLog: () => getToolAuditLog,
  recordToolAudit: () => recordToolAudit
});
module.exports = __toCommonJS(audit_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_logger = require("../../logger");
var import_redact = require("../../security/redact");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const AUDIT_FILE = import_path.default.join(DATA_DIR, "tool-audit.json");
const MAX_ENTRIES = 5e3;
let auditLog = [];
function loadAudit() {
  try {
    if (!import_fs.default.existsSync(AUDIT_FILE)) return;
    const raw = import_fs.default.readFileSync(AUDIT_FILE, "utf8");
    auditLog = JSON.parse(raw);
  } catch {
    auditLog = [];
  }
}
function saveAudit() {
  try {
    import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
    if (auditLog.length > MAX_ENTRIES) {
      auditLog = auditLog.slice(-MAX_ENTRIES);
    }
    const tmpPath = AUDIT_FILE + ".tmp";
    import_fs.default.writeFileSync(tmpPath, JSON.stringify(auditLog, null, 2), "utf8");
    import_fs.default.renameSync(tmpPath, AUDIT_FILE);
  } catch (error) {
    import_logger.logger.warn(
      `Could not save tool audit log: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
loadAudit();
function recordToolAudit(context, result, denialReason, startTime, dryRun) {
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now(),
    guildId: context.guildId,
    channelId: context.channelId,
    requesterId: context.requesterId,
    requesterName: String((0, import_redact.redact)(context.requesterName)),
    toolName: context.arguments._toolName || "unknown",
    riskLevel: "low",
    result,
    denialReason,
    durationMs: Date.now() - startTime,
    dryRun
  };
  auditLog.push(entry);
  saveAudit();
  return entry;
}
function getToolAuditLog(options = {}) {
  let entries = auditLog;
  if (options.guildId) {
    entries = entries.filter((e) => e.guildId === options.guildId);
  }
  if (options.requesterId) {
    entries = entries.filter((e) => e.requesterId === options.requesterId);
  }
  if (options.toolName) {
    entries = entries.filter((e) => e.toolName === options.toolName);
  }
  if (options.since) {
    const since = options.since;
    entries = entries.filter((e) => e.timestamp >= since);
  }
  const limit = options.limit || 100;
  return entries.slice(-limit);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getToolAuditLog,
  recordToolAudit
});
