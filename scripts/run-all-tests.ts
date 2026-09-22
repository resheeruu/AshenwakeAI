#!/usr/bin/env node
/* ================================================================
 * ASHENAI COMPREHENSIVE TEST RUNNER
 * ================================================================ */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { combineChildOutput } from "./test-runner-output";

interface TestSuite {
  name: string;
  file: string;
  category: "core" | "security" | "tool" | "web" | "integration";
  optional?: boolean;
  reason?: string;
}

const TSX = "node ./node_modules/.bin/tsx";
const MANDATORY_SUITES: TestSuite[] = [
  { name: "Router", file: "scripts/test-router.ts", category: "core" },
  { name: "Provider Lifecycle", file: "scripts/test-provider-lifecycle.ts", category: "core" },
  { name: "Preflight", file: "scripts/test-preflight.ts", category: "core" },
  { name: "Provider Health", file: "scripts/test-provider-health.ts", category: "core" },
  { name: "Core", file: "scripts/test-core.ts", category: "core" },
  { name: "Commands", file: "scripts/test-commands.ts", category: "core" },
  { name: "Rate Limit", file: "scripts/test-rate-limit.ts", category: "core" },
  { name: "Tasks", file: "scripts/test-tasks.ts", category: "core" },
  { name: "Settlement", file: "scripts/test-settlement.ts", category: "core" },
  { name: "Security", file: "scripts/test-security.ts", category: "security" },
  { name: "Hardening", file: "scripts/test-hardening.ts", category: "security" },
  { name: "Adversarial", file: "scripts/test-adversarial.ts", category: "security" },
  { name: "Security Patterns", file: "scripts/test-security-patterns.ts", category: "security" },
  { name: "Error Sanitization", file: "scripts/test-error-sanitization.ts", category: "security" },
  { name: "Audit Integrity", file: "scripts/test-audit-integrity.ts", category: "security" },
  { name: "Security Hardening", file: "scripts/test-security-hardening.ts", category: "security" },
  { name: "Auth Upgrade", file: "scripts/test-auth-upgrade.ts", category: "security" },
  { name: "Ask Command", file: "scripts/test-ask-command.ts", category: "security" },
  { name: "Conversation Wrapper", file: "scripts/test-conversation-wrapper.ts", category: "security" },
  { name: "Tool Registry", file: "scripts/test-tool-registry.ts", category: "tool" },
  { name: "Template Execution", file: "scripts/test-template-execution.ts", category: "tool" },
  { name: "Builder inspectServer", file: "scripts/test-builder-inspect-server.ts", category: "tool" },
  { name: "Production Upgrade", file: "scripts/test-production-upgrade.ts", category: "integration" },
  { name: "Update Rollback", file: "scripts/test-update-rollback.ts", category: "integration" },
  { name: "Rivalry", file: "scripts/test-rivalry.ts", category: "integration" },
  { name: "Web Security", file: "scripts/test-web-security.ts", category: "web" },
  { name: "Web Headers", file: "scripts/test-web-headers.ts", category: "web" },
  { name: "Error Coverage", file: "scripts/test-error-coverage.ts", category: "integration" },
  { name: "Support", file: "scripts/test-support.ts", category: "core" },
  { name: "Support AI", file: "scripts/test-support-ai.ts", category: "core" },
  { name: "Support Hardening", file: "scripts/test-support-hardening.ts", category: "security" },
  { name: "Coding Agents", file: "scripts/test-coding-agents.ts", category: "integration" },
  { name: "AI Social", file: "scripts/test-ai-social.ts", category: "core" },
  { name: "Personality", file: "scripts/test-personality.ts", category: "core" },
  { name: "Anime Actions", file: "scripts/test-anime-actions.ts", category: "core" },
  { name: "Resource Startup", file: "scripts/test-resource-startup.ts", category: "integration" },
  { name: "Runner Diagnostics", file: "scripts/test-runner-diagnostics.ts", category: "integration" },
];

let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
const results: Array<{ name: string; status: "PASS" | "FAIL" | "SKIP"; duration: number; category: string }> = [];

function runSuite(suite: TestSuite): boolean {
  const fullPath = path.resolve(suite.file);
  if (!existsSync(fullPath)) {
    console.log(`  SKIP: ${suite.name} (${suite.file} not found)`);
    results.push({ name: suite.name, status: "SKIP", duration: 0, category: suite.category });
    totalSkipped++;
    return true;
  }

  const start = Date.now();
  try {
    const child = execSync(`${TSX} ${suite.file}`, {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 120_000,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    const output = combineChildOutput(child, "");
    if (output) console.log(output.trimEnd());
    const duration = Date.now() - start;
    console.log(`  PASS: ${suite.name} (${duration}ms)`);
    results.push({ name: suite.name, status: "PASS", duration, category: suite.category });
    totalPassed++;
    return true;
  } catch (error: any) {
    const duration = Date.now() - start;
    const output = combineChildOutput(error.stdout, error.stderr);
    const passMatch = output.match(/(?:Passed|passed):\s*(\d+)/) || output.match(/(\d+)\s+passed/);
    const failMatch = output.match(/(?:Failed|failed):\s*(\d+)/) || output.match(/(\d+)\s+failed/);
    const failCount = failMatch ? parseInt(failMatch[1], 10) : 0;

    console.error(`  FAIL: ${suite.name} (${duration}ms) — ${failCount} failures`);
    console.error(`--- ${suite.name} test output ---`);
    if (output) console.error(output.trimEnd());
    else if (error instanceof Error) console.error(error.stack ?? error.message);
    console.error("--- end test output ---");
    results.push({ name: suite.name, status: "FAIL", duration, category: suite.category });
    totalFailed++;
    return false;
  }
}

console.log("\n+----------------------------------------------+");
console.log("| AshenAI Comprehensive Test Suite             |");
console.log("+----------------------------------------------+\n");
console.log(`Running ${MANDATORY_SUITES.length} mandatory suites...\n`);

for (const suite of MANDATORY_SUITES) {
  if (!runSuite(suite)) {
    console.error(`\nFATAL: ${suite.name} failed. Aborting remaining tests.`);
    break;
  }
}

console.log("\n+----------------------------------------------+");
console.log("| Results Summary                              |");
console.log("+----------------------------------------------+\n");
for (const cat of [...new Set(results.map(r => r.category))]) {
  const catResults = results.filter(r => r.category === cat);
  console.log(`  ${cat.toUpperCase().padEnd(12)} ${catResults.filter(r => r.status === "PASS").length} passed, ${catResults.filter(r => r.status === "FAIL").length} failed, ${catResults.filter(r => r.status === "SKIP").length} skipped`);
}
console.log(`\n  TOTAL: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`);
console.log(`  ${totalFailed === 0 ? "ALL MANDATORY TESTS PASSED" : "SOME TESTS FAILED"}\n`);
if (totalFailed > 0) process.exit(1);
