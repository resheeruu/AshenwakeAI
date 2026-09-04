import { AIRouter } from "../src/ai/router";
import { AIProvider, HealthState } from "../src/ai/types";
import { setCacheEnabled } from "../src/ai/response-cache";

let passed = 0;
let failed = 0;

setCacheEnabled(false);
const originalRandom = Math.random;
Math.random = () => 0.999999;

function pass(name: string): void {
  passed++;
  console.log(`✅ ${name}`);
}

function fail(name: string, error: unknown): void {
  failed++;
  console.error(`❌ ${name}`);
  console.error(
    error instanceof Error ? error.message : String(error),
  );
}

function makeProvider(
  name: string,
  generate: AIProvider["generate"],
  available = true,
): AIProvider {
  return {
    name,
    isAvailable: () => available,
    generate,
  };
}

const request = {
  messages: [
    {
      role: "user" as const,
      content: "offline test",
    },
  ],
  temperature: 0.7,
  maxTokens: 100,
};

/* =========================================================
   HEALTH STATE ENUM
   ========================================================= */

async function testHealthStateEnum(): Promise<void> {
  const provider = makeProvider(
    "test-healthstate-enum-offline",
    async () => ({
      text: "ok",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider],
    { persistentHealth: false },
  );

  const health = router.getHealth();
  const entry = health.find((h) => h.provider === "test-healthstate-enum-offline");

  if (!entry) {
    throw new Error("Health entry not found");
  }

  if (entry.healthState !== HealthState.CONFIGURED) {
    throw new Error(
      `Expected CONFIGURED, got ${entry.healthState}`,
    );
  }
}

/* =========================================================
   HEALTH STATE UPGRADE ON SUCCESS
   ========================================================= */

async function testHealthStateUpgrade(): Promise<void> {
  const provider = makeProvider(
    "test-healthstate-upgrade-offline",
    async () => ({
      text: "ok",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider],
    { persistentHealth: false },
  );

  await router.generate(request);

  const health = router.getHealth();
  const entry = health.find((h) => h.provider === "test-healthstate-upgrade-offline");

  if (!entry) {
    throw new Error("Health entry not found");
  }

  if (entry.healthState !== HealthState.HEALTHY) {
    throw new Error(
      `Expected HEALTHY after success, got ${entry.healthState}`,
    );
  }
}

/* =========================================================
   HEALTH STATE DOWNGRADE ON FAILURE
   ========================================================= */

async function testHealthStateDowngrade(): Promise<void> {
  const provider = makeProvider(
    "test-healthstate-downgrade-offline",
    async () => {
      throw new Error("Provider failed");
    },
  );

  const backup = makeProvider(
    "test-healthstate-downgrade-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider, backup],
    { persistentHealth: false },
  );

  await router.generate(request);

  const health = router.getHealth();
  const entry = health.find((h) => h.provider === "test-healthstate-downgrade-offline");

  if (!entry) {
    throw new Error("Health entry not found");
  }

  if (entry.healthState !== HealthState.DEGRADED) {
    throw new Error(
      `Expected DEGRADED after failure, got ${entry.healthState}`,
    );
  }
}

/* =========================================================
   TIMEOUT ERROR DETECTION
   ========================================================= */

async function testTimeoutDetection(): Promise<void> {
  const provider = makeProvider(
    "test-timeout-detection-offline",
    async () => {
      throw new Error("Request timed out after 15000ms");
    },
  );

  const backup = makeProvider(
    "test-timeout-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider, backup],
    { persistentHealth: false },
  );

  await router.generate(request);

  const health = router.getHealth();
  const entry = health.find((h) => h.provider === "test-timeout-detection-offline");

  if (!entry) {
    throw new Error("Health entry not found");
  }

  if (entry.healthState !== HealthState.TIMEOUT) {
    throw new Error(
      `Expected TIMEOUT, got ${entry.healthState}`,
    );
  }
}

/* =========================================================
   NETWORK ERROR DETECTION
   ========================================================= */

async function testNetworkErrorDetection(): Promise<void> {
  const provider = makeProvider(
    "test-network-detection-offline",
    async () => {
      throw new Error("fetch failed: ECONNREFUSED 127.0.0.1:8080");
    },
  );

  const backup = makeProvider(
    "test-network-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider, backup],
    { persistentHealth: false },
  );

  await router.generate(request);

  const health = router.getHealth();
  const entry = health.find((h) => h.provider === "test-network-detection-offline");

  if (!entry) {
    throw new Error("Health entry not found");
  }

  if (entry.healthState !== HealthState.NETWORK_ERROR) {
    throw new Error(
      `Expected NETWORK_ERROR, got ${entry.healthState}`,
    );
  }
}

/* =========================================================
   AUTH ERROR HEALTH STATE
   ========================================================= */

async function testAuthErrorHealthState(): Promise<void> {
  const provider = makeProvider(
    "test-auth-healthstate-offline",
    async () => {
      throw new Error("HTTP 401 Unauthorized: invalid api key");
    },
  );

  const backup = makeProvider(
    "test-auth-healthstate-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider, backup],
    { persistentHealth: false },
  );

  await router.generate(request);

  const health = router.getHealth();
  const entry = health.find((h) => h.provider === "test-auth-healthstate-offline");

  if (!entry) {
    throw new Error("Health entry not found");
  }

  if (entry.healthState !== HealthState.AUTH_FAILED) {
    throw new Error(
      `Expected AUTH_FAILED, got ${entry.healthState}`,
    );
  }
}

/* =========================================================
   CREDIT ERROR HEALTH STATE
   ========================================================= */

async function testCreditErrorHealthState(): Promise<void> {
  const provider = makeProvider(
    "test-credit-healthstate-offline",
    async () => {
      throw new Error("insufficient_quota: credit balance is too low");
    },
  );

  const backup = makeProvider(
    "test-credit-healthstate-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider, backup],
    { persistentHealth: false },
  );

  await router.generate(request);

  const health = router.getHealth();
  const entry = health.find((h) => h.provider === "test-credit-healthstate-offline");

  if (!entry) {
    throw new Error("Health entry not found");
  }

  if (entry.healthState !== HealthState.NO_CREDITS) {
    throw new Error(
      `Expected NO_CREDITS, got ${entry.healthState}`,
    );
  }
}

/* =========================================================
   RATE LIMIT HEALTH STATE
   ========================================================= */

async function testRateLimitHealthState(): Promise<void> {
  const provider = makeProvider(
    "test-ratelimit-healthstate-offline",
    async () => {
      throw new Error("429 rate limit exceeded");
    },
  );

  const backup = makeProvider(
    "test-ratelimit-healthstate-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider, backup],
    { persistentHealth: false },
  );

  await router.generate(request);

  const health = router.getHealth();
  const entry = health.find((h) => h.provider === "test-ratelimit-healthstate-offline");

  if (!entry) {
    throw new Error("Health entry not found");
  }

  if (entry.healthState !== HealthState.RATE_LIMITED) {
    throw new Error(
      `Expected RATE_LIMITED, got ${entry.healthState}`,
    );
  }
}

/* =========================================================
   MODEL-LEVEL HEALTH TRACKING
   ========================================================= */

async function testModelLevelTracking(): Promise<void> {
  let callCount = 0;

  const provider = makeProvider(
    "test-model-tracking-offline",
    async (req) => {
      callCount++;
      const model = req.model || "default";

      if (model === "bad-model") {
        throw new Error("Model not available");
      }

      return {
        text: "ok",
        model,
        latencyMs: 10,
      };
    },
  );

  const backup = makeProvider(
    "test-model-tracking-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider, backup],
    { persistentHealth: false },
  );

  // Success with good-model.
  await router.generate({
    ...request,
    model: "good-model",
  });

  // Failure with bad-model.
  await router.generate({
    ...request,
    model: "bad-model",
  });

  const health = router.getHealth();
  const entry = health.find((h) => h.provider === "test-model-tracking-offline");

  if (!entry) {
    throw new Error("Health entry not found");
  }

  if (!entry.modelHealth) {
    throw new Error("Model health not tracked");
  }

  const goodModel = entry.modelHealth["good-model"];
  const badModel = entry.modelHealth["bad-model"];

  if (!goodModel) {
    throw new Error("Good model health not found");
  }

  if (!badModel) {
    throw new Error("Bad model health not found");
  }

  if (goodModel.successes !== 1) {
    throw new Error(
      `Good model expected 1 success, got ${goodModel.successes}`,
    );
  }

  if (badModel.failures !== 1) {
    throw new Error(
      `Bad model expected 1 failure, got ${badModel.failures}`,
    );
  }
}

/* =========================================================
   HTTP STATUS EXTRACTION
   ========================================================= */

async function testHttpStatusExtraction(): Promise<void> {
  const provider = makeProvider(
    "test-http-status-offline",
    async () => {
      throw new Error("HTTP 503 Service Unavailable");
    },
  );

  const backup = makeProvider(
    "test-http-status-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider, backup],
    { persistentHealth: false },
  );

  await router.generate(request);

  const health = router.getHealth();
  const entry = health.find((h) => h.provider === "test-http-status-offline");

  if (!entry) {
    throw new Error("Health entry not found");
  }

  if (entry.lastHttpStatus !== 503) {
    throw new Error(
      `Expected HTTP 503, got ${entry.lastHttpStatus}`,
    );
  }
}

/* =========================================================
   HEALTH REPORT
   ========================================================= */

async function testHealthReport(): Promise<void> {
  let degradedCallCount = 0;

  const degraded = makeProvider(
    "test-report-degraded-offline",
    async () => {
      degradedCallCount++;
      throw new Error("temp failure");
    },
  );

  const backup = makeProvider(
    "test-report-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [degraded, backup],
    { persistentHealth: false },
  );

  // Make degraded provider fail once.
  await router.generate(request);

  const report = router.getHealthReport();

  if (report.totalProviders !== 2) {
    throw new Error(
      `Expected 2 total providers, got ${report.totalProviders}`,
    );
  }

  if (report.configuredProviders !== 2) {
    throw new Error(
      `Expected 2 configured providers, got ${report.configuredProviders}`,
    );
  }

  const degradedEntry = report.providers.find(
    (p) => p.name === "test-report-degraded-offline",
  );

  if (!degradedEntry) {
    throw new Error("Degraded entry not in report");
  }

  if (degradedEntry.healthState !== HealthState.DEGRADED) {
    throw new Error(
      `Expected degraded entry to be DEGRADED, got ${degradedEntry.healthState}`,
    );
  }

  if (degradedEntry.failures !== 1) {
    throw new Error(
      `Expected 1 failure, got ${degradedEntry.failures}`,
    );
  }
}

/* =========================================================
   QUARANTINE STATE IN HEALTH REPORT
   ========================================================= */

async function testQuarantineStateInReport(): Promise<void> {
  const broken = makeProvider(
    "test-report-quarantine-offline",
    async () => {
      throw new Error("insufficient_quota: no credits");
    },
  );

  const backup = makeProvider(
    "test-report-quarantine-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [broken, backup],
    { persistentHealth: false },
  );

  await router.generate(request);

  const report = router.getHealthReport();

  const brokenEntry = report.providers.find(
    (p) => p.name === "test-report-quarantine-offline",
  );

  if (!brokenEntry) {
    throw new Error("Broken entry not in report");
  }

  if (!brokenEntry.quarantined) {
    throw new Error("Expected broken entry to be quarantined");
  }

  if (brokenEntry.healthState !== HealthState.NO_CREDITS) {
    throw new Error(
      `Expected NO_CREDITS, got ${brokenEntry.healthState}`,
    );
  }

  if (report.quarantinedProviders !== 1) {
    throw new Error(
      `Expected 1 quarantined provider, got ${report.quarantinedProviders}`,
    );
  }
}

/* =========================================================
   NOT CONFIGURED PROVIDER STATE
   ========================================================= */

async function testNotConfiguredState(): Promise<void> {
  const provider = makeProvider(
    "test-not-configured-offline",
    async () => ({
      text: "ok",
      latencyMs: 10,
    }),
    false, // not available
  );

  const backup = makeProvider(
    "test-not-configured-backup-offline",
    async () => ({
      text: "backup",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider, backup],
    { persistentHealth: false },
  );

  const report = router.getHealthReport();

  const entry = report.providers.find(
    (p) => p.name === "test-not-configured-offline",
  );

  if (!entry) {
    throw new Error("Entry not in report");
  }

  if (entry.healthState !== HealthState.NOT_CONFIGURED) {
    throw new Error(
      `Expected NOT_CONFIGURED, got ${entry.healthState}`,
    );
  }

  if (entry.configured !== false) {
    throw new Error("Expected configured=false");
  }
}

/* =========================================================
   TEST RUNNER
   ========================================================= */

async function main(): Promise<void> {
  console.log(
    "\n🧪 AshenAI Provider Health Tests\n",
  );

  console.log(
    "🔒 Deterministic test mode enabled",
  );

  const tests: Array<
    [string, () => Promise<void>]
  > = [
    ["HealthState enum initialization", testHealthStateEnum],
    ["HealthState upgrade on success", testHealthStateUpgrade],
    ["HealthState downgrade on failure", testHealthStateDowngrade],
    ["Timeout error detection", testTimeoutDetection],
    ["Network error detection", testNetworkErrorDetection],
    ["Auth error health state", testAuthErrorHealthState],
    ["Credit error health state", testCreditErrorHealthState],
    ["Rate limit health state", testRateLimitHealthState],
    ["Model-level health tracking", testModelLevelTracking],
    ["HTTP status extraction", testHttpStatusExtraction],
    ["Health report structure", testHealthReport],
    ["Quarantine state in report", testQuarantineStateInReport],
    ["Not configured provider state", testNotConfiguredState],
  ];

  for (const [name, test] of tests) {
    try {
      await test();
      pass(name);
    } catch (error) {
      fail(name, error);
    }
  }

  console.log(
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log("❌ PROVIDER HEALTH TESTS FAILED");

    Math.random = originalRandom;
    process.exit(1);
  }

  console.log("🎉 ALL PROVIDER HEALTH TESTS PASSED");

  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
  );

  Math.random = originalRandom;
}

main().catch((error) => {
  Math.random = originalRandom;

  console.error(
    "❌ Test runner crashed:",
    error,
  );

  process.exit(1);
});
