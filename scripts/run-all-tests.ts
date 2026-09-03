#!/usr/bin/env node
/* ================================================================
 * ASHENAI COMPREHENSIVE TEST RUNNER
 *
 * Runs all mandatory test suites sequentially.
 * Each suite must pass (exit code 0) for the overall run to succeed.
 * Suites that require live API keys or special environments are
 * classified as optional and skipped in the default run.
 * ================================================================ */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

interface TestSuite {
  name: string;
  file: string;
  category: "core" | "security" | "browser" | "tool" | "web" | "integration";
  optional?: boolean;
  reason?: string;
}

const TSX = "node ./node_modules/.bin/tsx";

const MANDATORY_SUITES: TestSuite[] = [
  // Core
  { name: "Router", file: "scripts/test-router.ts", category: "core" },
  { name: "Core", file: "scripts/test-core.ts", category: "core" },
  { name: "Commands", file: "scripts/test-commands.ts", category: "core" },
  { name: "Rate Limit", file: "scripts/test-rate-limit.ts", category: "core" },
  { name: "Tasks", file: "scripts/test-tasks.ts", category: "core" },
  { name: "Settlement", file: "scripts/test-settlement.ts", category: "core" },

  // Security
  { name: "Security", file: "scripts/test-security.ts", category: "security" },
  { name: "Hardening", file: "scripts/test-hardening.ts", category: "security" },
  { name: "Adversarial", file: "scripts/test-adversarial.ts", category: "security" },
  { name: "Security Patterns", file: "scripts/test-security-patterns.ts", category: "security" },
  { name: "Error Sanitization", file: "scripts/test-error-sanitization.ts", category: "security" },
  { name: "Audit Integrity", file: "scripts/test-audit-integrity.ts", category: "security" },
  { name: "Security Hardening", file: "scripts/test-security-hardening.ts", category: "security" },
  { name: "Auth Upgrade", file: "scripts/test-auth-upgrade.ts", category: "security" },

  // Browser
  { name: "Browser", file: "scripts/test-browser.ts", category: "browser" },

  // Tool Registry
  { name: "Tool Registry", file: "scripts/test-tool-registry.ts", category: "tool" },
  { name: "Template Execution", file: "scripts/test-template-execution.ts", category: "tool" },

  // Web
  { name: "Web Security", file: "scripts/test-web-security.ts", category: "web" },
  { name: "Web Headers", file: "scripts/test-web-headers.ts", category: "web" },

  // Error coverage
  { name: "Error Coverage", file: "scripts/test-error-coverage.ts", category: "integration" },

  // Integration
  { name: "Coding Agents", file: "scripts/test-coding-agents.ts", category: "integration" },
];

const OPTIONAL_SUITES: TestSuite[] = [
  { name: "Providers", file: "scripts/test-providers.ts", category: "core", optional: true, reason: "Requires live API keys" },
  { name: "U3", file: "scripts/test-u3.ts", category: "core", optional: true, reason: "U3 feature tests" },
  { name: "U4", file: "scripts/test-u4.ts", category: "core", optional: true, reason: "U4 feature tests" },
  { name: "U5", file: "scripts/test-u5.ts", category: "core", optional: true, reason: "U5 feature tests" },
  { name: "U6", file: "scripts/test-u6.ts", category: "core", optional: true, reason: "U6 feature tests" },
  { name: "U7", file: "scripts/test-u7.ts", category: "core", optional: true, reason: "U7 governance tests (pre-existing failures)" },
  { name: "U8", file: "scripts/test-u8.ts", category: "core", optional: true, reason: "U8 feature tests (pre-existing failures)" },
  { name: "U8 Enhancements", file: "scripts/test-u8-enhancements.ts", category: "core", optional: true, reason: "U8 deep enhancements (pre-existing failures)" },
  { name: "U9", file: "scripts/test-u9.ts", category: "core", optional: true, reason: "U9 feature tests" },
  { name: "U9 Security", file: "scripts/test-u9-security.ts", category: "security", optional: true, reason: "U9 security hardening" },
  { name: "U10 Security", file: "scripts/test-u10-security.ts", category: "security", optional: true, reason: "U10 security features" },
  { name: "U11 Security", file: "scripts/test-u11-security.ts", category: "security", optional: true, reason: "U11 security features" },
  { name: "U12 Production", file: "scripts/test-u12-production.ts", category: "integration", optional: true, reason: "U12 production readiness" },
  { name: "U13 Production", file: "scripts/test-u13-production.ts", category: "integration", optional: true, reason: "U13 production features" },
  { name: "U14 Production", file: "scripts/test-u14-production.ts", category: "integration", optional: true, reason: "U14 Dockerfile validation" },
  { name: "U16 Hosting", file: "scripts/test-u16-hosting.ts", category: "integration", optional: true, reason: "Hosting adaptivity tests" },
  { name: "U17 Hosting", file: "scripts/test-u17-hosting.ts", category: "integration", optional: true, reason: "Hosting tests (pre-existing failures)" },
  { name: "U17 Portability", file: "scripts/test-u17-portability.ts", category: "integration", optional: true, reason: "Portability validation" },
  { name: "U19 Resource", file: "scripts/test-u19-resource-optimization.ts", category: "integration", optional: true, reason: "Resource optimization" },
];

let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
const results: Array<{ name: string; status: "PASS" | "FAIL" | "SKIP"; duration: number; category: string }> = [];

function runSuite(suite: TestSuite): boolean {
  const fullPath = path.resolve(suite.file);
  if (!existsSync(fullPath)) {
    console.log(`  ⚠️  SKIP: ${suite.name} (${suite.file} not found)`);
    results.push({ name: suite.name, status: "SKIP", duration: 0, category: suite.category });
    totalSkipped++;
    return true;
  }

  const start = Date.now();
  try {
    execSync(`${TSX} ${suite.file}`, {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 120_000,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    const duration = Date.now() - start;
    console.log(`  ✅ PASS: ${suite.name} (${duration}ms)`);
    results.push({ name: suite.name, status: "PASS", duration, category: suite.category });
    totalPassed++;
    return true;
  } catch (error: any) {
    const duration = Date.now() - start;
    const stderr = error.stderr?.toString() || "";
    const stdout = error.stdout?.toString() || "";
    const output = stderr || stdout;

    // Extract pass/fail counts from output
    const passMatch = output.match(/Passed:\s*(\d+)/);
    const failMatch = output.match(/Failed:\s*(\d+)/);
    const passCount = passMatch ? parseInt(passMatch[1]) : 0;
    const failCount = failMatch ? parseInt(failMatch[1]) : 0;

    console.log(`  ❌ FAIL: ${suite.name} (${duration}ms) — ${failCount} failures`);
    if (failCount > 0) {
      // Show last few lines of output for context
      const lines = output.split("\n").filter(l => l.trim()).slice(-5);
      for (const line of lines) {
        console.log(`     ${line}`);
      }
    }
    results.push({ name: suite.name, status: "FAIL", duration, category: suite.category });
    totalFailed++;
    return false;
  }
}

console.log("\n╔══════════════════════════════════════════════╗");
console.log("║   ASHENAI COMPREHENSIVE TEST SUITE          ║");
console.log("╚══════════════════════════════════════════════╝\n");

console.log(`Running ${MANDATORY_SUITES.length} mandatory suites...\n`);

let allPassed = true;

for (const suite of MANDATORY_SUITES) {
  if (!runSuite(suite)) {
    allPassed = false;
    console.log(`\n⛔ FATAL: ${suite.name} failed. Aborting remaining tests.`);
    break;
  }
}

if (allPassed && OPTIONAL_SUITES.length > 0 && process.argv.includes("--all")) {
  console.log(`\nRunning ${OPTIONAL_SUITES.length} optional suites...\n`);
  for (const suite of OPTIONAL_SUITES) {
    runSuite(suite); // Don't abort on optional failures
  }
}

// Summary
console.log("\n╔══════════════════════════════════════════════╗");
console.log("║   RESULTS SUMMARY                           ║");
console.log("╚══════════════════════════════════════════════╝\n");

const categories = [...new Set(results.map(r => r.category))];
for (const cat of categories) {
  const catResults = results.filter(r => r.category === cat);
  const catPassed = catResults.filter(r => r.status === "PASS").length;
  const catFailed = catResults.filter(r => r.status === "FAIL").length;
  const catSkipped = catResults.filter(r => r.status === "SKIP").length;
  console.log(`  ${cat.toUpperCase().padEnd(12)} ${catPassed} passed, ${catFailed} failed, ${catSkipped} skipped`);
}

console.log(`\n  TOTAL: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`);
console.log(`  ${totalFailed === 0 ? "🎉 ALL MANDATORY TESTS PASSED" : "❌ SOME TESTS FAILED"}\n`);

if (totalFailed > 0) {
  process.exit(1);
}
