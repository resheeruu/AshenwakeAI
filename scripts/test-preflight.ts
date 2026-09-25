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

import {
  runPreflight,
  createSupervisorChecks,
  classifyProviderStatus,
} from "../src/core/preflight";
import { HealthState } from "../src/ai/types";
import { registerProductionDiscordTools } from "../src/ai/tools/discord/bootstrap";
import { toolRegistry } from "../src/ai/tools/registry";

/*
 * Mirror the production composition root (index.ts): register the
 * real Discord tools before exercising preflight. Without this the
 * registry is legitimately empty and tool_registry must FAIL.
 */
registerProductionDiscordTools(() => null);

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

/* ================================================================
 * OFFLINE ROUTER — CREDENTIAL-FREE, DETERMINISTIC
 *
 * Builds a router from the REAL provider registry with persisted
 * health disabled. This mirrors the clean CI environment: no
 * provider API keys, no .env values, no production secrets, no
 * network, and no local data/provider-health.json state.
 *
 * persistentHealth:false is the same construction used by the other
 * provider suites (scripts/test-router.ts, scripts/test-provider-health.ts).
 * ================================================================ */

interface OfflineRouterContext {
  router: any;
  /** Names of every provider registered in the real registry (discovery). */
  registryNames: string[];
  /** Names of registered providers whose credentials are available now. */
  availableNames: string[];
}

async function createOfflineRouter(): Promise<OfflineRouterContext> {
  const { providers } = await import("../src/ai/providers");
  const { AIRouter } = await import("../src/ai/router");

  const router = new AIRouter(providers, { persistentHealth: false });

  return {
    router,
    registryNames: providers.map((p) => p.name.toLowerCase()),
    availableNames: providers
      .filter((p) => p.isAvailable())
      .map((p) => p.name.toLowerCase()),
  };
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
    // Real provider registry + offline router (no credentials, no persisted state).
    // Provider discovery must work in a credential-free CI environment.
    const { router: testRouter, registryNames, availableNames } = await createOfflineRouter();

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

    // Assertion A — registry completeness. Discovery is registry-driven and
    // must therefore be identical with or without credentials: every provider
    // registered in the real registry is enumerated, and nothing else is.
    const discovered = providerNames.map(name => name.toLowerCase());
    assert(
      registryNames.length > 0,
      `provider registry has entries (got ${registryNames.length})`
    );
    assert(
      registryNames.every(name => discovered.includes(name)),
      `every registered provider is discovered (${discovered.length}/${registryNames.length})`
    );
    assert(
      discovered.length === registryNames.length,
      `discovery matches registry size (discovered ${discovered.length}, registry ${registryNames.length})`
    );

    // Assertion B — credential honesty. A registered provider without
    // credentials must be reported NOT_CONFIGURED. It must never inherit a
    // stale persisted HEALTHY/CONFIGURED/DEGRADED state, and it is never
    // reported as carrying health data it cannot have.
    const unconfigured = new Set(registryNames.filter(name => !availableNames.includes(name)));
    const unconfiguredChecks = providerChecks.filter(c =>
      unconfigured.has(c.name.replace("provider:", "").toLowerCase())
    );
    const misclassified = unconfiguredChecks.filter(c => c.status !== "NOT_CONFIGURED");
    assert(
      misclassified.length === 0,
      `unconfigured providers are NOT_CONFIGURED (${misclassified.map(c => `${c.name}=${c.status}`).join(", ") || "none"})`
    );
    assert(
      unconfiguredChecks.every(c => c.details === "API key not configured"),
      `unconfigured providers report missing credentials, not health data (${unconfiguredChecks.length} checked)`
    );
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

  // ========== EMPTY REGISTRY IS BLOCKING ==========

  console.log("\n━━━ Tool Registry Required ━━━");

  try {
    // Prove preflight detects a missing production registration.
    toolRegistry.clear();
    const blockedReport = await runPreflight(null, { logLevel: "quiet" });

    const toolCheck = blockedReport.checks.find(c => c.name === "tool_registry");
    assert(toolCheck !== undefined, "tool_registry check present when empty");
    assert(toolCheck!.required === true, "tool_registry check is REQUIRED");
    assert(
      toolCheck!.status === "FAILED",
      `tool_registry FAILED when empty (got ${toolCheck!.status})`,
    );
    assert(
      blockedReport.overall === "BLOCKED",
      `overall is BLOCKED with empty registry (got ${blockedReport.overall})`,
    );

    // Recover exactly like production does — re-registration must work.
    const recovered = registerProductionDiscordTools(() => null);
    assert(recovered > 0, "production re-registration restores the registry");
    const okReport = await runPreflight(null, { logLevel: "quiet" });
    const okToolCheck = okReport.checks.find(c => c.name === "tool_registry");
    assert(
      okToolCheck!.status === "READY",
      `tool_registry READY after re-registration (got ${okToolCheck!.status})`,
    );
    assert(
      okReport.overall !== "BLOCKED",
      `overall recovers to ${okReport.overall} after re-registration`,
    );
  } catch (error) {
    assert(false, `Tool registry required checks failed: ${error instanceof Error ? error.message : String(error)}`);
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

    assert(!reportStr.includes(process.env.DISCORD_TOKEN || "NEVER_MATCH"), "no Discord token in report");
    assert(!reportStr.includes(process.env.GROQ_API_KEY || "NEVER_MATCH"), "no API key in report");
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
    // Deterministic provider status without credentials (no persisted health)
    const { router: testRouter } = await createOfflineRouter();

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

  // ========== CREDENTIAL-FIRST CLASSIFICATION / STALE HEALTH PROTECTION ==========

  console.log("\n━━━ Credential-First Classification ━━━");

  try {
    const baseline = {
      successes: 42,
      failures: 0,
      successRate: 100,
      averageLatencyMs: 120,
      score: 100,
      lastError: null as string | null,
    };

    // A provider with no credentials must never be classified from health state,
    // so stale persisted health cannot outlive a removed credential.
    const staleHealthy = classifyProviderStatus({
      ...baseline,
      configured: false,
      quarantined: false,
      healthState: HealthState.HEALTHY,
    });
    assert(
      staleHealthy.status === "NOT_CONFIGURED",
      `missing credentials + stale HEALTHY => NOT_CONFIGURED (got ${staleHealthy.status})`
    );
    assert(
      staleHealthy.details === "API key not configured",
      "missing credentials never reports health data"
    );

    const staleQuarantined = classifyProviderStatus({
      ...baseline,
      configured: false,
      quarantined: true,
      healthState: HealthState.QUARANTINED,
    });
    assert(
      staleQuarantined.status === "NOT_CONFIGURED",
      `missing credentials + persisted quarantine => NOT_CONFIGURED (got ${staleQuarantined.status})`
    );

    // Configured providers keep full health classification.
    const configuredHealthy = classifyProviderStatus({
      ...baseline,
      configured: true,
      quarantined: false,
      healthState: HealthState.HEALTHY,
    });
    assert(
      configuredHealthy.status === "HEALTHY",
      `configured + healthy => HEALTHY (got ${configuredHealthy.status})`
    );

    const configuredQuarantined = classifyProviderStatus({
      ...baseline,
      configured: true,
      quarantined: true,
      healthState: HealthState.HEALTHY,
    });
    assert(
      configuredQuarantined.status === "QUARANTINED",
      `configured + quarantined => QUARANTINED (got ${configuredQuarantined.status})`
    );

    const configuredUntested = classifyProviderStatus({
      configured: true,
      quarantined: false,
      healthState: HealthState.CONFIGURED,
      successes: 0,
      failures: 0,
      successRate: null,
      averageLatencyMs: null,
      score: 100,
      lastError: null,
    });
    assert(
      configuredUntested.status === "CONFIGURED",
      `configured + untested => CONFIGURED, never faked healthy (got ${configuredUntested.status})`
    );

    const credentialFailure = classifyProviderStatus({
      ...baseline,
      configured: true,
      quarantined: false,
      healthState: HealthState.AUTH_FAILED,
      successes: 0,
      failures: 3,
      successRate: 0,
    });
    assert(
      credentialFailure.status === "FAILED",
      `configured + auth_failed => FAILED, never faked healthy (got ${credentialFailure.status})`
    );
  } catch (error) {
    assert(false, `Credential-first classification failed: ${error instanceof Error ? error.message : String(error)}`);
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
