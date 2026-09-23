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
var seraph_service_exports = {};
__export(seraph_service_exports, {
  generateReport: () => generateReport,
  getMonitoringInfo: () => getMonitoringInfo,
  getReports: () => getReports,
  getStatus: () => getStatus,
  getSystemInformation: () => getSystemInformation,
  getTools: () => getTools,
  runDoctor: () => runDoctor,
  runInvestigation: () => runInvestigation
});
module.exports = __toCommonJS(seraph_service_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_audit = require("../security/audit");
var import_health_checker = require("../core/health-checker");
var import_health_scanner = require("../diagnostics/health-scanner");
var import_optimizer = require("../diagnostics/optimizer");
var import_database = require("../database");
const SERAPH_VERSION = "1.0.0";
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const INVESTIGATIONS_DIR = import_path.default.join(DATA_DIR, "seraph-investigations");
const REPORTS_DIR = import_path.default.join(DATA_DIR, "seraph-reports");
let lastCheck = 0;
let cachedStatus = null;
function ensureDirs() {
  try {
    import_fs.default.mkdirSync(INVESTIGATIONS_DIR, { recursive: true });
  } catch {
  }
  try {
    import_fs.default.mkdirSync(REPORTS_DIR, { recursive: true });
  } catch {
  }
}
function getStatus() {
  const now = Date.now();
  if (cachedStatus && now - lastCheck < 3e4) return cachedStatus;
  const components = checkComponents();
  const allOperational = components.every((c) => c.status === "operational");
  const anyOffline = components.some((c) => c.status === "offline");
  cachedStatus = {
    active: true,
    version: SERAPH_VERSION,
    uptime: Math.floor(process.uptime()),
    lastCheck: now,
    components
  };
  lastCheck = now;
  return cachedStatus;
}
function checkComponents() {
  const now = Date.now();
  const components = [];
  components.push(checkComponent("ai_router", () => {
    const healthFile = import_path.default.join(DATA_DIR, "provider-health.json");
    if (!import_fs.default.existsSync(healthFile)) return { status: "degraded", message: "No provider health data" };
    return { status: "operational" };
  }));
  components.push(checkComponent("data_store", () => {
    if (!import_fs.default.existsSync(DATA_DIR)) return { status: "offline", message: "Data directory missing" };
    const files = import_fs.default.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
    return { status: files.length > 0 ? "operational" : "degraded", message: `${files.length} data files` };
  }));
  components.push(checkComponent("audit_log", () => {
    const entries = (0, import_database.getAuditLogDB)({ limit: 1 });
    return entries.length > 0 ? { status: "operational", message: `${entries.length}+ audit entries in SQLite` } : { status: "degraded", message: "No audit entries yet" };
  }));
  components.push(checkComponent("memory", () => {
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    if (heapMB > 512) return { status: "offline", message: `Heap critical: ${heapMB}MB` };
    if (heapMB > 256) return { status: "degraded", message: `Heap elevated: ${heapMB}MB` };
    return { status: "operational", message: `${heapMB}MB heap` };
  }));
  components.push(checkComponent("typescript", () => {
    const distExists = import_fs.default.existsSync(import_path.default.join(process.cwd(), "dist"));
    return { status: distExists ? "operational" : "degraded", message: distExists ? "Build present" : "No build output" };
  }));
  return components;
}
function checkComponent(name, check) {
  try {
    const result = check();
    return { name, status: result.status, lastCheck: Date.now(), message: result.message };
  } catch (error) {
    return { name, status: "offline", lastCheck: Date.now(), message: String(error) };
  }
}
function runDoctor() {
  const checks = [];
  const recommendations = [];
  const healthReport = (0, import_health_checker.runHealthCheck)();
  for (const check of healthReport.checks) {
    checks.push({
      name: check.name,
      status: check.status,
      message: check.message
    });
  }
  const projectScan = (0, import_health_scanner.scanAshenAI)();
  for (const finding of projectScan.findings) {
    checks.push({
      name: finding.area,
      status: finding.level === "error" ? "fail" : finding.level === "warning" ? "warn" : "pass",
      message: finding.message
    });
  }
  const optimizations = (0, import_optimizer.generateOptimizations)(projectScan);
  for (const opt of optimizations) {
    recommendations.push(`[${opt.priority}] ${opt.area}: ${opt.suggestion}`);
  }
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  if (heapMB > 256) {
    recommendations.push(`[high] memory: Consider restarting to free ${heapMB}MB heap`);
  }
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const score = Math.max(0, 100 - fails * 20 - warns * 5);
  (0, import_audit.recordAudit)({
    who: "seraph",
    what: "Ran Seraph doctor",
    where: "seraph",
    result: "success",
    details: `Score: ${score}, checks: ${checks.length}`
  });
  return {
    overall: fails > 2 ? "unhealthy" : fails > 0 || warns > 3 ? "degraded" : "healthy",
    score,
    checks,
    recommendations,
    timestamp: Date.now()
  };
}
function runInvestigation(problem) {
  ensureDirs();
  const investigation = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    problem,
    startedAt: Date.now(),
    status: "running",
    findings: [],
    recommendations: []
  };
  try {
    const doctor = runDoctor();
    investigation.findings = doctor.checks.filter((c) => c.status !== "pass").map((c) => ({
      severity: c.status === "fail" ? "error" : "warning",
      area: c.name,
      message: c.message
    }));
    investigation.recommendations = doctor.recommendations;
    if (problem.toLowerCase().includes("memory")) {
      const mem = process.memoryUsage();
      investigation.findings.push({
        severity: "info",
        area: "memory_snapshot",
        message: `Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`
      });
    }
    if (problem.toLowerCase().includes("provider") || problem.toLowerCase().includes("ai")) {
      const healthFile = import_path.default.join(DATA_DIR, "provider-health.json");
      if (import_fs.default.existsSync(healthFile)) {
        const data = JSON.parse(import_fs.default.readFileSync(healthFile, "utf8"));
        const disabled = Object.entries(data).filter(([_, v]) => v.disabledUntil > Date.now());
        if (disabled.length > 0) {
          investigation.findings.push({
            severity: "warning",
            area: "providers",
            message: `${disabled.length} providers currently disabled`,
            evidence: disabled.map(([name]) => name).join(", ")
          });
        }
      }
    }
    investigation.status = "completed";
    investigation.completedAt = Date.now();
    const filePath = import_path.default.join(INVESTIGATIONS_DIR, `${investigation.id}.json`);
    const tmpPath = filePath + ".tmp";
    import_fs.default.writeFileSync(tmpPath, JSON.stringify(investigation, null, 2), "utf8");
    import_fs.default.renameSync(tmpPath, filePath);
    (0, import_audit.recordAudit)({
      who: "seraph",
      what: `Investigation completed: ${problem}`,
      where: "seraph",
      result: "success",
      details: `Findings: ${investigation.findings.length}, Recommendations: ${investigation.recommendations.length}`
    });
  } catch (error) {
    investigation.status = "failed";
    investigation.completedAt = Date.now();
    investigation.findings.push({
      severity: "critical",
      area: "investigation",
      message: `Investigation failed: ${error instanceof Error ? error.message : String(error)}`
    });
  }
  return investigation;
}
function getReports() {
  ensureDirs();
  try {
    const files = import_fs.default.readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 10);
    return files.map((f) => {
      const data = import_fs.default.readFileSync(import_path.default.join(REPORTS_DIR, f), "utf8");
      return JSON.parse(data);
    });
  } catch {
    return [];
  }
}
function generateReport(type) {
  ensureDirs();
  const sections = [];
  let summary = "";
  if (type === "health" || type === "diagnostic") {
    const doctor = runDoctor();
    sections.push({
      title: "Health Check",
      content: `Overall: ${doctor.overall} (score: ${doctor.score})`,
      severity: doctor.overall === "healthy" ? "info" : doctor.overall === "degraded" ? "warning" : "error"
    });
    sections.push({
      title: "Checks",
      content: doctor.checks.map((c) => `[${c.status.toUpperCase()}] ${c.name}: ${c.message}`).join("\n")
    });
    if (doctor.recommendations.length > 0) {
      sections.push({
        title: "Recommendations",
        content: doctor.recommendations.join("\n"),
        severity: "warning"
      });
    }
    summary = `Health: ${doctor.overall} (${doctor.score}/100), ${doctor.checks.length} checks`;
  }
  if (type === "performance") {
    const mem = process.memoryUsage();
    sections.push({
      title: "Memory",
      content: `Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB
RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`
    });
    sections.push({
      title: "Uptime",
      content: `${Math.floor(process.uptime() / 3600)}h ${Math.floor(process.uptime() % 3600 / 60)}m`
    });
    summary = `Performance snapshot at ${(/* @__PURE__ */ new Date()).toISOString()}`;
  }
  if (type === "security") {
    const entries = (0, import_database.getAuditLogDB)({ limit: 100 });
    if (entries.length > 0) {
      const failures = entries.filter((e) => e.result === "failure" || e.result === "denied");
      sections.push({
        title: "Recent Audit",
        content: `Last ${entries.length} entries: ${failures.length} failures/denials`,
        severity: failures.length > 10 ? "warning" : "info"
      });
    }
    summary = `Security report at ${(/* @__PURE__ */ new Date()).toISOString()}`;
  }
  const report = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    generatedAt: Date.now(),
    summary,
    sections
  };
  const filePath = import_path.default.join(REPORTS_DIR, `${report.id}.json`);
  const tmpPath = filePath + ".tmp";
  import_fs.default.writeFileSync(tmpPath, JSON.stringify(report, null, 2), "utf8");
  import_fs.default.renameSync(tmpPath, filePath);
  return report;
}
function getTools() {
  return [
    { name: "doctor", description: "Run comprehensive health diagnostics", category: "diagnostic", safe: true },
    { name: "health", description: "Quick health check", category: "diagnostic", safe: true },
    { name: "investigate", description: "Investigate a specific problem", category: "diagnostic", safe: true },
    { name: "report", description: "Generate a system report", category: "report", safe: true },
    { name: "status", description: "Show Seraph system status", category: "monitoring", safe: true },
    { name: "memory_check", description: "Check memory usage and suggest cleanup", category: "diagnostic", safe: true },
    { name: "provider_check", description: "Check AI provider health", category: "diagnostic", safe: true }
  ];
}
function getMonitoringInfo() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    memory: {
      heapMB: Math.round(mem.heapUsed / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024)
    },
    uptime: Math.floor(process.uptime()),
    cpuUsage: { user: cpu.user, system: cpu.system },
    activeSessions: 0
  };
}
function getSystemInformation() {
  const os = require("os");
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    nodeVersion: process.version,
    cpus: `${os.cpus().length} cores`,
    totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
    freeMemory: `${Math.round(os.freemem() / 1024 / 1024)}MB`,
    loadAverage: os.loadavg().map((l) => l.toFixed(2)).join(", ")
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generateReport,
  getMonitoringInfo,
  getReports,
  getStatus,
  getSystemInformation,
  getTools,
  runDoctor,
  runInvestigation
});
