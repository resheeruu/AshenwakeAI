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
var audit_log_exports = {};
__export(audit_log_exports, {
  audit: () => audit,
  getAuditLogPath: () => getAuditLogPath,
  readRecentAuditEntries: () => readRecentAuditEntries
});
module.exports = __toCommonJS(audit_log_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
const ROOT = process.cwd();
const LOG_DIR = import_path.default.join(ROOT, "data", "agent-logs");
const LOG_FILE = import_path.default.join(LOG_DIR, "agent-audit.jsonl");
function ensureLogDirectory() {
  import_fs.default.mkdirSync(LOG_DIR, { recursive: true });
}
function audit(level, event, details) {
  ensureLogDirectory();
  const entry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    event,
    ...details ? { details } : {}
  };
  import_fs.default.appendFileSync(
    LOG_FILE,
    `${JSON.stringify(entry)}
`,
    "utf8"
  );
  return entry;
}
function getAuditLogPath() {
  return LOG_FILE;
}
function readRecentAuditEntries(limit = 100) {
  ensureLogDirectory();
  if (!import_fs.default.existsSync(LOG_FILE)) {
    return [];
  }
  const lines = import_fs.default.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
  return lines.slice(-Math.max(1, limit)).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level: "error",
        event: "invalid_audit_entry",
        details: line
      };
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  audit,
  getAuditLogPath,
  readRecentAuditEntries
});
