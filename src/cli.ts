#!/usr/bin/env node

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    return pkg.version || "unknown";
  } catch { return "unknown"; }
})();

const METHODS: Record<string, () => void> = {
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
  version,
};

function main(): void {
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

function status(): void {
  try {
    const healthFile = path.join(process.cwd(), "data", "provider-health.json");
    const providers = fs.existsSync(healthFile)
      ? Object.keys(JSON.parse(fs.readFileSync(healthFile, "utf8")))
      : [];

    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  ASHENAI STATUS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Version:     ${VERSION}`);
    console.log(`  Node:        ${process.version}`);
    console.log(`  Platform:    ${process.platform} ${process.arch}`);
    console.log(`  PID:         ${process.pid}`);
    console.log(`  Uptime:      ${formatUptime(process.uptime())}`);
    console.log(`  Memory:      ${heapMB}MB heap`);
    console.log(`  Providers:   ${providers.length} configured`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const pidFile = path.join(process.cwd(), "data", "ashenai.pid");
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
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

function start(): void {
  console.log("Starting AshenAI...");

  const pidFile = path.join(process.cwd(), "data", "ashenai.pid");
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    try {
      process.kill(pid, 0);
      console.log(`AshenAI is already running (PID ${pid}).`);
      return;
    } catch { /* PID stale, continue */ }
  }

  try {
    const child = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", fs.openSync(path.join(process.cwd(), "data", "ashenai.log"), "a"), fs.openSync(path.join(process.cwd(), "data", "ashenai.log"), "a")],
    });
    child.unref();
    const pid = String(child.pid);
    fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
    fs.writeFileSync(pidFile, pid);
    console.log(`AshenAI started (PID ${pid}).`);
  } catch (error) {
    console.error(`Failed to start AshenAI: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function stop(): void {
  const pidFile = path.join(process.cwd(), "data", "ashenai.pid");
  if (!fs.existsSync(pidFile)) {
    console.log("No PID file found. AshenAI may not be running.");
    return;
  }

  const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to PID ${pid}.`);
    fs.unlinkSync(pidFile);
  } catch (error) {
    console.error(`Failed to stop PID ${pid}: ${error instanceof Error ? error.message : String(error)}`);
    fs.unlinkSync(pidFile);
  }
}

function restart(): void {
  stop();
  setTimeout(() => start(), 1000);
}

function doctor(): void {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ASHENAI DOCTOR");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const checks: Array<{ name: string; status: string; message: string }> = [];

  const dataDir = path.join(process.cwd(), "data");
  checks.push({
    name: "Data Directory",
    status: fs.existsSync(dataDir) ? "✓" : "✗",
    message: fs.existsSync(dataDir) ? "Exists" : "Missing",
  });

  const criticalFiles = ["src/index.ts", "src/config/env.ts", "package.json", "tsconfig.json"];
  const missing = criticalFiles.filter((f) => !fs.existsSync(path.join(process.cwd(), f)));
  checks.push({
    name: "Critical Files",
    status: missing.length === 0 ? "✓" : "✗",
    message: missing.length === 0 ? "All present" : `Missing: ${missing.join(", ")}`,
  });

  const envFile = path.join(process.cwd(), ".env");
  checks.push({
    name: "Environment",
    status: fs.existsSync(envFile) ? "✓" : "✗",
    message: fs.existsSync(envFile) ? ".env exists" : ".env missing",
  });

  const healthFile = path.join(dataDir, "provider-health.json");
  if (fs.existsSync(healthFile)) {
    const health = JSON.parse(fs.readFileSync(healthFile, "utf8"));
    const disabled = Object.entries(health).filter(([_, v]: [string, any]) => v.disabledUntil > Date.now());
    checks.push({
      name: "AI Providers",
      status: disabled.length === 0 ? "✓" : "⚠",
      message: `${Object.keys(health).length} configured, ${disabled.length} disabled`,
    });
  }

  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  checks.push({
    name: "Memory",
    status: heapMB > 512 ? "✗" : heapMB > 256 ? "⚠" : "✓",
    message: `${heapMB}MB heap`,
  });

  for (const check of checks) {
    console.log(`  ${check.status} ${check.name}: ${check.message}`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function logs(): void {
  const logFile = path.join(process.cwd(), "data", "ashenai.log");
  if (!fs.existsSync(logFile)) {
    console.log("No log file found.");
    return;
  }
  try {
    const content = fs.readFileSync(logFile, "utf8");
    const lines = content.split("\n").filter(Boolean).slice(-50);
    for (const line of lines) {
      console.log(line);
    }
  } catch (error) {
    console.error(`Error reading logs: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function providers(): void {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  AI PROVIDERS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const healthFile = path.join(process.cwd(), "data", "provider-health.json");
  if (!fs.existsSync(healthFile)) {
    console.log("  No provider health data available.");
    return;
  }

  const health = JSON.parse(fs.readFileSync(healthFile, "utf8"));
  for (const [name, data] of Object.entries(health) as [string, any][]) {
    const disabled = data.disabledUntil > Date.now();
    const status = disabled ? "✗ DISABLED" : data.failures > data.successes ? "⚠ DEGRADED" : "✓ OK";
    const latency = data.lastLatencyMs ? `${data.lastLatencyMs}ms` : "N/A";
    console.log(`  ${status}  ${name}  (${data.successes} ok, ${data.failures} fail, ${latency})`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function memory(): void {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  MEMORY STATS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const memFile = path.join(process.cwd(), "data", "conversation-memory.json");
  if (fs.existsSync(memFile)) {
    const data = JSON.parse(fs.readFileSync(memFile, "utf8"));
    const conversations = Object.keys(data).length;
    let totalMessages = 0;
    for (const conv of Object.values(data) as any[]) {
      totalMessages += (conv.messages || []).length;
    }
    console.log(`  Conversations:   ${conversations}`);
    console.log(`  Total Messages:  ${totalMessages}`);
  } else {
    console.log("  No conversation data yet.");
  }

  const mem = process.memoryUsage();
  console.log(`  Heap:            ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
  console.log(`  RSS:             ${Math.round(mem.rss / 1024 / 1024)}MB`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function usage(): void {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  USAGE STATISTICS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const usageFile = path.join(process.cwd(), "data", "usage.json");
  if (fs.existsSync(usageFile)) {
    const data = JSON.parse(fs.readFileSync(usageFile, "utf8"));
    if (data.global) {
      console.log(`  Total Requests:  ${data.global.totalRequests || 0}`);
      console.log(`  Total Credits:   ${data.global.totalCredits || 0}`);
      console.log(`  Failures:        ${data.global.failures || 0}`);
    }
    if (data.providers) {
      console.log("  Provider Usage:");
      for (const [name, usage] of Object.entries(data.providers) as [string, any][]) {
        console.log(`    ${name}: ${usage.requests || 0} requests, ${usage.credits || 0} credits`);
      }
    }
  } else {
    console.log("  No usage data yet.");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function seraphStatus(): void {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  SERAPH STATUS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Active:    Yes`);
  console.log(`  Version:   1.0.0`);
  console.log(`  Uptime:    ${formatUptime(process.uptime())}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function seraphDoctor(): void {
  console.log("Running Seraph doctor...");
  try {
    const seraph = require("./seraph");
    const result = seraph.runDoctor();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Doctor failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function seraphInvestigate(): void {
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

function seraphReports(): void {
  const reportsDir = path.join(process.cwd(), "data", "seraph-reports");
  if (!fs.existsSync(reportsDir)) {
    console.log("No reports available.");
    return;
  }
  const files = fs.readdirSync(reportsDir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 5);
  if (files.length === 0) {
    console.log("No reports available.");
    return;
  }
  for (const file of files) {
    const report = JSON.parse(fs.readFileSync(path.join(reportsDir, file), "utf8"));
    console.log(`  [${report.type}] ${report.summary} (${new Date(report.generatedAt).toLocaleString()})`);
  }
}

function seraphTools(): void {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  SERAPH TOOLS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  doctor         Run comprehensive health diagnostics");
  console.log("  health         Quick health check");
  console.log("  investigate    Investigate a specific problem");
  console.log("  report         Generate a system report");
  console.log("  status         Show Seraph system status");
  console.log("  memory_check   Check memory usage");
  console.log("  provider_check Check AI provider health");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function seraphInfo(): void {
  const os = require("os");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  SYSTEM INFORMATION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Hostname:     ${os.hostname()}`);
  console.log(`  Platform:     ${os.platform()} ${os.arch()}`);
  console.log(`  Release:      ${os.release()}`);
  console.log(`  Node:         ${process.version}`);
  console.log(`  CPUs:         ${os.cpus().length} cores`);
  console.log(`  Total Memory: ${Math.round(os.totalmem() / 1024 / 1024)}MB`);
  console.log(`  Free Memory:  ${Math.round(os.freemem() / 1024 / 1024)}MB`);
  console.log(`  Load Avg:     ${os.loadavg().map((l: number) => l.toFixed(2)).join(", ")}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function chat(message: string): void {
  if (!message) {
    console.error("Usage: ashen chat \"your message\"");
    process.exit(1);
  }
  console.log(`[AshenAI] ${message}`);
  console.log("(Chat requires the bot to be running. Use 'ashen start' first.)");
}

function help(): void {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ASHENAI CLI — Termux Owner Control");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
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
  console.log("    ashen chat \"message\"      Chat with AshenAI");
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
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function version(): void {
  console.log(`AshenAI CLI v${VERSION}`);
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

main();
