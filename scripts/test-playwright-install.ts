/* ================================================================
 * PLAYWRIGHT INSTALL LOGIC TESTS
 *
 * Tests the bootstrap/configuration logic without actually
 * downloading Chromium. Verifies the shell script structure,
 * manager executable resolution, and state management.
 * ================================================================ */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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
  console.log(`\n📦 ${name}`);
}

function readFile(filePath: string): string {
  return fs.readFileSync(path.resolve(filePath), "utf-8");
}

async function main(): Promise<void> {
  /* ================================================================
   * ENSURE-PLAYWRIGHT.SH STRUCTURE TESTS
   * ================================================================ */

  section("ensure-playwright.sh Structure");

  const shellScript = readFile("scripts/ensure-playwright.sh");

  assert(
    shellScript.includes("set -euo pipefail"),
    "ensure-playwright.sh uses strict mode (set -euo pipefail)",
  );

  assert(
    shellScript.includes('PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"'),
    "ensure-playwright.sh defaults PLAYWRIGHT_BROWSERS_PATH to $HOME/.cache/ms-playwright",
  );

  assert(
    shellScript.includes("PLAYWRIGHT_SKIP_BROWSER_GC"),
    "ensure-playwright.sh exports PLAYWRIGHT_SKIP_BROWSER_GC",
  );

  assert(
    shellScript.includes("--no-shell"),
    "ensure-playwright.sh uses --no-shell flag",
  );

  assert(
    shellScript.includes("--no-remove"),
    "ensure-playwright.sh uses --no-remove flag",
  );

  assert(
    shellScript.includes("ASHENAI_PLAYWRIGHT_BOOTSTRAP"),
    "ensure-playwright.sh checks ASHENAI_PLAYWRIGHT_BOOTSTRAP",
  );

  assert(
    shellScript.includes("ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE"),
    "ensure-playwright.sh checks ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE",
  );

  assert(
    shellScript.includes("bootstrap-state"),
    "ensure-playwright.sh writes bootstrap state file",
  );

  assert(
    !shellScript.includes("npx playwright install chromium\n"),
    "ensure-playwright.sh does NOT have unconditional 'npx playwright install chromium' at top level",
  );

  assert(
    shellScript.includes("npx --no-install playwright install chromium --no-shell --no-remove"),
    "ensure-playwright.sh uses 'npx --no-install' for install command",
  );

  // Verify no headless-shell installation
  assert(
    !shellScript.includes("chromium-headless-shell"),
    "ensure-playwright.sh does NOT install chromium-headless-shell",
  );

  // Verify lock mechanism exists
  assert(
    shellScript.includes("mkdir") && shellScript.includes("LOCK_DIR"),
    "ensure-playwright.sh uses atomic lock via mkdir",
  );

  // Verify state machine: installing → ready/failed
  assert(
    shellScript.includes('"installing"') && shellScript.includes('"ready"') && shellScript.includes('"failed"'),
    "ensure-playwright.sh has installing/ready/failed state transitions",
  );

  // Unsupported platform (Termux/Android) must NOT be reported as a disk problem.
  assert(
    shellScript.includes("Unsupported platform"),
    "ensure-playwright.sh detects 'Unsupported platform' from Playwright",
  );

  assert(
    shellScript.includes('"unsupported"'),
    "ensure-playwright.sh records an 'unsupported' bootstrap state",
  );

  assert(
    /Unsupported platform[\s\S]{0,600}unrelated to disk space/.test(shellScript),
    "ensure-playwright.sh states unsupported platform is unrelated to disk space",
  );

  /* ================================================================
   * ENSURE-PLAYWRIGHT.SH DOES NOT CRASH ON FAILURE
   * ================================================================ */

  section("ensure-playwright.sh Failure Handling");

  assert(
    shellScript.includes("return 0"),
    "ensure-playwright.sh returns 0 on failure (non-crashing)",
  );

  assert(
    !shellScript.includes("exit 1") && !shellScript.includes("set -e &&"),
    "ensure-playwright.sh does not exit 1 on installation failure",
  );

  assert(
    shellScript.includes("Browser features will be disabled"),
    "ensure-playwright.sh logs graceful degradation message",
  );

  /* ================================================================
   * START.SH INTEGRATION TESTS
   * ================================================================ */

  section("start.sh Integration");

  const startScript = readFile("scripts/start.sh");

  assert(
    startScript.includes("ensure-playwright.sh"),
    "start.sh calls ensure-playwright.sh",
  );

  assert(
    !startScript.includes("npx playwright install chromium"),
    "start.sh does NOT contain unconditional 'npx playwright install chromium'",
  );

  assert(
    !startScript.includes("ensure_chromium"),
    "start.sh does not contain old ensure_chromium() function",
  );

  assert(
    startScript.includes('PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"'),
    "start.sh exports PLAYWRIGHT_BROWSERS_PATH",
  );

  assert(
    startScript.includes('PLAYWRIGHT_SKIP_BROWSER_GC="${PLAYWRIGHT_SKIP_BROWSER_GC:-1}"'),
    "start.sh exports PLAYWRIGHT_SKIP_BROWSER_GC",
  );

  /* ================================================================
   * MANAGER CHROMIUM RESOLUTION TESTS
   * ================================================================ */

  section("Browser Manager Executable Resolution");

  const managerSource = readFile("src/web/browser/manager.ts");

  assert(
    managerSource.includes('import fs from "node:fs"'),
    "manager.ts imports node:fs",
  );

  assert(
    managerSource.includes("resolveChromiumExecutable"),
    "manager.ts has resolveChromiumExecutable method",
  );

  assert(
    managerSource.includes("ASHENAI_CHROMIUM_EXECUTABLE"),
    "manager.ts checks ASHENAI_CHROMIUM_EXECUTABLE env var",
  );

  assert(
    managerSource.includes("chromium.executablePath()"),
    "manager.ts falls back to Playwright's executablePath()",
  );

  assert(
    managerSource.includes("fs.accessSync"),
    "manager.ts uses fs.accessSync to verify executability",
  );

  assert(
    managerSource.includes("fs.constants.X_OK"),
    "manager.ts checks X_OK (executable permission)",
  );

  assert(
    managerSource.includes("this.config.executablePath"),
    "manager.ts checks config.executablePath first",
  );

  // Verify the resolution order: config → env → playwright
  const resolveIdx = managerSource.indexOf("resolveChromiumExecutable");
  const configIdx = managerSource.indexOf("this.config.executablePath", resolveIdx);
  const envIdx = managerSource.indexOf("ASHENAI_CHROMIUM_EXECUTABLE", resolveIdx);
  const pwIdx = managerSource.indexOf("chromium.executablePath()", resolveIdx);

  assert(
    configIdx < envIdx && envIdx < pwIdx,
    "Resolution order is: config.executablePath → ASHENAI_CHROMIUM_EXECUTABLE → playwright.executablePath()",
  );

  // Verify launchBrowser uses resolveChromiumExecutable
  assert(
    managerSource.includes("const resolvedExecutable = this.resolveChromiumExecutable()"),
    "launchBrowser calls resolveChromiumExecutable()",
  );

  assert(
    managerSource.includes("launchOptions.executablePath = resolvedExecutable"),
    "launchBrowser sets executablePath on launch options",
  );

  // Verify existing security controls are preserved
  assert(
    managerSource.includes("--no-sandbox"),
    "manager.ts preserves --no-sandbox argument",
  );

  assert(
    managerSource.includes("--disable-setuid-sandbox"),
    "manager.ts preserves --disable-setuid-sandbox argument",
  );

  assert(
    managerSource.includes("--disable-dev-shm-usage"),
    "manager.ts preserves --disable-dev-shm-usage argument",
  );

  assert(
    managerSource.includes("storageState: undefined"),
    "manager.ts preserves session isolation (storageState: undefined)",
  );

  /* ================================================================
   * WISPBYTE ENVIRONMENT VARIABLES
   * ================================================================ */

  section("Wispbyte Environment Variables");

  assert(
    shellScript.includes("ASHENAI_PLAYWRIGHT_BOOTSTRAP"),
    "ensure-playwright.sh uses ASHENAI_PLAYWRIGHT_BOOTSTRAP for first install",
  );

  assert(
    shellScript.includes("ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE"),
    "ensure-playwright.sh uses ASHENAI_PLAYWRIGHT_BOOTSTRAP_FORCE for retry",
  );

  assert(
    startScript.includes("PLAYWRIGHT_BROWSERS_PATH"),
    "start.sh configures PLAYWRIGHT_BROWSERS_PATH",
  );

  assert(
    startScript.includes("PLAYWRIGHT_SKIP_BROWSER_GC"),
    "start.sh configures PLAYWRIGHT_SKIP_BROWSER_GC",
  );

  /* ================================================================
   * NO BINARY COMMITMENT TO GIT
   * ================================================================ */

  section("No Binary Artifacts in Git");

  const gitignore = readFile(".gitignore");

  assert(
    !gitignore.includes("ms-playwright/"),
    ".gitignore does NOT exclude ms-playwright/ (binaries are per-user cache, not committed)",
  );

  // The Playwright binaries live under PLAYWRIGHT_BROWSERS_PATH which defaults
  // to $HOME/.cache/ms-playwright, outside the repo. Verify the repo itself
  // has no browser binary directories tracked.
  assert(
    !fs.existsSync("ms-playwright"),
    "No ms-playwright directory in repo root",
  );

  /* ================================================================
   * STATE FILE TESTS
   * ================================================================ */

  section("Bootstrap State File");

  assert(
    shellScript.includes('"none"'),
    "ensure-playwright.sh handles missing state file (defaults to 'none')",
  );

  assert(
    shellScript.includes('"ready"'),
    "ensure-playwright.sh writes 'ready' state on success",
  );

  assert(
    shellScript.includes('"failed"'),
    "ensure-playwright.sh writes 'failed' state on failure",
  );

  assert(
    shellScript.includes('"installing"'),
    "ensure-playwright.sh writes 'installing' state during download",
  );

  /* ================================================================
   * BASH SYNTAX CHECK
   * ================================================================ */

  section("Shell Syntax Validation");

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
   * SUMMARY
   * ================================================================ */

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Playwright Install Tests: ${passed}/${total} passed, ${failed} failed`);
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Test runner failed:", error);
  process.exit(1);
});
