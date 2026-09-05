#!/usr/bin/env node
/* ================================================================
 * PREFLIGHT SYSTEM TESTS
 *
 * Verifies the unified startup preflight system:
 * - Auto-discovery works
 * - Checks are accurate
 * - Log deduplication works
 * - Overall status calculation is correct
 * - Integration with existing systems
 * ================================================================ */

import { runPreflight, createSupervisorChecks } from "../src/core/preflight";

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

function assertIncludes(haystack: string, needle: string, message: string): void {
  assert(haystack.includes(needle), message);
}

async function main(): Promise<void> {
  console.log("\n🔍 Preflight System Tests\n");

  // ========== BASIC PREFLIGHT ==========

  console.log("━━━ Basic Preflight ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    assert(typeof report === "object", "runPreflight returns an object");
    assert(typeof report.overall === "string", "report.overall is a string");
    assert(["READY", "DEGRADED", "BLOCKED"].includes(report.overall), "report.overall is valid");
    assert(Array.isArray(report.checks), "report.checks is an array");
    assert(report.checks.length > 0, `report.checks has entries (got ${report.checks.length})`);
    assert(typeof report.timestamp === "number", "report.timestamp is a number");
    assert(typeof report.durationMs === "number", "report.durationMs is a number");
    assert(typeof report.summary === "string", "report.summary is a string");
    assert(report.durationMs >= 0, "durationMs is non-negative");
  } catch (error) {
    assert(false, `runPreflight threw: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== AUTO-DISCOVERY: RUNTIME ==========

  console.log("\n━━━ Auto-Discovery: Runtime ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const nodejs = report.checks.find(c => c.name === "nodejs");
    assert(nodejs !== undefined, "nodejs check discovered");
    assert(nodejs!.category === "runtime", "nodejs category is runtime");
    assert(nodejs!.required === true, "nodejs is required");
    assert(nodejs!.status === "READY", "nodejs status is READY");

    const platform = report.checks.find(c => c.name === "platform");
    assert(platform !== undefined, "platform check discovered");
    assert(platform!.status === "READY", "platform status is READY");

    const memory = report.checks.find(c => c.name === "memory");
    assert(memory !== undefined, "memory check discovered");
    assert(memory!.status === "READY", "memory status is READY (normal heap)");

    const filesystem = report.checks.find(c => c.name === "filesystem");
    assert(filesystem !== undefined, "filesystem check discovered");
    assert(filesystem!.status === "READY", "filesystem status is READY");
  } catch (error) {
    assert(false, `Runtime checks failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== AUTO-DISCOVERY: DEPENDENCIES ==========

  console.log("\n━━━ Auto-Discovery: Dependencies ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const deps = report.checks.find(c => c.name === "npm_dependencies");
    assert(deps !== undefined, "npm_dependencies check discovered");
    assert(deps!.category === "dependencies", "category is dependencies");
    assert(deps!.required === true, "dependencies are required");
    assert(deps!.status === "READY" || deps!.status === "DEGRADED", "dependencies status is READY or DEGRADED");
  } catch (error) {
    assert(false, `Dependency checks failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== AUTO-DISCOVERY: CONFIG ==========

  console.log("\n━━━ Auto-Discovery: Config ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const discordToken = report.checks.find(c => c.name === "discord_token");
    assert(discordToken !== undefined, "discord_token check discovered");
    assert(discordToken!.category === "config", "category is config");

    const providerKeys = report.checks.find(c => c.name === "provider_keys");
    assert(providerKeys !== undefined, "provider_keys check discovered");
    assert(providerKeys!.details?.includes("configured"), "provider_keys details mention configured");
  } catch (error) {
    assert(false, `Config checks failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== AUTO-DISCOVERY: DATABASE ==========

  console.log("\n━━━ Auto-Discovery: Database ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const db = report.checks.find(c => c.name === "database");
    assert(db !== undefined, "database check discovered");
    assert(db!.category === "database", "category is database");
    assert(db!.required === true, "database is required");
    assert(db!.status === "READY", "database status is READY");

    const schema = report.checks.find(c => c.name === "database_schema");
    assert(schema !== undefined, "database_schema check discovered");
    assert(schema!.status === "READY", "database_schema status is READY");
  } catch (error) {
    assert(false, `Database checks failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== AUTO-DISCOVERY: AI SYSTEMS ==========

  console.log("\n━━━ Auto-Discovery: AI Systems ━━━");

  try {
    // Import the actual router for testing
    const { providers } = await import("../src/ai/providers");
    const { AIRouter } = await import("../src/ai/router");
    const testRouter = new AIRouter(providers);

    const report = await runPreflight(testRouter, { logLevel: "quiet" });

    const router = report.checks.find(c => c.name === "ai_router");
    assert(router !== undefined, "ai_router check discovered");
    assert(router!.category === "ai", "category is ai");

    const providersCheck = report.checks.find(c => c.name === "ai_providers");
    assert(providersCheck !== undefined, "ai_providers check discovered");
    assert(providersCheck!.category === "ai", "category is ai");

    // Individual providers should be auto-discovered
    const providerChecks = report.checks.filter(c => c.category === "provider");
    assert(providerChecks.length > 0, `individual providers auto-discovered (got ${providerChecks.length})`);

    // Provider names should match the registry
    const providerNames = providerChecks.map(c => c.name.replace("provider:", ""));
    assert(providerNames.includes("groq") || providerNames.includes("gemini"), "known providers found");
  } catch (error) {
    assert(false, `AI checks failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== AUTO-DISCOVERY: TOOLS ==========

  console.log("\n━━━ Auto-Discovery: Tools ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const tools = report.checks.find(c => c.name === "tool_registry");
    assert(tools !== undefined, "tool_registry check discovered");
    assert(tools!.category === "tools", "category is tools");
  } catch (error) {
    assert(false, `Tool checks failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== AUTO-DISCOVERY: SECURITY ==========

  console.log("\n━━━ Auto-Discovery: Security ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const security = report.checks.find(c => c.name === "security");
    assert(security !== undefined, "security check discovered");
    assert(security!.category === "security", "category is security");
    assert(security!.required === true, "security is required");
    assert(security!.status === "HEALTHY", "security status is HEALTHY (injection blocked)");

    const audit = report.checks.find(c => c.name === "audit");
    assert(audit !== undefined, "audit check discovered");
    assert(audit!.status === "READY", "audit status is READY");
  } catch (error) {
    assert(false, `Security checks failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== AUTO-DISCOVERY: MEMORY ==========

  console.log("\n━━━ Auto-Discovery: Memory ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const memory = report.checks.find(c => c.name === "conversation_memory");
    assert(memory !== undefined, "conversation_memory check discovered");
    assert(memory!.category === "memory", "category is memory");

    const profiles = report.checks.find(c => c.name === "user_profiles");
    assert(profiles !== undefined, "user_profiles check discovered");
  } catch (error) {
    assert(false, `Memory checks failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== AUTO-DISCOVERY: OBSERVABILITY ==========

  console.log("\n━━━ Auto-Discovery: Observability ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const tracing = report.checks.find(c => c.name === "tracing");
    assert(tracing !== undefined, "tracing check discovered");
    assert(tracing!.category === "observability", "category is observability");

    const cache = report.checks.find(c => c.name === "response_cache");
    assert(cache !== undefined, "response_cache check discovered");
  } catch (error) {
    assert(false, `Observability checks failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== OVERALL STATUS CALCULATION ==========

  console.log("\n━━━ Overall Status Calculation ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    // All required checks should pass in a normal environment
    const requiredChecks = report.checks.filter(c => c.required);
    const failedRequired = requiredChecks.filter(
      c => c.status === "FAILED" || c.status === "BLOCKED"
    );

    assert(
      failedRequired.length === 0,
      `No required checks failed (found ${failedRequired.length}: ${failedRequired.map(c => c.name).join(", ")})`
    );

    // Overall should be READY or DEGRADED (not BLOCKED)
    assert(
      report.overall === "READY" || report.overall === "DEGRADED",
      `overall is ${report.overall} (expected READY or DEGRADED)`
    );
  } catch (error) {
    assert(false, `Status calculation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== SUPERVISOR INTEGRATION ==========

  console.log("\n━━━ Supervisor Integration ━━━");

  try {
    const checks = createSupervisorChecks(null);
    assert(typeof checks === "function", "createSupervisorChecks returns a function");

    const result = checks();
    assert(typeof result === "object", "checks() returns an object");
    assert(typeof result.healthy === "boolean", "result.healthy is a boolean");

    // Without router, should still check database and memory
    assert(result.healthy === true || (result.reasons && result.reasons.length > 0), "result is valid");
  } catch (error) {
    assert(false, `Supervisor integration failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== SUMMARY FORMAT ==========

  console.log("\n━━━ Summary Format ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    assert(report.summary.length > 0, "summary is not empty");
    assert(report.summary.includes("runtime"), "summary includes runtime category");
    assert(report.summary.includes("database"), "summary includes database category");
    assert(report.summary.includes("ai"), "summary includes ai category");
    assert(report.summary.includes("security"), "summary includes security category");
  } catch (error) {
    assert(false, `Summary format failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== NO SECRETS IN REPORT ==========

  console.log("\n━━━ Secret Safety ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });
    const reportStr = JSON.stringify(report);

    assert(!reportStr.includes(process.env.DISCORD_TOKEN ?? "NEVER_MATCH"), "no Discord token in report");
    assert(!reportStr.includes(process.env.GROQ_API_KEY ?? "NEVER_MATCH"), "no API key in report");
    assert(!reportStr.includes("Bearer "), "no Bearer token in report");
    assert(!reportStr.includes("sk-"), "no OpenAI key in report");
  } catch (error) {
    assert(false, `Secret safety check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== LOG LEVELS ==========

  console.log("\n━━━ Log Levels ━━━");

  try {
    // Quiet mode should produce no output
    const quietReport = await runPreflight(null, { logLevel: "quiet" });
    assert(quietReport.checks.length > 0, "quiet mode still runs checks");

    // Compact mode (default) should produce summary
    const compactReport = await runPreflight(null, { logLevel: "compact" });
    assert(compactReport.checks.length > 0, "compact mode runs checks");

    // Detailed mode should produce per-check output
    const detailedReport = await runPreflight(null, { logLevel: "detailed" });
    assert(detailedReport.checks.length > 0, "detailed mode runs checks");
  } catch (error) {
    assert(false, `Log level test failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== ARCHITECTURAL DRIFT DETECTION ==========

  console.log("\n━━━ Architectural Drift Detection ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const drift = report.checks.find(c => c.name === "architectural_drift");
    assert(drift !== undefined, "architectural_drift check discovered");
    assert(drift!.category === "architecture", "category is architecture");
    assert(drift!.required === false, "architectural drift is optional (informational)");
    assert(
      drift!.status === "HEALTHY" || drift!.status === "DEGRADED",
      `drift status is HEALTHY or DEGRADED (got ${drift!.status})`
    );
  } catch (error) {
    assert(false, `Architectural drift check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== POST-RESTART VERIFICATION ==========

  console.log("\n━━━ Post-Restart Verification ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const restart = report.checks.find(c => c.name === "restart_context");
    assert(restart !== undefined, "restart_context check discovered");
    assert(restart!.category === "runtime", "category is runtime");
    assert(restart!.required === false, "restart context is optional (informational)");
    assert(restart!.status === "READY", "restart context is READY");
    assert(restart!.details !== undefined, "restart context has details");
  } catch (error) {
    assert(false, `Post-restart verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== AGENT SYSTEM DISCOVERY ==========

  console.log("\n━━━ Agent System Discovery ━━━");

  try {
    const report = await runPreflight(null, { logLevel: "quiet" });

    const selfHealer = report.checks.find(c => c.name === "self_healer");
    assert(selfHealer !== undefined, "self_healer check discovered");
    assert(selfHealer!.category === "agent", "category is agent");
    assert(
      selfHealer!.status === "INSTALLED" || selfHealer!.status === "LIVE" || selfHealer!.status === "UNVERIFIED",
      `self_healer status is valid (got ${selfHealer!.status})`
    );

    const autonomous = report.checks.find(c => c.name === "autonomous_engine");
    assert(autonomous !== undefined, "autonomous_engine check discovered");
    assert(autonomous!.category === "agent", "category is agent");
  } catch (error) {
    assert(false, `Agent system discovery failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== PROVIDER ERROR CLASSIFICATION ==========

  console.log("\n━━━ Provider Error Classification ━━━");

  try {
    const { providers } = await import("../src/ai/providers");
    const { AIRouter } = await import("../src/ai/router");
    const testRouter = new AIRouter(providers);

    const report = await runPreflight(testRouter, { logLevel: "quiet" });

    const providerChecks = report.checks.filter(c => c.category === "provider");
    assert(providerChecks.length > 0, "individual providers discovered");

    // Each provider check should have a valid PreflightStatus
    const validStatuses = [
      "HEALTHY", "DEGRADED", "QUARANTINED", "CONFIGURED",
      "NOT_CONFIGURED", "UNVERIFIED", "RECOVERING", "FAILED",
    ];
    for (const check of providerChecks) {
      assert(
        validStatuses.includes(check.status),
        `provider ${check.name} has valid status: ${check.status}`
      );
    }
  } catch (error) {
    assert(false, `Provider error classification failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== SUMMARY ==========

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Preflight Tests: ${passed}/${total} passed, ${failed} failed`);
  console.log(`${"=".repeat(50)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Preflight test runner failed:", error);
  process.exit(1);
});
