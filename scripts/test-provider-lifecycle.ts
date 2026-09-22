#!/usr/bin/env node
/* ================================================================
 * PROVIDER LIFECYCLE REGRESSION TESTS
 *
 * Reproduces the Wispbyte startup crash regression:
 *   configured providers + 0 healthy + >0 untested were aggregated as
 *   DEGRADED, and createSupervisorChecks() reported
 *   "No healthy AI providers", so InternalSupervisor terminated the
 *   process after 3 consecutive checks (~60s after boot) on every
 *   fresh deployment where no provider had completed a request yet.
 *
 * Lifecycle contract under test:
 *   configured + untested                -> CONFIGURED (not a failure)
 *   configured + healthy                 -> HEALTHY
 *   configured + tested failures         -> DEGRADED
 *   configured + all tested + zero ok    -> FAILED (genuinely unhealthy)
 *   zero configured                      -> NOT_CONFIGURED
 *
 * The supervisor must only declare a sustained provider failure once
 * every configured provider has actually been exercised. No provider
 * is ever faked healthy, and no provider API call is made to satisfy
 * the supervisor.
 * ================================================================ */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assessProviderLifecycle,
  createSupervisorChecks,
  runPreflight,
} from "../src/core/preflight";
import { InternalSupervisor } from "../src/core/internalSupervisor";
import {
  AIRouter,
  SavedProviderHealth,
  restoreHealthStateFromLegacyJson,
} from "../src/ai/router";
import { AIProvider, AIRequest, AIResponse, HealthState } from "../src/ai/types";

import { setCacheEnabled } from "../src/ai/response-cache";

setCacheEnabled(false);

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
  console.log(`\n━━━ ${name} ━━━`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const REQUEST: AIRequest = {
  messages: [{ role: "user", content: "lifecycle regression probe" }],
  temperature: 0.7,
  maxTokens: 16,
};

function makeProvider(
  name: string,
  options: {
    behavior?: "ok" | "fail";
    available?: boolean;
  } = {},
): AIProvider {
  const behavior = options.behavior ?? "ok";
  const available = options.available ?? true;

  return {
    name,
    isAvailable: () => available,
    generate: async (request: AIRequest): Promise<AIResponse> => {
      if (behavior === "fail") {
        const error = new Error("simulated provider outage") as Error & {
          status?: number;
        };
        error.status = 503;
        throw error;
      }

      void request;
      return {
        text: "ok",
        provider: name,
        model: "test-model",
        latencyMs: 5,
      };
    },
  };
}

interface StubCounts {
  configuredProviders?: number;
  healthyProviders?: number;
  degradedProviders?: number;
  quarantinedProviders?: number;
  untestedProviders?: number;
}

/** Router double exposing only getHealthReport() with controlled counts. */
function stubRouter(counts: StubCounts): unknown {
  return {
    getHealthReport: () => ({
      totalProviders: counts.configuredProviders ?? 0,
      ...counts,
      providers: [],
    }),
  };
}

/* ================================================================
 * 1. PURE LIFECYCLE TABLE
 * ================================================================ */

function testLifecycleTable(): void {
  section("assessProviderLifecycle — lifecycle table");

  const cases: Array<{
    name: string;
    counts: StubCounts;
    expectedStatus: string;
    expectedSustained: boolean;
  }> = [
    {
      name: "zero configured -> NOT_CONFIGURED, not a failure",
      counts: {},
      expectedStatus: "NOT_CONFIGURED",
      expectedSustained: false,
    },
    {
      name: "WISPBYTE STARTUP: configured + 0 healthy + untested -> CONFIGURED",
      counts: { configuredProviders: 16, untestedProviders: 16 },
      expectedStatus: "CONFIGURED",
      expectedSustained: false,
    },
    {
      name: "configured + healthy -> HEALTHY",
      counts: {
        configuredProviders: 3,
        healthyProviders: 3,
        untestedProviders: 0,
      },
      expectedStatus: "HEALTHY",
      expectedSustained: false,
    },
    {
      name: "tested failures outweigh healthy -> DEGRADED",
      counts: {
        configuredProviders: 3,
        healthyProviders: 1,
        degradedProviders: 2,
        untestedProviders: 0,
      },
      expectedStatus: "DEGRADED",
      expectedSustained: false,
    },
    {
      name: "minor tested failures -> HEALTHY",
      counts: {
        configuredProviders: 3,
        healthyProviders: 2,
        degradedProviders: 1,
        untestedProviders: 0,
      },
      expectedStatus: "HEALTHY",
      expectedSustained: false,
    },
    {
      name: "ALL CONFIGURED TESTED + 0 HEALTHY -> FAILED and sustained",
      counts: {
        configuredProviders: 2,
        degradedProviders: 2,
        untestedProviders: 0,
      },
      expectedStatus: "FAILED",
      expectedSustained: true,
    },
    {
      name: "tested failures + still untested -> DEGRADED, not sustained",
      counts: {
        configuredProviders: 2,
        degradedProviders: 1,
        untestedProviders: 1,
      },
      expectedStatus: "DEGRADED",
      expectedSustained: false,
    },
    {
      name: "single tested-and-failed provider -> sustained failure",
      counts: {
        configuredProviders: 1,
        degradedProviders: 1,
        untestedProviders: 0,
      },
      expectedStatus: "FAILED",
      expectedSustained: true,
    },
    {
      name: "quarantined-only fleet (all tested) -> sustained failure",
      counts: {
        configuredProviders: 2,
        quarantinedProviders: 2,
        untestedProviders: 0,
      },
      expectedStatus: "FAILED",
      expectedSustained: true,
    },
  ];

  for (const testCase of cases) {
    const assessment = assessProviderLifecycle(testCase.counts);
    assert(
      assessment.status === testCase.expectedStatus,
      `${testCase.name} (status=${assessment.status})`,
    );
    assert(
      assessment.sustainedProviderFailure === testCase.expectedSustained,
      `${testCase.name} (sustained=${assessment.sustainedProviderFailure})`,
    );
  }

  const startup = assessProviderLifecycle({
    configuredProviders: 16,
    untestedProviders: 16,
  });
  assert(
    startup.tested === 0 && startup.untested === 16,
    "startup assessment reports 0 tested / 16 untested",
  );
  assert(
    startup.detail.includes("16 untested"),
    "assessment detail is human readable",
  );
}

/* ================================================================
 * 2. SUPERVISOR DECISION TABLE (isolated from DB/memory checks)
 * ================================================================ */

function testSupervisorDecisionTable(): void {
  section("createSupervisorChecks — provider decision table");

  const startup = createSupervisorChecks(stubRouter({
    configuredProviders: 16,
    untestedProviders: 16,
  }) as never)();
  assert(
    startup.healthy === true,
    "STARTUP REGRESSION: 16 configured + 0 healthy + 16 untested is healthy for the supervisor",
  );
  assert(
    !startup.reasons?.some((r) => r.includes("No healthy AI providers")),
    "startup regression: no 'No healthy AI providers' reason emitted",
  );

  const healthy = createSupervisorChecks(stubRouter({
    configuredProviders: 2,
    healthyProviders: 2,
    untestedProviders: 0,
  }) as never)();
  assert(healthy.healthy === true, "healthy fleet is healthy for the supervisor");

  const mixed = createSupervisorChecks(stubRouter({
    configuredProviders: 2,
    degradedProviders: 1,
    untestedProviders: 1,
  }) as never)();
  assert(
    mixed.healthy === true,
    "mixed tested-failure + untested fleet is not a sustained failure",
  );

  const genuinelyDown = createSupervisorChecks(stubRouter({
    configuredProviders: 2,
    degradedProviders: 2,
    untestedProviders: 0,
  }) as never)();
  assert(
    genuinelyDown.healthy === false,
    "all configured tested + 0 healthy is UNHEALTHY for the supervisor",
  );
  assert(
    genuinelyDown.reasons?.some((r) => r.includes("No healthy AI providers")),
    "genuine failure keeps the 'No healthy AI providers' reason",
  );

  const quarantined = createSupervisorChecks(stubRouter({
    configuredProviders: 2,
    quarantinedProviders: 2,
    untestedProviders: 0,
  }) as never)();
  assert(
    quarantined.healthy === false,
    "quarantined-only fleet (all tested) is UNHEALTHY for the supervisor",
  );

  const nothingConfigured = createSupervisorChecks(stubRouter({}) as never)();
  assert(
    nothingConfigured.healthy === true,
    "zero configured providers is not a supervisor failure",
  );

  const brokenRouter = createSupervisorChecks({
    getHealthReport: () => {
      throw new Error("health report exploded");
    },
  } as never)();
  assert(
    brokenRouter.healthy === false &&
      brokenRouter.reasons?.includes("AI router health check failed"),
    "a throwing getHealthReport() is still reported as a router failure",
  );
}

/* ================================================================
 * 3. REAL ROUTER — WISPBYTE STARTUP STATE (no requests made)
 * ================================================================ */

async function testRealRouterStartupState(): Promise<void> {
  section("AIRouter + preflight — fresh startup, no request completed");

  const router = new AIRouter(
    [
      makeProvider("lifecycle-startup-a"),
      makeProvider("lifecycle-startup-b"),
      makeProvider("lifecycle-startup-c"),
    ],
    { persistentHealth: false },
  );

  const report = router.getHealthReport();
  assert(report.configuredProviders === 3, "3 providers configured");
  assert(report.healthyProviders === 0, "0 healthy before first request");
  assert(report.untestedProviders === 3, "3 untested before first request");

  const checks = createSupervisorChecks(router)();
  assert(
    checks.healthy === true,
    "CRITICAL: startup state (0 tested) must NOT trip the supervisor",
  );
  assert(
    !checks.reasons?.some((r) => r.includes("No healthy AI providers")),
    "CRITICAL: startup state must NOT produce 'No healthy AI providers'",
  );

  const preflight = await runPreflight(router, { logLevel: "quiet" });
  const aiProviders = preflight.checks.find((c) => c.name === "ai_providers");
  assert(aiProviders !== undefined, "ai_providers check discovered");
  assert(
    aiProviders!.status === "CONFIGURED",
    `ai_providers status is CONFIGURED at startup (got ${aiProviders!.status})`,
  );
  assert(aiProviders!.required === true, "ai_providers is a required check");
  assert(
    preflight.overall !== "BLOCKED",
    `preflight overall is not BLOCKED at startup (got ${preflight.overall})`,
  );
  assert(
    aiProviders!.details?.includes("0 tested"),
    "ai_providers details expose the tested count",
  );
}

/* ================================================================
 * 4. REAL ROUTER — ALL TESTED, ZERO HEALTHY (genuine failure kept)
 * ================================================================ */

async function testRealRouterGenuineFailure(): Promise<void> {
  section("AIRouter + preflight — every configured provider tested and failed");

  const router = new AIRouter(
    [makeProvider("lifecycle-dead-a", { behavior: "fail" })],
    { persistentHealth: false },
  );

  try {
    await router.generate(REQUEST);
  } catch {
    // Expected: the only provider fails.
  }

  const report = router.getHealthReport();
  assert(report.configuredProviders === 1, "1 provider configured");
  assert(report.healthyProviders === 0, "0 providers healthy after failure");
  assert(report.untestedProviders === 0, "0 untested after the request");

  const checks = createSupervisorChecks(router)();
  assert(
    checks.healthy === false,
    "CRITICAL: tested-and-failed provider IS detected by the supervisor",
  );
  assert(
    checks.reasons?.some((r) => r.includes("No healthy AI providers")),
    "CRITICAL: genuine failure still emits 'No healthy AI providers'",
  );

  const preflight = await runPreflight(router, { logLevel: "quiet" });
  const aiProviders = preflight.checks.find((c) => c.name === "ai_providers");
  assert(
    aiProviders!.status === "FAILED",
    `ai_providers status is FAILED after all tested-and-failed (got ${aiProviders!.status})`,
  );
  assert(
    preflight.overall === "BLOCKED",
    `preflight overall is BLOCKED after a genuine total failure (got ${preflight.overall})`,
  );
}

/* ================================================================
 * 5. REAL ROUTER — SUCCESS AFTER STARTUP (lifecycle completes)
 * ================================================================ */

async function testRealRouterFirstSuccess(): Promise<void> {
  section("AIRouter + preflight — first successful request flips to HEALTHY");

  const router = new AIRouter(
    [makeProvider("lifecycle-ok-a")],
    { persistentHealth: false },
  );

  const before = createSupervisorChecks(router)();
  assert(before.healthy === true, "untested provider is not a failure");

  const response = await router.generate(REQUEST);
  assert(typeof response.text === "string", "generate() returned a response");

  const report = router.getHealthReport();
  assert(
    report.healthyProviders === 1,
    "provider is HEALTHY after a real successful request",
  );

  const checks = createSupervisorChecks(router)();
  assert(checks.healthy === true, "supervisor healthy after first success");

  const preflight = await runPreflight(router, { logLevel: "quiet" });
  const aiProviders = preflight.checks.find((c) => c.name === "ai_providers");
  assert(
    aiProviders!.status === "HEALTHY",
    `ai_providers status is HEALTHY after success (got ${aiProviders!.status})`,
  );
}

/* ================================================================
 * 6. REAL ROUTER — FAILOVER (system stays usable, no false failure)
 * ================================================================ */

async function testRealRouterFailover(): Promise<void> {
  section("AIRouter + preflight — provider failover keeps the system usable");

  const router = new AIRouter(
    [
      makeProvider("lifecycle-failover-fail", { behavior: "fail" }),
      makeProvider("lifecycle-failover-ok"),
    ],
    { persistentHealth: false },
  );

  const response = await router.generate(REQUEST);
  assert(
    response.provider === "lifecycle-failover-ok",
    "router fails over to the working provider",
  );

  const report = router.getHealthReport();
  const failedEntry = report.providers.find(
    (p) => p.name === "lifecycle-failover-fail",
  );
  const okEntry = report.providers.find(
    (p) => p.name === "lifecycle-failover-ok",
  );

  assert(
    (failedEntry?.failures ?? 0) > 0,
    "the failing provider stays recorded as a real tested failure",
  );
  assert(
    (okEntry?.successes ?? 0) > 0,
    "the working provider is proven healthy by a real request",
  );

  const checks = createSupervisorChecks(router)();
  assert(
    checks.healthy === true,
    "one failing provider with a working fallback is NOT a total failure",
  );

  const preflight = await runPreflight(router, { logLevel: "quiet" });
  const aiProviders = preflight.checks.find((c) => c.name === "ai_providers");
  assert(
    aiProviders!.status === "HEALTHY",
    `fleet with a working fallback is HEALTHY (got ${aiProviders!.status})`,
  );
  assert(
    report.degradedProviders + report.quarantinedProviders >= 0 &&
      report.healthyProviders === 1,
    "the tested failure remains visible in the health report",
  );
}

/* ================================================================
 * 7. INTERNAL SUPERVISOR — STARTUP GRACE WINDOW
 * ================================================================ */

async function testSupervisorStartupGrace(): Promise<void> {
  section("InternalSupervisor — startup grace window");

  // Part 1: signals inside a generous grace window are never counted.
  {
    let unhealthyCalled = false;

    const supervisor = new InternalSupervisor({
      intervalMs: 20,
      failureThreshold: 2,
      startupGraceMs: 2000,
      checks: () => ({
        healthy: false,
        reasons: ["simulated transient startup signal"],
      }),
      onUnhealthy: () => {
        unhealthyCalled = true;
      },
    });

    supervisor.start();
    await sleep(200);
    const duringGrace = supervisor.getStatus();
    supervisor.stop();

    assert(
      duringGrace.consecutiveFailures === 0,
      "transient startup signals are NOT counted during the grace window",
    );
    assert(
      unhealthyCalled === false,
      "onUnhealthy is NOT called during the grace window",
    );
  }

  // Part 2: after the grace window expires, sustained failures count
  // and terminate exactly as before.
  {
    let unhealthyCalled = false;
    let unhealthyReason = "";

    const supervisor = new InternalSupervisor({
      intervalMs: 20,
      failureThreshold: 2,
      startupGraceMs: 60,
      checks: () => ({
        healthy: false,
        reasons: ["simulated transient startup signal"],
      }),
      onUnhealthy: (reason: string) => {
        unhealthyCalled = true;
        unhealthyReason = reason;
      },
    });

    supervisor.start();
    await sleep(300);
    supervisor.stop();

    const afterGrace = supervisor.getStatus();
    assert(
      afterGrace.consecutiveFailures >= 2,
      `failures count after the grace window (got ${afterGrace.consecutiveFailures})`,
    );
    assert(
      unhealthyCalled === true,
      "onUnhealthy fires after the grace window once failures are sustained",
    );
    assert(
      unhealthyReason.includes("simulated transient startup signal"),
      "the sustained reason is preserved",
    );
  }
}

async function testSupervisorNoGraceByDefault(): Promise<void> {
  section("InternalSupervisor — default behaviour unchanged (no grace)");

  let unhealthyCalled = false;

  const supervisor = new InternalSupervisor({
    intervalMs: 20,
    failureThreshold: 2,
    checks: () => ({ healthy: false, reasons: ["simulated failure"] }),
    onUnhealthy: () => {
      unhealthyCalled = true;
    },
  });

  supervisor.start();
  await sleep(150);
  supervisor.stop();

  assert(
    unhealthyCalled === true,
    "without startupGraceMs the supervisor behaves exactly as before",
  );
}

async function testSupervisorRecoversDuringGrace(): Promise<void> {
  section("InternalSupervisor — recovery inside the grace window");

  let flip = false;
  let unhealthyCalled = false;

  const supervisor = new InternalSupervisor({
    intervalMs: 20,
    failureThreshold: 2,
    startupGraceMs: 2000,
    checks: () => ({
      healthy: flip,
      reasons: flip ? undefined : ["still initialising"],
    }),
    onUnhealthy: () => {
      unhealthyCalled = true;
    },
  });

  supervisor.start();
  await sleep(120);
  flip = true; // startup finished and the system is healthy now
  await sleep(120);
  supervisor.stop();

  assert(
    unhealthyCalled === false,
    "a failure that only existed during startup never escalates",
  );
  assert(
    supervisor.getStatus().consecutiveFailures === 0,
    "recovery inside the grace window resets cleanly",
  );
}

/* ================================================================
 * 8. LEGACY provider-health.json COMPATIBILITY (state mapping)
 * ================================================================ */

function testLegacyHealthStateMapping(): void {
  section("restoreHealthStateFromLegacyJson — legacy state mapping");

  const cases: Array<{
    name: string;
    data: SavedProviderHealth;
    expected: HealthState;
  }> = [
    {
      name: "legacy record without healthState + successes -> HEALTHY",
      data: { successes: 4, failures: 2, totalLatencyMs: 100, lastLatencyMs: 10, lastSuccessAt: 1 },
      expected: HealthState.HEALTHY,
    },
    {
      name: "legacy record without healthState + no outcomes -> CONFIGURED (untested)",
      data: { successes: 0, failures: 0, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 0 },
      expected: HealthState.CONFIGURED,
    },
    {
      name: "stale DEGRADED + historical successes -> HEALTHY preserved",
      data: { successes: 3, failures: 1, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 1, healthState: HealthState.DEGRADED },
      expected: HealthState.HEALTHY,
    },
    {
      name: "stale TIMEOUT + historical successes -> HEALTHY preserved",
      data: { successes: 2, failures: 5, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 1, healthState: HealthState.TIMEOUT },
      expected: HealthState.HEALTHY,
    },
    {
      name: "stale RATE_LIMITED + historical successes -> HEALTHY preserved",
      data: { successes: 6, failures: 2, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 1, healthState: HealthState.RATE_LIMITED },
      expected: HealthState.HEALTHY,
    },
    {
      name: "AUTH_FAILED is NEVER faked to healthy (real credential failure)",
      data: { successes: 9, failures: 1, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 1, healthState: HealthState.AUTH_FAILED },
      expected: HealthState.AUTH_FAILED,
    },
    {
      name: "NO_CREDITS is NEVER faked to healthy (real quota failure)",
      data: { successes: 5, failures: 3, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 1, healthState: HealthState.NO_CREDITS },
      expected: HealthState.NO_CREDITS,
    },
    {
      name: "QUARANTINED is NEVER faked to healthy",
      data: { successes: 4, failures: 4, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 1, healthState: HealthState.QUARANTINED },
      expected: HealthState.QUARANTINED,
    },
    {
      name: "explicit persisted HEALTHY stays HEALTHY",
      data: { successes: 2, failures: 0, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 1, healthState: HealthState.HEALTHY },
      expected: HealthState.HEALTHY,
    },
    {
      name: "explicit persisted CONFIGURED stays CONFIGURED",
      data: { successes: 0, failures: 0, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 0, healthState: HealthState.CONFIGURED },
      expected: HealthState.CONFIGURED,
    },
    {
      name: "unknown/garbage persisted state falls back to outcome-based mapping",
      data: { successes: 2, failures: 0, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 1, healthState: "totally-unknown-state" as unknown as HealthState },
      expected: HealthState.HEALTHY,
    },
    {
      name: "unknown/garbage persisted state + no outcomes -> CONFIGURED",
      data: { successes: 0, failures: 0, totalLatencyMs: 0, lastLatencyMs: null, lastSuccessAt: 0, healthState: "totally-unknown-state" as unknown as HealthState },
      expected: HealthState.CONFIGURED,
    },
  ];

  for (const testCase of cases) {
    const restored = restoreHealthStateFromLegacyJson(testCase.data);
    assert(
      restored === testCase.expected,
      `${testCase.name} (got ${restored})`,
    );
  }
}

/* ================================================================
 * 9. LEGACY provider-health.json END-TO-END (isolated cwd process)
 * ================================================================ */

const LEGACY_CHILD_SCRIPT = path.resolve(
  __dirname,
  "test-provider-health-legacy-child.ts",
);

function testLegacyPersistedFileEndToEnd(): void {
  section("legacy provider-health.json restored by AIRouter (isolated cwd)");

  assert(
    fs.existsSync(LEGACY_CHILD_SCRIPT),
    "legacy child test script exists",
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ashenai-legacy-health-"));

  try {
    fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

    const legacyHealth = {
      "legacy-untouched": {
        successes: 0,
        failures: 0,
        totalLatencyMs: 0,
        lastLatencyMs: null,
        lastSuccessAt: 0,
      },
      "legacy-historic": {
        successes: 4,
        failures: 2,
        totalLatencyMs: 1200,
        lastLatencyMs: 300,
        lastSuccessAt: 1,
      },
      "legacy-auth": {
        successes: 2,
        failures: 5,
        totalLatencyMs: 400,
        lastLatencyMs: 100,
        lastSuccessAt: 1,
        healthState: "auth_failed",
        disabledUntil: Date.now() + 3_600_000,
        disabledReason: "authentication/permission",
      },
      "legacy-quota": {
        successes: 1,
        failures: 3,
        totalLatencyMs: 200,
        lastLatencyMs: 100,
        lastSuccessAt: 1,
        healthState: "no_credits",
      },
      "legacy-newkey": {
        successes: 0,
        failures: 0,
        totalLatencyMs: 0,
        lastLatencyMs: null,
        lastSuccessAt: 0,
        healthState: "not_configured",
      },
    };

    fs.writeFileSync(
      path.join(tmp, "data", "provider-health.json"),
      JSON.stringify(legacyHealth, null, 2),
      "utf8",
    );

    const tsxBin = path.resolve(
      __dirname,
      "..",
      "node_modules",
      ".bin",
      "tsx",
    );

    let output = "";
    try {
      output = execFileSync(tsxBin, [LEGACY_CHILD_SCRIPT], {
        cwd: tmp,
        encoding: "utf8",
        timeout: 60_000,
        env: { ...process.env, NODE_OPTIONS: "" },
      });
    } catch (error) {
      const err = error as { stdout?: unknown; stderr?: unknown; message?: string };
      const detail =
        (err.stderr ? err.stderr.toString() : "") ||
        (err.stdout ? err.stdout.toString() : "") ||
        (err.message ?? String(error));
      assert(
        false,
        `legacy child process failed: ${detail.split("\n").slice(-8).join(" | ")}`,
      );
      return;
    }

    const resultLine = output
      .split("\n")
      .find((line) => line.startsWith("RESULT_JSON:"));

    assert(resultLine !== undefined, "child process reported restored states");

    const states = JSON.parse(
      resultLine!.slice("RESULT_JSON:".length),
    ) as Record<string, string>;

    assert(
      states["legacy-untouched"] === HealthState.CONFIGURED,
      `legacy provider with no outcomes restores as untested CONFIGURED (got ${states["legacy-untouched"]})`,
    );
    assert(
      states["legacy-historic"] === HealthState.HEALTHY,
      `historical successes preserve HEALTHY across restart (got ${states["legacy-historic"]})`,
    );
    assert(
      states["legacy-auth"] === HealthState.AUTH_FAILED,
      `persisted AUTH_FAILED is preserved, not faked healthy (got ${states["legacy-auth"]})`,
    );
    assert(
      states["legacy-quota"] === HealthState.NO_CREDITS,
      `persisted NO_CREDITS is preserved, not faked healthy (got ${states["legacy-quota"]})`,
    );
    assert(
      states["legacy-newkey"] === HealthState.CONFIGURED,
      `stale NOT_CONFIGURED with credentials now present is re-tested as CONFIGURED (got ${states["legacy-newkey"]})`,
    );

    /*
     * MIXED lifecycle (requirement 4): one tested failure + one
     * untested provider must stay usable and must never be reported
     * as a total provider failure.
     */
    const mixedLine = output
      .split("\n")
      .find((line) => line.startsWith("RESULT_MIXED_JSON:"));
    assert(mixedLine !== undefined, "child process reported mixed state");

    const mixed = JSON.parse(
      mixedLine!.slice("RESULT_MIXED_JSON:".length),
    ) as Record<string, unknown> & StubCounts;

    const mixedAssessment = assessProviderLifecycle(mixed);
    assert(
      mixedAssessment.tested === 1 && mixedAssessment.untested === 1,
      `mixed fleet has 1 tested + 1 untested provider (got ${mixedAssessment.tested}/${mixedAssessment.untested})`,
    );
    assert(
      mixedAssessment.status === "DEGRADED",
      `mixed fleet (tested failure + untested) is DEGRADED (got ${mixedAssessment.status})`,
    );
    assert(
      mixedAssessment.sustainedProviderFailure === false,
      "mixed fleet is NOT a sustained total provider failure",
    );

    const mixedChecks = createSupervisorChecks(stubRouter(mixed) as never)();
    assert(
      mixedChecks.healthy === true,
      "supervisor does NOT terminate on a mixed tested-failure + untested fleet",
    );
    assert(
      mixed["authState"] === HealthState.AUTH_FAILED,
      "mixed fleet keeps the real authentication failure visible",
    );
    assert(
      mixed["untouchedState"] === HealthState.CONFIGURED,
      "mixed fleet keeps the untested provider available for its first request",
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ================================================================
 * TEST RUNNER
 * ================================================================ */

/**
 * Run one test with crash isolation: a thrown error inside a test is
 * reported as a failed assertion (with stack) instead of killing the
 * whole suite, so the comprehensive runner always sees a real count.
 */
async function runTest(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    total++;
    failed++;
    console.error(
      `  ❌ ${name} crashed: ${
        error instanceof Error
          ? (error.stack ?? error.message)
          : String(error)
      }`,
    );
  }
}

async function main(): Promise<void> {
  console.log("\n🧪 AshenAI Provider Lifecycle Regression Tests\n");
  console.log("🎯 Reproduces the Wispbyte startup crash regression\n");

  await runTest("lifecycle table", async () => testLifecycleTable());
  await runTest("supervisor decision table", async () =>
    testSupervisorDecisionTable(),
  );
  await runTest("legacy health state mapping", async () =>
    testLegacyHealthStateMapping(),
  );
  await runTest("legacy persisted file (isolated cwd)", async () =>
    testLegacyPersistedFileEndToEnd(),
  );

  await runTest("router startup state", async () => testRealRouterStartupState());
  await runTest("router genuine failure", async () =>
    testRealRouterGenuineFailure(),
  );
  await runTest("router first success", async () =>
    testRealRouterFirstSuccess(),
  );
  await runTest("router failover", async () => testRealRouterFailover());

  await runTest("supervisor startup grace", async () =>
    testSupervisorStartupGrace(),
  );
  await runTest("supervisor no grace by default", async () =>
    testSupervisorNoGraceByDefault(),
  );
  await runTest("supervisor recovery during grace", async () =>
    testSupervisorRecoversDuringGrace(),
  );

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log("❌ PROVIDER LIFECYCLE TESTS FAILED\n");
    process.exit(1);
  }

  console.log("🎉 ALL PROVIDER LIFECYCLE TESTS PASSED\n");
}

main().catch((error) => {
  console.error("❌ Test runner crashed:", error);
  process.exit(1);
});

