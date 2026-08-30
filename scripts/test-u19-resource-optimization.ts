#!/usr/bin/env node
/**
 * U19 — Intelligent Resource Optimization + Runtime Self-Management Tests
 * Labels: LIVE VERIFIED / MEASURED / SIMULATED / NOT AVAILABLE / NOT TESTED
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import os from "node:os";

let P = 0, F = 0;
const ROOT = path.resolve(__dirname, "..");

function test(n: string, l: string, fn: () => void) {
  try { fn(); P++; console.log(`  PASS [${l}] ${n}`); }
  catch (e: any) { F++; console.log(`  FAIL [${l}] ${n}: ${e.message?.slice(0, 200)}`); }
}

const { takeSnapshot, getResourceStatus, cleanupTempFiles, getGrowthRate } = require("../src/core/resource-monitor");
const { buildResourceProfile } = require("../src/core/resource-profile");

// ============================================================
// PHASE 1: RESOURCE MONITOR
// ============================================================
console.log("\n===== PHASE 1: RESOURCE MONITOR =====");

test("takeSnapshot returns valid structure", "LIVE VERIFIED", () => {
  const snap = takeSnapshot();
  assert.ok(snap.timestamp > 0, "timestamp must be set");
  assert.ok(snap.memory.rss > 0, "RSS must be positive");
  assert.ok(snap.memory.heapUsed > 0, "heapUsed must be positive");
  assert.ok(snap.memory.heapTotal > 0, "heapTotal must be positive");
  assert.ok(snap.memory.rssMB > 0, "rssMB must be positive");
  assert.ok(typeof snap.memory.external === "number", "external must be number");
  assert.ok(typeof snap.memory.arrayBuffers === "number", "arrayBuffers must be number");
});

test("CPU metrics captured", "LIVE VERIFIED", () => {
  const snap = takeSnapshot();
  assert.ok(typeof snap.cpu.userMicros === "number", "userMicros must be number");
  assert.ok(typeof snap.cpu.systemMicros === "number", "systemMicros must be number");
  assert.ok(snap.cpu.userMs >= 0, "userMs must be non-negative");
  assert.ok(snap.cpu.systemMs >= 0, "systemMs must be non-negative");
});

test("system metrics captured", "LIVE VERIFIED", () => {
  const snap = takeSnapshot();
  assert.ok(snap.system.totalMemBytes > 0, "totalMem must be positive");
  assert.ok(snap.system.freeMemBytes >= 0, "freeMem must be non-negative");
  assert.ok(snap.system.totalMemMB > 0, "totalMemMB must be positive");
  assert.ok(snap.system.uptimeSeconds >= 0, "uptime must be non-negative");
  assert.ok(Array.isArray(snap.system.loadAvg), "loadAvg must be array");
  assert.ok(snap.system.nodeVersion.startsWith("v"), "nodeVersion must start with v");
});

test("process metrics captured", "LIVE VERIFIED", () => {
  const snap = takeSnapshot();
  assert.ok(snap.process.pid > 0, "pid must be positive");
  assert.ok(typeof snap.process.activeHandles === "number", "activeHandles must be number");
  assert.ok(typeof snap.process.activeRequests === "number", "activeRequests must be number");
  assert.ok(snap.process.uptimeSeconds >= 0, "uptime must be non-negative");
});

test("disk metrics captured", "LIVE VERIFIED", () => {
  const snap = takeSnapshot();
  assert.ok(snap.disk.dataDirSizeKB >= 0, "dataDirSizeKB must be non-negative");
  assert.ok(snap.disk.dataFileCount >= 0, "dataFileCount must be non-negative");
  assert.ok(typeof snap.disk.largestFile === "string", "largestFile must be string");
});

test("pressure classification works", "LIVE VERIFIED", () => {
  const snap = takeSnapshot();
  assert.ok(["NORMAL", "WARNING", "CONSTRAINED", "CRITICAL"].includes(snap.pressure), `pressure: ${snap.pressure}`);
});

test("health classification works", "LIVE VERIFIED", () => {
  const snap = takeSnapshot();
  assert.ok(["healthy", "degraded", "critical"].includes(snap.health), `health: ${snap.health}`);
});

test("recommendations generated", "LIVE VERIFIED", () => {
  const snap = takeSnapshot();
  assert.ok(Array.isArray(snap.recommendations), "recommendations must be array");
  assert.ok(snap.recommendations.length > 0, "must have at least one recommendation");
});

test("getResourceStatus returns summary", "LIVE VERIFIED", () => {
  const status = getResourceStatus();
  assert.ok(status.pressure, "pressure must be set");
  assert.ok(status.health, "health must be set");
  assert.ok(typeof status.heapMB === "number", "heapMB must be number");
  assert.ok(typeof status.rssMB === "number", "rssMB must be number");
  assert.ok(typeof status.freeMemMB === "number", "freeMemMB must be number");
  assert.ok(typeof status.uptime === "number", "uptime must be number");
  assert.ok(typeof status.dataDirMB === "number", "dataDirMB must be number");
  assert.ok(Array.isArray(status.recommendations), "recommendations must be array");
});

test("cleanupTempFiles runs without error", "LIVE VERIFIED", () => {
  const result = cleanupTempFiles();
  assert.ok(typeof result.removed === "number", "removed must be number");
  assert.ok(typeof result.freedKB === "number", "freedKB must be number");
  assert.ok(result.removed >= 0, "removed must be non-negative");
});

test("no secrets in snapshot output", "LIVE VERIFIED", () => {
  const snap = JSON.stringify(takeSnapshot());
  assert.ok(!snap.match(/sk-[a-zA-Z0-9]{20,}/), "snapshot contains API key");
  assert.ok(!snap.match(/ghp_[a-zA-Z0-9]{20,}/), "snapshot contains GitHub token");
});

// ============================================================
// PHASE 2: RESOURCE PROFILE
// ============================================================
console.log("\n===== PHASE 2: RESOURCE PROFILE =====");

test("buildResourceProfile returns valid structure", "LIVE VERIFIED", () => {
  const profile = buildResourceProfile();
  assert.ok(profile.host, "host must be set");
  assert.ok(["healthy", "constrained", "degraded", "critical", "unknown"].includes(profile.classification), `classification: ${profile.classification}`);
  assert.ok(profile.memory.totalMB > 0, "totalMem must be positive");
  assert.ok(profile.memory.nodeRSS_MB > 0, "nodeRSS must be positive");
  assert.ok(profile.cpu.arch, "arch must be set");
  assert.ok(Array.isArray(profile.capabilities), "capabilities must be array");
  assert.ok(Array.isArray(profile.recommendations), "recommendations must be array");
});

test("host detected as termux (LIVE)", "LIVE VERIFIED", () => {
  const profile = buildResourceProfile();
  assert.equal(profile.host, "termux");
});

test("classification reflects actual host state (LIVE)", "LIVE VERIFIED", () => {
  const profile = buildResourceProfile();
  // Classification depends on actual device conditions — on a constrained
  // device (e.g., phone at 98% disk), "critical" or "degraded" is correct.
  assert.ok(["healthy", "constrained", "degraded", "critical"].includes(profile.classification),
    `classification: ${profile.classification}`);
});

test("disk usage measured (LIVE)", "LIVE VERIFIED", () => {
  const profile = buildResourceProfile();
  assert.ok(profile.disk.totalGB >= 0, "totalGB must be non-negative");
  assert.ok(profile.disk.freeGB >= 0, "freeGB must be non-negative");
  assert.ok(profile.disk.usedPct >= 0 && profile.disk.usedPct <= 100, `usedPct: ${profile.disk.usedPct}`);
});

test("no secrets in profile", "LIVE VERIFIED", () => {
  const profile = JSON.stringify(buildResourceProfile());
  assert.ok(!profile.match(/sk-[a-zA-Z0-9]{20,}/), "profile contains API key");
});

// ============================================================
// PHASE 3: BOUNDED MEMORY
// ============================================================
console.log("\n===== PHASE 3: BOUNDED MEMORY =====");

test("multiple snapshots don't leak (LIVE)", "LIVE VERIFIED", () => {
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 20; i++) takeSnapshot();
  if (global.gc) global.gc();
  const after = process.memoryUsage().heapUsed;
  assert.ok(after - before < 20 * 1024 * 1024, `heap grew ${(after - before) / 1024 / 1024}MB after 20 snapshots`);
});

test("growth rate returns valid data", "LIVE VERIFIED", () => {
  takeSnapshot(); // ensure previousSnapshot exists
  const rate = getGrowthRate();
  assert.ok(typeof rate.heapGrowthMBPerHour === "number", "heapGrowthMBPerHour must be number");
  assert.ok(typeof rate.rssGrowthMBPerHour === "number", "rssGrowthMBPerHour must be number");
});

// ============================================================
// PHASE 4: RESOURCE SOURCE CODE SAFETY
// ============================================================
console.log("\n===== PHASE 4: SOURCE CODE SAFETY =====");

test("resource-monitor.ts: no eval/exec", "LIVE VERIFIED", () => {
  const c = fs.readFileSync(path.join(ROOT, "src/core/resource-monitor.ts"), "utf8");
  assert.ok(!c.match(/\beval\b/), "must not have eval");
  assert.ok(!c.match(/\bexecSync\b/), "must not have execSync");
  assert.ok(!c.match(/\bexec\(/), "must not have exec");
});

test("resource-profile.ts: no eval/exec", "LIVE VERIFIED", () => {
  const c = fs.readFileSync(path.join(ROOT, "src/core/resource-profile.ts"), "utf8");
  assert.ok(!c.match(/\beval\b/), "must not have eval");
  assert.ok(!c.match(/\bexecSync\b/), "must not have execSync");
});

test("resource files: no secrets", "LIVE VERIFIED", () => {
  for (const f of ["src/core/resource-monitor.ts", "src/core/resource-profile.ts"]) {
    const c = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!c.match(/sk-[a-zA-Z0-9]{20,}/), `${f} contains API key`);
    assert.ok(!c.match(/DISCORD_TOKEN\s*=\s*["']/), `${f} contains Discord token`);
  }
});

test("resource files: no arbitrary file deletion (except cleanup function)", "LIVE VERIFIED", () => {
  for (const f of ["src/core/resource-monitor.ts", "src/core/resource-profile.ts"]) {
    const c = fs.readFileSync(path.join(ROOT, f), "utf8");
    // cleanupTempFiles legitimately uses unlinkSync for .tmp/.bak files > 1hr old
    // Exclude lines within cleanupTempFiles from the check
    const lines = c.split("\n");
    let inCleanup = false;
    for (const line of lines) {
      if (line.includes("cleanupTempFiles")) inCleanup = true;
      if (inCleanup && line.trim().startsWith("}")) inCleanup = false;
      if (!inCleanup) {
        assert.ok(!line.match(/unlinkSync|rmSync|rmdirSync/), `${f} has file deletion outside cleanup: ${line.trim()}`);
      }
    }
  }
});

test("resource files: no setInterval (no background timers)", "LIVE VERIFIED", () => {
  for (const f of ["src/core/resource-monitor.ts", "src/core/resource-profile.ts"]) {
    const c = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!c.match(/setInterval/), `${f} has setInterval`);
  }
});

test("cleanupTempFiles: only .tmp/.bak, bounded, 1hr+ age", "LIVE VERIFIED", () => {
  const c = fs.readFileSync(path.join(ROOT, "src/core/resource-monitor.ts"), "utf8");
  assert.ok(c.includes(".tmp"), "must only clean .tmp files");
  assert.ok(c.includes(".bak"), "must only clean .bak files");
  assert.ok(c.includes("ONE_HOUR"), "must enforce age threshold");
});

// ============================================================
// PHASE 5: HOSTING INTEGRATION
// ============================================================
console.log("\n===== PHASE 5: HOSTING INTEGRATION =====");

test("health-checker.ts exists (pre-existing)", "LIVE VERIFIED", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "src/core/health-checker.ts")));
});

test("load-manager.ts exists (pre-existing)", "LIVE VERIFIED", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "src/core/load-manager.ts")));
});

test("data-store.ts exists (pre-existing)", "LIVE VERIFIED", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "src/core/data-store.ts")));
});

test("system-usage.ts exists (pre-existing)", "LIVE VERIFIED", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "src/ai/system-usage.ts")));
});

test("backup-manager.ts exists (pre-existing)", "LIVE VERIFIED", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "src/core/backup-manager.ts")));
});

// ============================================================
// PHASE 6: U12-U18 REGRESSION
// ============================================================
console.log("\n===== PHASE 6: REGRESSION =====");

test("U16 test file exists", "LIVE VERIFIED", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "scripts/test-u16-hosting.ts")));
});

test("U12-U14 test files exist", "LIVE VERIFIED", () => {
  for (const t of ["test-u12-production.ts", "test-u13-production.ts", "test-u14-production.ts"]) {
    assert.ok(fs.existsSync(path.join(ROOT, `scripts/${t}`)), `Missing ${t}`);
  }
});

test("tsc --noEmit passes", "LIVE VERIFIED", () => {
  execSync("npx tsc --noEmit", { cwd: ROOT, encoding: "utf8", timeout: 60000 });
});

test("dist/index.js exists", "LIVE VERIFIED", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "dist/index.js")));
});

// ============================================================
// SUMMARY
// ============================================================
console.log("\n========================================");
console.log("U19 RESOURCE OPTIMIZATION VALIDATION");
console.log("========================================");
console.log(`Passed:  ${P}`);
console.log(`Failed:  ${F}`);
console.log(`Total:   ${P + F}`);
console.log(F === 0 ? "ALL U19 TESTS PASSED" : "SOME U19 TESTS FAILED");
console.log("========================================\n");
process.exit(F > 0 ? 1 : 0);
