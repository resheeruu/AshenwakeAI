#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var import_child_process = require("child_process");
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_database = require("./database");
const VERSION = (() => {
  try {
    const pkg = JSON.parse(import_fs.default.readFileSync(import_path.default.join(process.cwd(), "package.json"), "utf8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
})();
const METHODS = {
  status,
  start,
  stop,
  restart,
  doctor,
  logs,
  providers,
  memory,
  usage,
  "seraph-status": seraphStatus,
  "seraph-doctor": seraphDoctor,
  "seraph-investigate": seraphInvestigate,
  "seraph-reports": seraphReports,
  "seraph-tools": seraphTools,
  "seraph-info": seraphInfo,
  help,
  version
};
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";
  if (command === "chat") {
    chat(args.slice(1).join(" "));
    return;
  }
  const method = METHODS[command];
  if (method) {
    method();
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Run 'ashen help' for available commands.");
    process.exit(1);
  }
}
function status() {
  try {
    const healthFile = import_path.default.join(process.cwd(), "data", "provider-health.json");
    const providers2 = import_fs.default.existsSync(healthFile) ? Object.keys(JSON.parse(import_fs.default.readFileSync(healthFile, "utf8"))) : [];
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
    console.log("  ASHENAI STATUS");
    console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
    console.log(`  Version:     ${VERSION}`);
    console.log(`  Node:        ${process.version}`);
    console.log(`  Platform:    ${process.platform} ${process.arch}`);
    console.log(`  PID:         ${process.pid}`);
    console.log(`  Uptime:      ${formatUptime(process.uptime())}`);
    console.log(`  Memory:      ${heapMB}MB heap`);
    console.log(`  Providers:   ${providers2.length} configured`);
    console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
    const pidFile = import_path.default.join(process.cwd(), "data", "ashenai.pid");
    if (import_fs.default.existsSync(pidFile)) {
      const pid = parseInt(import_fs.default.readFileSync(pidFile, "utf8").trim(), 10);
      try {
        process.kill(pid, 0);
        console.log(`  Process:     Running (PID ${pid})`);
      } catch {
        console.log(`  Process:     Not running (stale PID ${pid})`);
      }
    } else {
      console.log(`  Process:     Status unknown (no PID file)`);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
function start() {
  console.log("Starting AshenAI...");
  const pidFile = import_path.default.join(process.cwd(), "data", "ashenai.pid");
  if (import_fs.default.existsSync(pidFile)) {
    const pid = parseInt(import_fs.default.readFileSync(pidFile, "utf8").trim(), 10);
    try {
      process.kill(pid, 0);
      console.log(`AshenAI is already running (PID ${pid}).`);
      return;
    } catch {
    }
  }
  try {
    const child = (0, import_child_process.spawn)("npx", ["tsx", "src/index.ts"], {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", import_fs.default.openSync(import_path.default.join(process.cwd(), "data", "ashenai.log"), "a"), import_fs.default.openSync(import_path.default.join(process.cwd(), "data", "ashenai.log"), "a")]
    });
    child.unref();
    const pid = String(child.pid);
    import_fs.default.mkdirSync(import_path.default.join(process.cwd(), "data"), { recursive: true });
    import_fs.default.writeFileSync(pidFile, pid);
    console.log(`AshenAI started (PID ${pid}).`);
  } catch (error) {
    console.error(`Failed to start AshenAI: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
function stop() {
  const pidFile = import_path.default.join(process.cwd(), "data", "ashenai.pid");
  if (!import_fs.default.existsSync(pidFile)) {
    console.log("No PID file found. AshenAI may not be running.");
    return;
  }
  const pid = parseInt(import_fs.default.readFileSync(pidFile, "utf8").trim(), 10);
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to PID ${pid}.`);
    import_fs.default.unlinkSync(pidFile);
  } catch (error) {
    console.error(`Failed to stop PID ${pid}: ${error instanceof Error ? error.message : String(error)}`);
    import_fs.default.unlinkSync(pidFile);
  }
}
function restart() {
  stop();
  setTimeout(() => start(), 1e3);
}
function doctor() {
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log("  ASHENAI DOCTOR");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  const checks = [];
  const dataDir = import_path.default.join(process.cwd(), "data");
  checks.push({
    name: "Data Directory",
    status: import_fs.default.existsSync(dataDir) ? "\u2713" : "\u2717",
    message: import_fs.default.existsSync(dataDir) ? "Exists" : "Missing"
  });
  const criticalFiles = ["src/index.ts", "src/config/env.ts", "package.json", "tsconfig.json"];
  const missing = criticalFiles.filter((f) => !import_fs.default.existsSync(import_path.default.join(process.cwd(), f)));
  checks.push({
    name: "Critical Files",
    status: missing.length === 0 ? "\u2713" : "\u2717",
    message: missing.length === 0 ? "All present" : `Missing: ${missing.join(", ")}`
  });
  const envFile = import_path.default.join(process.cwd(), ".env");
  checks.push({
    name: "Environment",
    status: import_fs.default.existsSync(envFile) ? "\u2713" : "\u2717",
    message: import_fs.default.existsSync(envFile) ? ".env exists" : ".env missing"
  });
  const healthFile = import_path.default.join(dataDir, "provider-health.json");
  if (import_fs.default.existsSync(healthFile)) {
    const health = JSON.parse(import_fs.default.readFileSync(healthFile, "utf8"));
    const disabled = Object.entries(health).filter(([_, v]) => v.disabledUntil > Date.now());
    checks.push({
      name: "AI Providers",
      status: disabled.length === 0 ? "\u2713" : "\u26A0",
      message: `${Object.keys(health).length} configured, ${disabled.length} disabled`
    });
  }
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  checks.push({
    name: "Memory",
    status: heapMB > 512 ? "\u2717" : heapMB > 256 ? "\u26A0" : "\u2713",
    message: `${heapMB}MB heap`
  });
  for (const check of checks) {
    console.log(`  ${check.status} ${check.name}: ${check.message}`);
  }
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
}
function logs() {
  const logFile = import_path.default.join(process.cwd(), "data", "ashenai.log");
  if (!import_fs.default.existsSync(logFile)) {
    console.log("No log file found.");
    return;
  }
  try {
    const content = import_fs.default.readFileSync(logFile, "utf8");
    const lines = content.split("\n").filter(Boolean).slice(-50);
    for (const line of lines) {
      console.log(line);
    }
  } catch (error) {
    console.error(`Error reading logs: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function providers() {
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log("  AI PROVIDERS");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  const healthFile = import_path.default.join(process.cwd(), "data", "provider-health.json");
  if (!import_fs.default.existsSync(healthFile)) {
    console.log("  No provider health data available.");
    return;
  }
  const health = JSON.parse(import_fs.default.readFileSync(healthFile, "utf8"));
  for (const [name, data] of Object.entries(health)) {
    const disabled = data.disabledUntil > Date.now();
    const status2 = disabled ? "\u2717 DISABLED" : data.failures > data.successes ? "\u26A0 DEGRADED" : "\u2713 OK";
    const latency = data.lastLatencyMs ? `${data.lastLatencyMs}ms` : "N/A";
    console.log(`  ${status2}  ${name}  (${data.successes} ok, ${data.failures} fail, ${latency})`);
  }
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
}
function memory() {
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log("  MEMORY STATS");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  try {
    const conversations = (0, import_database.loadConversationsDB)();
    const count = conversations.size;
    let totalMessages = 0;
    for (const conv of conversations.values()) {
      totalMessages += conv.messages.length;
    }
    console.log(`  Conversations:   ${count}`);
    console.log(`  Total Messages:  ${totalMessages}`);
  } catch {
    console.log("  No conversation data yet.");
  }
  const mem = process.memoryUsage();
  console.log(`  Heap:            ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
  console.log(`  RSS:             ${Math.round(mem.rss / 1024 / 1024)}MB`);
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
}
function usage() {
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log("  USAGE STATISTICS");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  const usageFile = import_path.default.join(process.cwd(), "data", "usage.json");
  if (import_fs.default.existsSync(usageFile)) {
    const data = JSON.parse(import_fs.default.readFileSync(usageFile, "utf8"));
    if (data.global) {
      console.log(`  Total Requests:  ${data.global.totalRequests || 0}`);
      console.log(`  Total Credits:   ${data.global.totalCredits || 0}`);
      console.log(`  Failures:        ${data.global.failures || 0}`);
    }
    if (data.providers) {
      console.log("  Provider Usage:");
      for (const [name, usage2] of Object.entries(data.providers)) {
        console.log(`    ${name}: ${usage2.requests || 0} requests, ${usage2.credits || 0} credits`);
      }
    }
  } else {
    console.log("  No usage data yet.");
  }
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
}
function seraphStatus() {
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log("  SERAPH STATUS");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log(`  Active:    Yes`);
  console.log(`  Version:   1.0.0`);
  console.log(`  Uptime:    ${formatUptime(process.uptime())}`);
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
}
function seraphDoctor() {
  console.log("Running Seraph doctor...");
  try {
    const seraph = require("./seraph");
    const result = seraph.runDoctor();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Doctor failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function seraphInvestigate() {
  const problem = process.argv.slice(3).join(" ") || "general health";
  console.log(`Investigating: ${problem}`);
  try {
    const seraph = require("./seraph");
    const result = seraph.runInvestigation(problem);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Investigation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function seraphReports() {
  const reportsDir = import_path.default.join(process.cwd(), "data", "seraph-reports");
  if (!import_fs.default.existsSync(reportsDir)) {
    console.log("No reports available.");
    return;
  }
  const files = import_fs.default.readdirSync(reportsDir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 5);
  if (files.length === 0) {
    console.log("No reports available.");
    return;
  }
  for (const file of files) {
    const report = JSON.parse(import_fs.default.readFileSync(import_path.default.join(reportsDir, file), "utf8"));
    console.log(`  [${report.type}] ${report.summary} (${new Date(report.generatedAt).toLocaleString()})`);
  }
}
function seraphTools() {
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log("  SERAPH TOOLS");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log("  doctor         Run comprehensive health diagnostics");
  console.log("  health         Quick health check");
  console.log("  investigate    Investigate a specific problem");
  console.log("  report         Generate a system report");
  console.log("  status         Show Seraph system status");
  console.log("  memory_check   Check memory usage");
  console.log("  provider_check Check AI provider health");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
}
function seraphInfo() {
  const os = require("os");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log("  SYSTEM INFORMATION");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log(`  Hostname:     ${os.hostname()}`);
  console.log(`  Platform:     ${os.platform()} ${os.arch()}`);
  console.log(`  Release:      ${os.release()}`);
  console.log(`  Node:         ${process.version}`);
  console.log(`  CPUs:         ${os.cpus().length} cores`);
  console.log(`  Total Memory: ${Math.round(os.totalmem() / 1024 / 1024)}MB`);
  console.log(`  Free Memory:  ${Math.round(os.freemem() / 1024 / 1024)}MB`);
  console.log(`  Load Avg:     ${os.loadavg().map((l) => l.toFixed(2)).join(", ")}`);
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
}
function chat(message) {
  if (!message) {
    console.error('Usage: ashen chat "your message"');
    process.exit(1);
  }
  console.log(`[AshenAI] ${message}`);
  console.log("(Chat requires the bot to be running. Use 'ashen start' first.)");
}
function help() {
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log("  ASHENAI CLI \u2014 Termux Owner Control");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  console.log("");
  console.log("  SYSTEM:");
  console.log("    ashen status              Show system status");
  console.log("    ashen start               Start AshenAI");
  console.log("    ashen stop                Stop AshenAI");
  console.log("    ashen restart             Restart AshenAI");
  console.log("    ashen doctor              Run health diagnostics");
  console.log("    ashen logs                Show recent logs");
  console.log("");
  console.log("  AI:");
  console.log("    ashen providers           Show AI provider status");
  console.log('    ashen chat "message"      Chat with AshenAI');
  console.log("");
  console.log("  DATA:");
  console.log("    ashen memory              Show memory stats");
  console.log("    ashen usage               Show usage statistics");
  console.log("");
  console.log("  SERAPH:");
  console.log("    ashen seraph-status       Show Seraph status");
  console.log("    ashen seraph-doctor       Run Seraph doctor");
  console.log("    ashen seraph-investigate  Investigate a problem");
  console.log("    ashen seraph-reports      Show recent reports");
  console.log("    ashen seraph-tools        List available tools");
  console.log("    ashen seraph-info         Show system information");
  console.log("");
  console.log("  INFO:");
  console.log("    ashen version             Show version");
  console.log("    ashen help                Show this help");
  console.log("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
}
function version() {
  console.log(`AshenAI CLI v${VERSION}`);
}
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
main();
