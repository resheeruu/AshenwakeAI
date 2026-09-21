#!/usr/bin/env node
/* ================================================================
 * PLAYWRIGHT RUNTIME DIAGNOSTIC
 *
 * Prints Playwright environment information without downloading
 * anything. Exits nonzero only when --strict is passed and a
 * critical component is missing.
 *
 * STORAGE SEMANTICS: `df`/statfs values below are
 * container-visible filesystem capacity, NOT the hosting
 * account/server quota. A large free-space value MUST NEVER be
 * presented as proof of sufficient hosting quota. When the
 * platform does not expose the real quota this diagnostic states:
 * "Actual Wispbyte storage quota could not be verified from inside
 *  the container."
 * Probes the real download pipeline paths (browsers cache, npm
 * cache, TMPDIR, /tmp, HOME, cwd) plus inode usage, because ENOSPC
 * is decided by the most constrained filesystem in that path.
 * Never deletes files.
 * ================================================================ */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import child_process from "node:child_process";

interface DiagnosticResult {
  label: string;
  value: string;
  ok: boolean;
}

const results: DiagnosticResult[] = [];
let hasStrict = process.argv.includes("--strict");

function add(label: string, value: string, ok: boolean) {
  results.push({ label, value, ok });
}

// ---------- Playwright version ----------
try {
  const pkg = JSON.parse(
    fs.readFileSync("node_modules/playwright/package.json", "utf-8")
  );
  add("Playwright version", pkg.version, true);
} catch {
  add("Playwright version", "not installed", false);
}

// ---------- Environment ----------
add(
  "PLAYWRIGHT_BROWSERS_PATH",
  process.env.PLAYWRIGHT_BROWSERS_PATH || "(not set)",
  true
);
add(
  "PLAYWRIGHT_SKIP_BROWSER_GC",
  process.env.PLAYWRIGHT_SKIP_BROWSER_GC || "(not set)",
  true
);
add(
  "ASHENAI_CHROMIUM_EXECUTABLE",
  process.env.ASHENAI_CHROMIUM_EXECUTABLE || "(not set)",
  true
);
add(
  "ASHENAI_PLAYWRIGHT_BOOTSTRAP",
  process.env.ASHENAI_PLAYWRIGHT_BOOTSTRAP || "0",
  true
);

// ---------- Chromium executable ----------
try {
  const { chromium } = require("playwright");
  const execPath: string = chromium.executablePath();
  add("chromium.executablePath()", execPath, true);

  try {
    fs.accessSync(execPath, fs.constants.R_OK);
    add("Executable exists", "yes", true);
  } catch {
    add("Executable exists", "no", false);
  }

  try {
    fs.accessSync(execPath, fs.constants.X_OK);
    add("Executable is executable", "yes", true);
  } catch {
    add("Executable is executable", "no", false);
  }

  // Try to get the browser version safely
  try {
    const browser = chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const version = browser.version();
    add("Browser version", version, true);
    browser.close();
  } catch {
    add("Browser version", "(could not launch)", false);
  }
} catch (err) {
  add("chromium.executablePath()", "Playwright not available", false);
  add("Executable exists", "n/a", false);
  add("Executable is executable", "n/a", false);
  add("Browser version", "n/a", false);
}

// ---------- Bootstrap state ----------
const statePath = `${process.env.HOME || "~"}/.ashenai/bootstrap-state`;
try {
  const state = fs.readFileSync(statePath, "utf-8").trim();
  add("Bootstrap state", state, state === "ready");
} catch {
  add("Bootstrap state", "(no state file)", true);
}

// ---------- Storage: per-path filesystems in the download pipeline ----------
// ENOSPC during the ~184 MB Chromium download can be caused by:
// Wispbyte storage quota, container filesystem quota, overlay
// writable-layer limit, inode exhaustion, /tmp (tmpfs) limit,
// Playwright cache dir limit, npm cache dir limit, or
// per-process/container limits. df cannot show the hosting quota,
// so report each pipeline path separately and disclaim the quota.
function npmCacheDir(): string {
  try {
    const out = child_process
      .execSync("npm config get cache", { encoding: "utf-8", timeout: 8000 })
      .trim();
    return out || "(unknown)";
  } catch {
    return "(unknown)";
  }
}

function dfFor(target: string): string {
  let probe = target;
  try {
    if (!fs.existsSync(probe)) probe = path.dirname(probe);
    const df = child_process
      .execSync(`df -P "${probe}"`, { encoding: "utf-8", timeout: 8000 })
      .trim()
      .split("\n");
    const cols = (df[1] || "").split(/\s+/);
    let ino = "(unknown)";
    try {
      const il = child_process
        .execSync(`df -i -P "${probe}"`, { encoding: "utf-8", timeout: 8000 })
        .trim()
        .split("\n");
      const ic = (il[1] || "").split(/\s+/);
      // df -i -P cols: Filesystem Inodes IUsed IFree IUse% Mounted_on
      if (ic.length >= 5) ino = `${ic[3]} free (${ic[4]} used)`;
    } catch { /* inode info optional */ }
    // df -P cols are 512-byte blocks: Filesystem 512-blocks Used Avail Cap Mount
    if (cols.length >= 5) {
      const totalMB = Math.round((Number(cols[1]) * 512) / 1048576);
      const freeMB = Math.round((Number(cols[3]) * 512) / 1048576);
      return `${freeMB}MB free / ${totalMB}MB [${cols[0]} on ${cols[5] || "?"}] inodes: ${ino} (container-visible, NOT quota)`;
    }
    return "(df parse failed)";
  } catch {
    return "(unavailable)";
  }
}

{
  const browsersPath =
    process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), ".cache/ms-playwright");
  const cacheDir = npmCacheDir();
  const tmpDir = process.env.TMPDIR || os.tmpdir();
  const storagePaths: Array<[string, string]> = [
    ["storage: APP_DIR (cwd)", process.cwd()],
    ["storage: browsers cache", browsersPath],
    ["storage: npm cache", cacheDir],
    ["storage: TMPDIR", tmpDir],
    ["storage: /tmp", "/tmp"],
    ["storage: HOME", os.homedir()],
  ];
  for (const [label, p] of storagePaths) {
    add(label, `${p} :: ${dfFor(p)}`, true);
  }
  add(
    "storage: hosting quota",
    "Actual Wispbyte storage quota could not be verified from inside the container.",
    true
  );
}

// ---------- Output ----------
console.log("\n╔══════════════════════════════════════════════╗");
console.log("║   PLAYWRIGHT RUNTIME DIAGNOSTIC              ║");
console.log("╚══════════════════════════════════════════════╝\n");

for (const r of results) {
  const icon = r.ok ? "✅" : "⚠️";
  console.log(`  ${icon} ${r.label.padEnd(35)} ${r.value}`);
}

const warnings = results.filter((r) => !r.ok);
console.log(`\n${"─".repeat(50)}`);
console.log(`  Results: ${results.length - warnings.length} OK, ${warnings.length} warnings`);

if (hasStrict && warnings.length > 0) {
  console.log("\n  ❌ --strict: exiting with failure due to warnings above.");
  process.exit(1);
}

if (warnings.length > 0) {
  console.log("  (non-strict mode: warnings do not cause exit failure)");
}

console.log("");
