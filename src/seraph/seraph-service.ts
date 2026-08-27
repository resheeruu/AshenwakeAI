import fs from "fs";
import path from "path";
import { logger } from "../logger";
import { recordAudit } from "../security/audit";
import { redact } from "../security/redact";
import { runHealthCheck } from "../core/health-checker";
import { scanAshenAI } from "../diagnostics/health-scanner";
import { generateOptimizations } from "../diagnostics/optimizer";
import {
  SeraphStatus,
  SeraphDoctorResult,
  SeraphCheck,
  SeraphInvestigation,
  SeraphFinding,
  SeraphReport,
  SeraphReportSection,
  SeraphTool,
} from "./types";

const SERAPH_VERSION = "1.0.0";
const DATA_DIR = path.join(process.cwd(), "data");
const INVESTIGATIONS_DIR = path.join(DATA_DIR, "seraph-investigations");
const REPORTS_DIR = path.join(DATA_DIR, "seraph-reports");

let lastCheck = 0;
let cachedStatus: SeraphStatus | null = null;

function ensureDirs(): void {
  try { fs.mkdirSync(INVESTIGATIONS_DIR, { recursive: true }); } catch { /* */ }
  try { fs.mkdirSync(REPORTS_DIR, { recursive: true }); } catch { /* */ }
}

export function getStatus(): SeraphStatus {
  const now = Date.now();
  if (cachedStatus && now - lastCheck < 30_000) return cachedStatus;

  const components = checkComponents();
  const allOperational = components.every((c) => c.status === "operational");
  const anyOffline = components.some((c) => c.status === "offline");

  cachedStatus = {
    active: true,
    version: SERAPH_VERSION,
    uptime: Math.floor(process.uptime()),
    lastCheck: now,
    components,
  };

  lastCheck = now;
  return cachedStatus;
}

function checkComponents(): SeraphStatus["components"] {
  const now = Date.now();
  const components: SeraphStatus["components"] = [];

  components.push(checkComponent("ai_router", () => {
    const healthFile = path.join(DATA_DIR, "provider-health.json");
    if (!fs.existsSync(healthFile)) return { status: "degraded", message: "No provider health data" };
    return { status: "operational" };
  }));

  components.push(checkComponent("data_store", () => {
    if (!fs.existsSync(DATA_DIR)) return { status: "offline", message: "Data directory missing" };
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
    return { status: files.length > 0 ? "operational" : "degraded", message: `${files.length} data files` };
  }));

  components.push(checkComponent("audit_log", () => {
    const auditFile = path.join(DATA_DIR, "audit-log.json");
    if (!fs.existsSync(auditFile)) return { status: "degraded", message: "No audit log yet" };
    return { status: "operational" };
  }));

  components.push(checkComponent("memory", () => {
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    if (heapMB > 512) return { status: "offline", message: `Heap critical: ${heapMB}MB` };
    if (heapMB > 256) return { status: "degraded", message: `Heap elevated: ${heapMB}MB` };
    return { status: "operational", message: `${heapMB}MB heap` };
  }));

  components.push(checkComponent("typescript", () => {
    const distExists = fs.existsSync(path.join(process.cwd(), "dist"));
    return { status: distExists ? "operational" : "degraded", message: distExists ? "Build present" : "No build output" };
  }));

  return components;
}

function checkComponent(
  name: string,
  check: () => { status: "operational" | "degraded" | "offline"; message?: string },
): SeraphStatus["components"][number] {
  try {
    const result = check();
    return { name, status: result.status, lastCheck: Date.now(), message: result.message };
  } catch (error) {
    return { name, status: "offline", lastCheck: Date.now(), message: String(error) };
  }
}

export function runDoctor(): SeraphDoctorResult {
  const checks: SeraphCheck[] = [];
  const recommendations: string[] = [];

  const healthReport = runHealthCheck();
  for (const check of healthReport.checks) {
    checks.push({
      name: check.name,
      status: check.status,
      message: check.message,
    });
  }

  const projectScan = scanAshenAI();
  for (const finding of projectScan.findings) {
    checks.push({
      name: finding.area,
      status: finding.level === "error" ? "fail" : finding.level === "warning" ? "warn" : "pass",
      message: finding.message,
    });
  }

  const optimizations = generateOptimizations(projectScan);
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

  recordAudit({
    who: "seraph",
    what: "Ran Seraph doctor",
    where: "seraph",
    result: "success",
    details: `Score: ${score}, checks: ${checks.length}`,
  });

  return {
    overall: fails > 2 ? "unhealthy" : fails > 0 || warns > 3 ? "degraded" : "healthy",
    score,
    checks,
    recommendations,
    timestamp: Date.now(),
  };
}

export function runInvestigation(problem: string): SeraphInvestigation {
  ensureDirs();

  const investigation: SeraphInvestigation = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    problem,
    startedAt: Date.now(),
    status: "running",
    findings: [],
    recommendations: [],
  };

  try {
    const doctor = runDoctor();

    investigation.findings = doctor.checks
      .filter((c) => c.status !== "pass")
      .map((c) => ({
        severity: c.status === "fail" ? "error" as const : "warning" as const,
        area: c.name,
        message: c.message,
      }));

    investigation.recommendations = doctor.recommendations;

    if (problem.toLowerCase().includes("memory")) {
      const mem = process.memoryUsage();
      investigation.findings.push({
        severity: "info",
        area: "memory_snapshot",
        message: `Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB, RSS: ${Math.round(mem.rss / 1024 / 1024)}MB`,
      });
    }

    if (problem.toLowerCase().includes("provider") || problem.toLowerCase().includes("ai")) {
      const healthFile = path.join(DATA_DIR, "provider-health.json");
      if (fs.existsSync(healthFile)) {
        const data = JSON.parse(fs.readFileSync(healthFile, "utf8"));
        const disabled = Object.entries(data).filter(([_, v]: [string, any]) => v.disabledUntil > Date.now());
        if (disabled.length > 0) {
          investigation.findings.push({
            severity: "warning",
            area: "providers",
            message: `${disabled.length} providers currently disabled`,
            evidence: disabled.map(([name]: [string, any]) => name).join(", "),
          });
        }
      }
    }

    investigation.status = "completed";
    investigation.completedAt = Date.now();

    const filePath = path.join(INVESTIGATIONS_DIR, `${investigation.id}.json`);
    const tmpPath = filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(investigation, null, 2), "utf8");
    fs.renameSync(tmpPath, filePath);

    recordAudit({
      who: "seraph",
      what: `Investigation completed: ${problem}`,
      where: "seraph",
      result: "success",
      details: `Findings: ${investigation.findings.length}, Recommendations: ${investigation.recommendations.length}`,
    });
  } catch (error) {
    investigation.status = "failed";
    investigation.completedAt = Date.now();
    investigation.findings.push({
      severity: "critical",
      area: "investigation",
      message: `Investigation failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return investigation;
}

export function getReports(): SeraphReport[] {
  ensureDirs();
  try {
    const files = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 10);
    return files.map((f) => {
      const data = fs.readFileSync(path.join(REPORTS_DIR, f), "utf8");
      return JSON.parse(data) as SeraphReport;
    });
  } catch {
    return [];
  }
}

export function generateReport(type: SeraphReport["type"]): SeraphReport {
  ensureDirs();

  const sections: SeraphReportSection[] = [];
  let summary = "";

  if (type === "health" || type === "diagnostic") {
    const doctor = runDoctor();
    sections.push({
      title: "Health Check",
      content: `Overall: ${doctor.overall} (score: ${doctor.score})`,
      severity: doctor.overall === "healthy" ? "info" : doctor.overall === "degraded" ? "warning" : "error",
    });
    sections.push({
      title: "Checks",
      content: doctor.checks.map((c) => `[${c.status.toUpperCase()}] ${c.name}: ${c.message}`).join("\n"),
    });
    if (doctor.recommendations.length > 0) {
      sections.push({
        title: "Recommendations",
        content: doctor.recommendations.join("\n"),
        severity: "warning",
      });
    }
    summary = `Health: ${doctor.overall} (${doctor.score}/100), ${doctor.checks.length} checks`;
  }

  if (type === "performance") {
    const mem = process.memoryUsage();
    sections.push({
      title: "Memory",
      content: `Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB\nRSS: ${Math.round(mem.rss / 1024 / 1024)}MB`,
    });
    sections.push({
      title: "Uptime",
      content: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    });
    summary = `Performance snapshot at ${new Date().toISOString()}`;
  }

  if (type === "security") {
    const auditFile = path.join(DATA_DIR, "audit-log.json");
    if (fs.existsSync(auditFile)) {
      const audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
      const recent = audit.slice(-100);
      const failures = recent.filter((e: any) => e.result === "failure" || e.result === "denied");
      sections.push({
        title: "Recent Audit",
        content: `Last 100 entries: ${failures.length} failures/denials`,
        severity: failures.length > 10 ? "warning" : "info",
      });
    }
    summary = `Security report at ${new Date().toISOString()}`;
  }

  const report: SeraphReport = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    generatedAt: Date.now(),
    summary,
    sections,
  };

  const filePath = path.join(REPORTS_DIR, `${report.id}.json`);
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(report, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);

  return report;
}

export function getTools(): SeraphTool[] {
  return [
    { name: "doctor", description: "Run comprehensive health diagnostics", category: "diagnostic", safe: true },
    { name: "health", description: "Quick health check", category: "diagnostic", safe: true },
    { name: "investigate", description: "Investigate a specific problem", category: "diagnostic", safe: true },
    { name: "report", description: "Generate a system report", category: "report", safe: true },
    { name: "status", description: "Show Seraph system status", category: "monitoring", safe: true },
    { name: "memory_check", description: "Check memory usage and suggest cleanup", category: "diagnostic", safe: true },
    { name: "provider_check", description: "Check AI provider health", category: "diagnostic", safe: true },
  ];
}

export function getMonitoringInfo(): {
  memory: { heapMB: number; rssMB: number };
  uptime: number;
  cpuUsage: { user: number; system: number };
  activeSessions: number;
} {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    memory: {
      heapMB: Math.round(mem.heapUsed / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
    uptime: Math.floor(process.uptime()),
    cpuUsage: { user: cpu.user, system: cpu.system },
    activeSessions: 0,
  };
}

export function getSystemInformation(): Record<string, string> {
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
    loadAverage: os.loadavg().map((l: number) => l.toFixed(2)).join(", "),
  };
}
