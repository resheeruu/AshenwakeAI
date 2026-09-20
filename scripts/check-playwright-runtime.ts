#!/usr/bin/env node
/* ================================================================
 * PLAYWRIGHT RUNTIME DIAGNOSTIC
 *
 * Prints Playwright environment information without downloading
 * anything. Exits nonzero only when --strict is passed and a
 * critical component is missing.
 * ================================================================ */

import fs from "node:fs";

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
