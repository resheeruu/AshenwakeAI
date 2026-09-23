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
var health_checker_exports = {};
__export(health_checker_exports, {
  runHealthCheck: () => runHealthCheck
});
module.exports = __toCommonJS(health_checker_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_guild_config = require("./guild-config");
function runHealthCheck(guildId) {
  const checks = [];
  checks.push(checkCriticalFiles());
  checks.push(checkDataDirectory());
  checks.push(checkMemoryUsage());
  checks.push(checkUptime());
  if (guildId) {
    const config = (0, import_guild_config.loadGuildConfig)(guildId);
    checks.push(checkGuildConfig(config));
  }
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const score = Math.max(0, 100 - fails * 20 - warns * 5);
  const overall = fails > 2 ? "unhealthy" : fails > 0 || warns > 3 ? "degraded" : "healthy";
  return { overall, score, checks, timestamp: Date.now() };
}
function checkCriticalFiles() {
  const criticalFiles = ["src/index.ts", "src/config/env.ts", "package.json", "tsconfig.json"];
  const missing = criticalFiles.filter((f) => !import_fs.default.existsSync(import_path.default.join(process.cwd(), f)));
  return {
    name: "critical_files",
    status: missing.length === 0 ? "pass" : missing.length > 2 ? "fail" : "warn",
    message: missing.length === 0 ? "All critical files present" : `Missing: ${missing.join(", ")}`
  };
}
function checkDataDirectory() {
  const dataDir = import_path.default.join(process.cwd(), "data");
  const exists = import_fs.default.existsSync(dataDir);
  if (!exists) return { name: "data_directory", status: "warn", message: "Data directory does not exist yet" };
  try {
    const files = import_fs.default.readdirSync(dataDir);
    return { name: "data_directory", status: "pass", message: `Data directory healthy (${files.length} files)` };
  } catch {
    return { name: "data_directory", status: "fail", message: "Cannot read data directory" };
  }
}
function checkMemoryUsage() {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  if (heapMB > 512) return { name: "memory", status: "fail", message: `Heap usage critical: ${heapMB}MB`, details: `RSS: ${rssMB}MB` };
  if (heapMB > 256) return { name: "memory", status: "warn", message: `Heap usage elevated: ${heapMB}MB`, details: `RSS: ${rssMB}MB` };
  return { name: "memory", status: "pass", message: `Memory OK: ${heapMB}MB heap, ${rssMB}MB RSS` };
}
function checkUptime() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor(uptime % 3600 / 60);
  return { name: "uptime", status: "pass", message: `Uptime: ${hours}h ${minutes}m` };
}
function checkGuildConfig(config) {
  const issues = [];
  if (!config.automod?.enabled) issues.push("Automod disabled");
  if (!config.moderation?.enabled) issues.push("Moderation disabled");
  if (!config.tickets?.enabled) issues.push("Tickets disabled");
  if (issues.length > 3) return { name: "guild_config", status: "warn", message: `Many features disabled: ${issues.join(", ")}` };
  return { name: "guild_config", status: "pass", message: `Guild config OK (${issues.length} disabled features)` };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runHealthCheck
});
