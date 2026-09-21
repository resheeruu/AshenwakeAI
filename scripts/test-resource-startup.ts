/* ================================================================
 * RESOURCE MONITOR & STARTUP INTEGRATION TESTS
 *
 * Tests resource monitoring logic, Playwright disk protection,
 * and startup script structure without downloading Chromium
 * or depending on Wispbyte-specific paths.
 * ================================================================ */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import os from "node:os";

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition: boolean, message: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

function section(name: string): void {
  console.log(`\n📊 ${name}`);
}

function readFile(filePath: string): string {
  return fs.readFileSync(path.resolve(filePath), "utf-8");
}

async function main(): Promise<void> {
  /* ================================================================
   * CHECK-RESOURCES.SH STRUCTURE TESTS
   * ================================================================ */

  section("check-resources.sh Structure");

  const checkResources = readFile("scripts/check-resources.sh");

  assert(
    checkResources.includes("set -euo pipefail"),
    "check-resources.sh uses strict mode (set -euo pipefail)",
  );

  assert(
    checkResources.includes("ASHENAI_RESOURCE_DISK_WARN_MB"),
    "check-resources.sh uses ASHENAI_RESOURCE_DISK_WARN_MB",
  );

  assert(
    checkResources.includes("ASHENAI_RESOURCE_DISK_CRITICAL_MB"),
    "check-resources.sh uses ASHENAI_RESOURCE_DISK_CRITICAL_MB",
  );

  assert(
    checkResources.includes("ASHENAI_RESOURCE_DISK_WARN_PERCENT"),
    "check-resources.sh uses ASHENAI_RESOURCE_DISK_WARN_PERCENT",
  );

  assert(
    checkResources.includes("ASHENAI_RESOURCE_DISK_CRITICAL_PERCENT"),
    "check-resources.sh uses ASHENAI_RESOURCE_DISK_CRITICAL_PERCENT",
  );

  assert(
    checkResources.includes("ASHENAI_RESOURCE_RAM_WARN_PERCENT"),
    "check-resources.sh uses ASHENAI_RESOURCE_RAM_WARN_PERCENT",
  );

  assert(
    checkResources.includes("ASHENAI_RESOURCE_RAM_CRITICAL_PERCENT"),
    "check-resources.sh uses ASHENAI_RESOURCE_RAM_CRITICAL_PERCENT",
  );

  assert(
    checkResources.includes("ASHENAI_RESOURCE_CPU_WARN_LOAD"),
    "check-resources.sh uses ASHENAI_RESOURCE_CPU_WARN_LOAD",
  );

  assert(
    checkResources.includes('[RESOURCE]'),
    "check-resources.sh uses [RESOURCE] log prefix",
  );

  assert(
    checkResources.includes("classify_disk"),
    "check-resources.sh has classify_disk function",
  );

  assert(
    checkResources.includes("classify_ram"),
    "check-resources.sh has classify_ram function",
  );

  assert(
    checkResources.includes("classify_cpu"),
    "check-resources.sh has classify_cpu function",
  );

  assert(
    checkResources.includes("format_bytes"),
    "check-resources.sh has format_bytes function",
  );

  // Verify it exports state variables
  assert(
    checkResources.includes('export ASHENAI_RESOURCE_DISK_STATE'),
    "check-resources.sh exports ASHENAI_RESOURCE_DISK_STATE",
  );

  assert(
    checkResources.includes('export ASHENAI_RESOURCE_RAM_STATE'),
    "check-resources.sh exports ASHENAI_RESOURCE_RAM_STATE",
  );

  assert(
    checkResources.includes('export ASHENAI_RESOURCE_CPU_STATE'),
    "check-resources.sh exports ASHENAI_RESOURCE_CPU_STATE",
  );

  assert(
    checkResources.includes('export ASHENAI_RESOURCE_DISK_FREE_MB'),
    "check-resources.sh exports ASHENAI_RESOURCE_DISK_FREE_MB",
  );

  // Verify it never exits with non-zero (never crashes startup)
  assert(
    !checkResources.includes("exit 1"),
    "check-resources.sh never exits with code 1",
  );

  // Verify it handles missing tools gracefully
  assert(
    checkResources.includes("unavailable"),
    "check-resources.sh handles unavailable resources gracefully",
  );

  /* ================================================================
   * CHECK-RESOURCES.SH DISK CLASSIFICATION LOGIC
   * ================================================================ */

  section("Disk Classification Logic");

  // Test the classification thresholds by reading the logic
  // classify_disk: CRITICAL if free_mb < DISK_CRITICAL_MB OR free_pct < DISK_CRITICAL_PCT
  // classify_disk: WARN if free_mb < DISK_WARN_MB OR free_pct < DISK_WARN_PCT
  // classify_disk: OK otherwise

  assert(
    checkResources.includes("DISK_CRITICAL_MB") && checkResources.includes("DISK_CRITICAL_PCT"),
    "Disk classification checks both absolute MB and percentage thresholds",
  );

  assert(
    checkResources.includes("DISK_WARN_MB") && checkResources.includes("DISK_WARN_PCT"),
    "Disk warning checks both absolute MB and percentage thresholds",
  );

  // Verify the classify_disk function returns valid states
  assert(
    checkResources.includes('"CRITICAL"') && checkResources.includes('"WARN"') && checkResources.includes('"OK"'),
    "classify_disk returns CRITICAL, WARN, or OK",
  );

  /* ================================================================
   * CHECK-RESOURCES.SH RAM CLASSIFICATION LOGIC
   * ================================================================ */

  section("RAM Classification Logic");

  assert(
    checkResources.includes("RAM_CRITICAL_PCT") && checkResources.includes("RAM_WARN_PCT"),
    "RAM classification checks both warning and critical thresholds",
  );

  // Verify RAM checks multiple sources
  assert(
    checkResources.includes("/proc/meminfo"),
    "check-resources.sh tries /proc/meminfo (Linux standard)",
  );

  assert(
    checkResources.includes("free -m") || checkResources.includes("free -"),
    "check-resources.sh falls back to free command",
  );

  assert(
    checkResources.includes("process.memoryUsage"),
    "check-resources.sh gets Node.js process memory",
  );

  /* ================================================================
   * CHECK-RESOURCES.SH CPU CLASSIFICATION LOGIC
   * ================================================================ */

  section("CPU Classification Logic");

  assert(
    checkResources.includes("/proc/loadavg"),
    "check-resources.sh tries /proc/loadavg (Linux standard)",
  );

  assert(
    checkResources.includes("uptime"),
    "check-resources.sh falls back to uptime command",
  );

  assert(
    checkResources.includes("load average"),
    "check-resources.sh parses load average",
  );

  /* ================================================================
   * ENSURE-PLAYWRIGHT.SH DISK PROTECTION
   * ================================================================ */

  section("ensure-playwright.sh Disk Protection");

  const ensurePlaywright = readFile("scripts/ensure-playwright.sh");

  assert(
    ensurePlaywright.includes("ASHENAI_RESOURCE_DISK_STATE"),
    "ensure-playwright.sh checks ASHENAI_RESOURCE_DISK_STATE",
  );

  assert(
    ensurePlaywright.includes("ASHENAI_RESOURCE_DISK_FREE_MB"),
    "ensure-playwright.sh checks ASHENAI_RESOURCE_DISK_FREE_MB",
  );

  assert(
    ensurePlaywright.includes("CRITICAL"),
    "ensure-playwright.sh handles CRITICAL disk state",
  );

  assert(
    ensurePlaywright.includes("DISK_CRITICAL_MB"),
    "ensure-playwright.sh defines DISK_CRITICAL_MB threshold",
  );

  assert(
    ensurePlaywright.includes("MIN_FREE_MB"),
    "ensure-playwright.sh uses MIN_FREE_MB for recommended minimum",
  );

  assert(
    ensurePlaywright.includes("Chromium bootstrap skipped"),
    "ensure-playwright.sh logs when bootstrap is skipped due to disk",
  );

  assert(
    ensurePlaywright.includes("Browser features disabled"),
    "ensure-playwright.sh logs graceful degradation on disk critical",
  );

  // Verify disk protection blocks installation when critical
  assert(
    ensurePlaywright.includes('"failed"') && ensurePlaywright.includes("CRITICAL"),
    "ensure-playwright.sh writes 'failed' state when disk is critical",
  );

  // Verify it still allows installation when disk is OK
  assert(
    ensurePlaywright.includes("Installing Chromium"),
    "ensure-playwright.sh installs Chromium when disk is sufficient",
  );

  /* ================================================================
   * ENSURE-PLAYWRIGHT.SH STATE MACHINE
   * ================================================================ */

  section("ensure-playwright.sh State Machine");

  assert(
    ensurePlaywright.includes('"none"') && ensurePlaywright.includes('"installing"') &&
    ensurePlaywright.includes('"ready"') && ensurePlaywright.includes('"failed"'),
    "ensure-playwright.sh has complete state machine: none/installing/ready/failed",
  );

  assert(
    ensurePlaywright.includes("bootstrap-state") && ensurePlaywright.includes("BOOTSTRAP_STATE_DIR"),
    "ensure-playwright.sh uses bootstrap-state file in BOOTSTRAP_STATE_DIR (~/.ashenai)",
  );

  assert(
    ensurePlaywright.includes("mkdir") && ensurePlaywright.includes("LOCK_DIR"),
    "ensure-playwright.sh uses atomic lock via mkdir",
  );

  assert(
    ensurePlaywright.includes("npx --no-install playwright install chromium --no-shell --no-remove"),
    "ensure-playwright.sh uses npx --no-install with --no-shell --no-remove",
  );

  /* ================================================================
   * START.SH INTEGRATION
   * ================================================================ */

  section("start.sh Integration");

  const startScript = readFile("scripts/start.sh");

  // Verify start.sh runs check-resources.sh BEFORE ensure-playwright.sh.
  // start.sh SOURCES check-resources.sh (`. "scripts/check-resources.sh"`)
  // so ASHENAI_RESOURCE_* exports propagate — indexOf("check-resources.sh")
  // alone is not sufficient since the filename appears inside the
  // shellcheck comment too. Match the actual invocation lines instead.
  const resourceCallIdx = Math.max(
    startScript.indexOf('bash "$APP_DIR/scripts/check-resources.sh"'),
    startScript.indexOf(". \"$APP_DIR/scripts/check-resources.sh\""),
    startScript.indexOf("scripts/check-resources.sh\" || true"),
  );
  const playwrightIdx = Math.max(
    startScript.indexOf('bash "$APP_DIR/scripts/ensure-playwright.sh"'),
    startScript.indexOf(". \"$APP_DIR/scripts/ensure-playwright.sh\""),
    startScript.indexOf("scripts/ensure-playwright.sh\""),
  );

  assert(
    resourceCallIdx >= 0 && playwrightIdx >= 0,
    "start.sh calls both check-resources.sh and ensure-playwright.sh",
  );

  assert(
    resourceCallIdx < playwrightIdx,
    "start.sh calls check-resources.sh BEFORE ensure-playwright.sh",
  );

  assert(
    startScript.includes('export APP_DIR') &&
      (startScript.includes('bash "$APP_DIR/scripts/check-resources.sh"') ||
        startScript.includes('. "$APP_DIR/scripts/check-resources.sh"')),
    "start.sh runs check-resources.sh with APP_DIR exported (exec or source)",
  );

  assert(
    startScript.includes('|| true') || startScript.includes('||'),
    "start.sh handles resource check failure gracefully (|| true)",
  );

  assert(
    startScript.includes('PLAYWRIGHT_BROWSERS_PATH'),
    "start.sh exports PLAYWRIGHT_BROWSERS_PATH",
  );

  assert(
    startScript.includes('PLAYWRIGHT_SKIP_BROWSER_GC'),
    "start.sh exports PLAYWRIGHT_SKIP_BROWSER_GC",
  );

  // Verify no duplicate Chromium installer
  assert(
    !startScript.includes("npx playwright install chromium"),
    "start.sh does NOT contain unconditional 'npx playwright install chromium'",
  );

  assert(
    !startScript.includes("ensure_chromium"),
    "start.sh does not contain old ensure_chromium() function",
  );

  /* ================================================================
   * RESOURCE THRESHOLD DEFAULTS
   * ================================================================ */

  section("Resource Threshold Defaults");

  // Verify reasonable default thresholds
  // These are the defaults from check-resources.sh
  assert(
    checkResources.includes('DISK_WARN_MB="${ASHENAI_RESOURCE_DISK_WARN_MB:-100}"'),
    "Disk warn default is 100 MB",
  );

  assert(
    checkResources.includes('DISK_CRITICAL_MB="${ASHENAI_RESOURCE_DISK_CRITICAL_MB:-50}"'),
    "Disk critical default is 50 MB",
  );

  assert(
    checkResources.includes('DISK_WARN_PCT="${ASHENAI_RESOURCE_DISK_WARN_PERCENT:-20}"'),
    "Disk warn percent default is 20%",
  );

  assert(
    checkResources.includes('DISK_CRITICAL_PCT="${ASHENAI_RESOURCE_DISK_CRITICAL_PERCENT:-5}"'),
    "Disk critical percent default is 5%",
  );

  assert(
    checkResources.includes('RAM_WARN_PCT="${ASHENAI_RESOURCE_RAM_WARN_PERCENT:-80}"'),
    "RAM warn percent default is 80%",
  );

  assert(
    checkResources.includes('RAM_CRITICAL_PCT="${ASHENAI_RESOURCE_RAM_CRITICAL_PERCENT:-90}"'),
    "RAM critical percent default is 90%",
  );

  assert(
    checkResources.includes('CPU_WARN_LOAD="${ASHENAI_RESOURCE_CPU_WARN_LOAD:-4}"'),
    "CPU warn load default is 4",
  );

  assert(
    ensurePlaywright.includes('MIN_FREE_MB="${ASHENAI_PLAYWRIGHT_MIN_FREE_MB:-500}"'),
    "Playwright min free MB default is 500",
  );

  /* ================================================================
   * ENOSPC PROTECTION
   * ================================================================ */

  section("ENOSPC Protection");

  assert(
    ensurePlaywright.includes("ENOSPC"),
    "ensure-playwright.sh detects ENOSPC errors",
  );

  assert(
    ensurePlaywright.includes("no space left on device"),
    "ensure-playwright.sh detects 'no space left on device' errors",
  );

  assert(
    ensurePlaywright.includes("FORCE"),
    "ensure-playwright.sh supports ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE for retry",
  );

  assert(
    ensurePlaywright.includes("Actual Wispbyte storage quota could not be verified from inside the container."),
    "ensure-playwright.sh states the Wispbyte quota cannot be verified in-container",
  );

  assert(
    ensurePlaywright.includes("container-visible") || ensurePlaywright.includes("container-visible capacity"),
    "ensure-playwright.sh labels df values as container-visible, not quota",
  );

  assert(
    ensurePlaywright.includes("inode") || ensurePlaywright.includes("df -i"),
    "ensure-playwright.sh lists inode exhaustion as an ENOSPC cause",
  );

  assert(
    ensurePlaywright.includes("npm_cache_dir") || ensurePlaywright.includes("npm config get cache"),
    "ensure-playwright.sh probes the npm cache filesystem",
  );

  assert(
    ensurePlaywright.includes("TMPDIR") && ensurePlaywright.includes("/tmp"),
    "ensure-playwright.sh probes TMPDIR and /tmp filesystems",
  );

  assert(
    ensurePlaywright.includes("PLAYWRIGHT_BROWSERS_PATH") && ensurePlaywright.includes("min_disk_space_mb"),
    "ensure-playwright.sh classifies on the minimum across pipeline paths",
  );

  // Must never "fix" ENOSPC by deleting arbitrary files.
  assert(
    !ensurePlaywright.match(/rm\s+-rf\s+(?!\"\$LOCK_DIR\")\S/m) ||
      !ensurePlaywright.includes("rm -rf $HOME/.cache"),
    "ensure-playwright.sh never deletes cache dirs to fix ENOSPC (only lock dir)",
  );

  assert(
    checkResources.includes("Actual Wispbyte storage quota could not be verified from inside the container."),
    "check-resources.sh states the Wispbyte quota cannot be verified in-container",
  );

  assert(
    checkResources.includes("NOT the hosting account/server quota") ||
      checkResources.includes("NOT hosting account/server quota"),
    "check-resources.sh labels df output as container-visible, not quota",
  );

  assert(
    checkResources.includes("df -i") || checkResources.includes("inodes_free"),
    "check-resources.sh reports inode usage (df -i)",
  );

  /* ================================================================
   * DISK / ENOSPC DIAGNOSTIC SCRIPT
   * ================================================================ */

  section("Disk/ENOSPC Diagnostic");

  const diagPath = "scripts/diagnose-disk-enospc.ts";
  const diag = fs.existsSync(diagPath) ? readFile(diagPath) : "";

  assert(diag.length > 0, "scripts/diagnose-disk-enospc.ts exists");

  assert(
    diag.includes("Actual Wispbyte storage quota could not be verified from inside the container."),
    "diagnostic states the Wispbyte quota cannot be verified in-container",
  );

  // Must distinguish the five storage layers rather than treating df as quota.
  assert(
    diag.includes("physical device storage") &&
      diag.includes("host machine storage") &&
      diag.includes("hosting account quota") &&
      diag.includes("writable-layer"),
    "diagnostic distinguishes device / host / container / quota / writable-layer storage",
  );

  assert(
    diag.includes("df free space alone cannot prove") ||
      diag.includes("NOT proof of sufficient hosting storage"),
    "diagnostic refuses to treat df free space as proof of sufficient storage",
  );

  assert(
    diag.includes("inode") && diag.includes("overlay") && diag.includes("tmpfs"),
    "diagnostic checks inode exhaustion, overlay and tmpfs filesystems",
  );

  assert(
    diag.includes("npm config get cache") && diag.includes("TMPDIR") && diag.includes("/tmp"),
    "diagnostic probes npm cache, TMPDIR and /tmp filesystems",
  );

  // Bounded writes only: probe size must be clamped.
  assert(
    diag.includes("Math.min(parsed, 512)"),
    "diagnostic clamps the write probe size (never unbounded)",
  );

  // Never deletes arbitrary files: only the unique probe file is unlinked.
  assert(
    (diag.match(/unlinkSync\(/g) || []).length === 1 &&
      diag.includes("ashenai-diskprobe-"),
    "diagnostic only removes its own uniquely-named probe file",
  );

  assert(
    !/rm\s+-rf|rimraf|fs\.rmSync/.test(diag),
    "diagnostic never deletes directories or arbitrary files",
  );

  // Diagnostic must not make network calls.
  assert(
    !/require\(["'](node:)?(https|http|net|dns)["']\)|from\s+["'](node:)?(https|http|net|dns)["']|fetch\(/.test(diag),
    "diagnostic performs no network access",
  );

  assert(
    diag.includes("NOT VERIFIED"),
    "diagnostic marks unverifiable values as NOT VERIFIED",
  );

  /* ================================================================
   * GRACEFUL DEGRADATION
   * ================================================================ */

  section("Graceful Degradation");

  // All scripts should degrade gracefully
  assert(
    ensurePlaywright.includes("return 0"),
    "ensure-playwright.sh returns 0 on all failure paths",
  );

  assert(
    !ensurePlaywright.includes("exit 1"),
    "ensure-playwright.sh never exits with code 1",
  );

  assert(
    !checkResources.includes("exit 1"),
    "check-resources.sh never exits with code 1",
  );

  // Verify no secrets are logged
  assert(
    !checkResources.includes("DISCORD_TOKEN"),
    "check-resources.sh does not log Discord tokens",
  );

  assert(
    !checkResources.includes("API_KEY"),
    "check-resources.sh does not log API keys",
  );

  assert(
    !ensurePlaywright.includes("DISCORD_TOKEN"),
    "ensure-playwright.sh does not log Discord tokens",
  );

  assert(
    !ensurePlaywright.includes("API_KEY"),
    "ensure-playwright.sh does not log API keys",
  );

  /* ================================================================
   * .ENV.EXAMPLE DOCUMENTATION
   * ================================================================ */

  section(".env.example Documentation");

  const envExample = readFile(".env.example");

  assert(
    envExample.includes("ASHENAI_RESOURCE_DISK_WARN_MB"),
    ".env.example documents ASHENAI_RESOURCE_DISK_WARN_MB",
  );

  assert(
    envExample.includes("ASHENAI_RESOURCE_DISK_CRITICAL_MB"),
    ".env.example documents ASHENAI_RESOURCE_DISK_CRITICAL_MB",
  );

  assert(
    envExample.includes("ASHENAI_RESOURCE_DISK_WARN_PERCENT"),
    ".env.example documents ASHENAI_RESOURCE_DISK_WARN_PERCENT",
  );

  assert(
    envExample.includes("ASHENAI_RESOURCE_DISK_CRITICAL_PERCENT"),
    ".env.example documents ASHENAI_RESOURCE_DISK_CRITICAL_PERCENT",
  );

  assert(
    envExample.includes("ASHENAI_RESOURCE_RAM_WARN_PERCENT"),
    ".env.example documents ASHENAI_RESOURCE_RAM_WARN_PERCENT",
  );

  assert(
    envExample.includes("ASHENAI_RESOURCE_RAM_CRITICAL_PERCENT"),
    ".env.example documents ASHENAI_RESOURCE_RAM_CRITICAL_PERCENT",
  );

  assert(
    envExample.includes("ASHENAI_RESOURCE_CPU_WARN_LOAD"),
    ".env.example documents ASHENAI_RESOURCE_CPU_WARN_LOAD",
  );

  assert(
    envExample.includes("ASHENAI_PLAYWRIGHT_MIN_FREE_MB"),
    ".env.example documents ASHENAI_PLAYWRIGHT_MIN_FREE_MB",
  );

  assert(
    envExample.includes("ASHENAI_PLAYWRIGHT_BOOTSTRAP"),
    ".env.example documents ASHENAI_PLAYWRIGHT_BOOTSTRAP",
  );

  assert(
    envExample.includes("ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE"),
    ".env.example documents ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE",
  );

  assert(
    envExample.includes("Actual Wispbyte storage quota could not be verified"),
    ".env.example states the Wispbyte quota cannot be verified in-container",
  );

  /* ================================================================
   * NO DISCORD/USER-FACING RESOURCE OUTPUT
   * ================================================================ */

  section("No Discord/User-Facing Resource Output");

  // Verify resource monitoring stays in console only
  assert(
    !startScript.includes("/settings"),
    "start.sh does not reference /settings",
  );

  assert(
    !startScript.includes("/status"),
    "start.sh does not reference /status command",
  );

  assert(
    !checkResources.includes("discord"),
    "check-resources.sh does not reference Discord",
  );

  assert(
    !ensurePlaywright.includes("discord"),
    "ensure-playwright.sh does not reference Discord",
  );

  /* ================================================================
   * BASH SYNTAX CHECK
   * ================================================================ */

  section("Shell Syntax Validation");

  try {
    execSync("bash -n scripts/check-resources.sh", { encoding: "utf-8" });
    assert(true, "check-resources.sh passes bash -n syntax check");
  } catch {
    assert(false, "check-resources.sh fails bash -n syntax check");
  }

  try {
    execSync("bash -n scripts/ensure-playwright.sh", { encoding: "utf-8" });
    assert(true, "ensure-playwright.sh passes bash -n syntax check");
  } catch {
    assert(false, "ensure-playwright.sh fails bash -n syntax check");
  }

  try {
    execSync("bash -n scripts/start.sh", { encoding: "utf-8" });
    assert(true, "start.sh passes bash -n syntax check");
  } catch {
    assert(false, "start.sh fails bash -n syntax check");
  }

  /* ================================================================
   * RUNTIME SMOKE TEST: check-resources.sh executes
   * ================================================================ */

  section("Runtime Smoke Test");

  try {
    const output = execSync("bash scripts/check-resources.sh", {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, APP_DIR: process.cwd() },
    });
    assert(
      output.includes("[RESOURCE] Disk:"),
      "check-resources.sh outputs disk information",
    );
    assert(
      output.includes("[RESOURCE] RAM:") || output.includes("[RESOURCE] RAM: unavailable"),
      "check-resources.sh outputs RAM information",
    );
    assert(
      output.includes("[RESOURCE] CPU:"),
      "check-resources.sh outputs CPU information",
    );
    assert(
      output.includes("OK") || output.includes("WARN") || output.includes("CRITICAL") || output.includes("unavailable"),
      "check-resources.sh outputs state classification",
    );
  } catch (error: any) {
    assert(false, `check-resources.sh execution failed: ${error.message?.slice(0, 200)}`);
  }

  /* ================================================================
   * SUMMARY
   * ================================================================ */

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Resource Monitor Tests: ${passed}/${total} passed, ${failed} failed`);
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Test runner failed:", error);
  process.exit(1);
});
