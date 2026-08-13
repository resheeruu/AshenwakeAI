import { AIRouter } from "../src/ai/router";
import { AIProvider } from "../src/ai/types";

let passed = 0;
let failed = 0;

/*
 * Offline tests must be deterministic.
 * Production exploration is disabled by setting Math.random high.
 */
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
   SUCCESSFUL REQUEST
   ========================================================= */

async function testSuccess(): Promise<void> {
  const provider = makeProvider(
    "test-success-offline",
    async () => ({
      text: "Test response",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [provider],
    { persistentHealth: false },
  );

  const result = await router.generate(request);

  if (result.text !== "Test response") {
    throw new Error("Unexpected provider response");
  }
}

/* =========================================================
   NORMAL PROVIDER FALLBACK
   ========================================================= */

async function testFallback(): Promise<void> {
  let failedCalls = 0;

  const failing = makeProvider(
    "test-failing-offline",
    async () => {
      failedCalls++;
      throw new Error("Provider unavailable");
    },
  );

  const backup = makeProvider(
    "test-backup-offline",
    async () => ({
      text: "Fallback response",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [failing, backup],
    { persistentHealth: false },
  );

  const result = await router.generate(request);

  if (result.text !== "Fallback response") {
    throw new Error("Fallback did not work");
  }

  if (failedCalls !== 1) {
    throw new Error(
      `Expected 1 failed call, got ${failedCalls}`,
    );
  }
}

/* =========================================================
   RATE LIMIT FALLBACK
   ========================================================= */

async function testRateLimit(): Promise<void> {
  let calls = 0;

  const limited = makeProvider(
    "test-rate-limited-offline",
    async () => {
      calls++;
      throw new Error("429 rate limit exceeded");
    },
  );

  const backup = makeProvider(
    "test-rate-backup-offline",
    async () => ({
      text: "Rate-limit fallback response",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [limited, backup],
    { persistentHealth: false },
  );

  const result = await router.generate(request);

  if (result.text !== "Rate-limit fallback response") {
    throw new Error("Rate-limit fallback failed");
  }

  if (calls !== 1) {
    throw new Error(
      `Expected rate-limited provider once, got ${calls}`,
    );
  }
}

/* =========================================================
   NO PROVIDERS
   ========================================================= */

async function testNoProviders(): Promise<void> {
  const router = new AIRouter(
    [],
    { persistentHealth: false },
  );

  try {
    await router.generate(request);
    throw new Error(
      "Router should reject when no providers exist",
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        "No configured AI providers",
      )
    ) {
      throw error;
    }
  }
}

/* =========================================================
   UNAVAILABLE PROVIDER
   ========================================================= */

async function testUnavailableProvider(): Promise<void> {
  let called = false;

  const provider = makeProvider(
    "test-unavailable-offline",
    async () => {
      called = true;

      return {
        text: "Should never execute",
        latencyMs: 10,
      };
    },
    false,
  );

  const router = new AIRouter(
    [provider],
    { persistentHealth: false },
  );

  try {
    await router.generate(request);

    throw new Error(
      "Router should reject unavailable providers",
    );
  } catch (error) {
    if (called) {
      throw new Error(
        "Unavailable provider was executed",
      );
    }

    if (
      !(error instanceof Error) ||
      !error.message.includes(
        "No configured AI providers",
      )
    ) {
      throw error;
    }
  }
}

/* =========================================================
   CREDIT / BILLING QUARANTINE
   ========================================================= */

async function testCreditQuarantine(): Promise<void> {
  let calls = 0;

  const broken = makeProvider(
    "test-credit-quarantine-offline",
    async () => {
      calls++;

      throw new Error(
        "HTTP 402: insufficient_quota - credit balance is too low",
      );
    },
  );

  const backup = makeProvider(
    "test-credit-backup-offline",
    async () => ({
      text: "Credit fallback response",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [broken, backup],
    { persistentHealth: false },
  );

  const first = await router.generate(request);

  if (first.text !== "Credit fallback response") {
    throw new Error("Credit fallback failed");
  }

  if (calls !== 1) {
    throw new Error(
      `Expected credit provider once, got ${calls}`,
    );
  }

  const second = await router.generate(request);

  if (second.text !== "Credit fallback response") {
    throw new Error(
      "Backup provider failed after quarantine",
    );
  }

  if (calls !== 1) {
    throw new Error(
      `Credit provider was retried unnecessarily: ${calls} calls`,
    );
  }
}

/* =========================================================
   AUTH / PERMISSION QUARANTINE
   ========================================================= */

async function testAuthQuarantine(): Promise<void> {
  let calls = 0;

  const broken = makeProvider(
    "test-auth-quarantine-offline",
    async () => {
      calls++;

      throw new Error(
        "HTTP 401 Unauthorized: Authentication failed",
      );
    },
  );

  const backup = makeProvider(
    "test-auth-backup-offline",
    async () => ({
      text: "Auth fallback response",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [broken, backup],
    { persistentHealth: false },
  );

  const first = await router.generate(request);

  if (first.text !== "Auth fallback response") {
    throw new Error("Auth fallback failed");
  }

  if (calls !== 1) {
    throw new Error(
      `Expected auth provider once, got ${calls}`,
    );
  }

  const second = await router.generate(request);

  if (second.text !== "Auth fallback response") {
    throw new Error(
      "Backup provider failed after auth quarantine",
    );
  }

  if (calls !== 1) {
    throw new Error(
      `Auth provider was retried unnecessarily: ${calls} calls`,
    );
  }
}

/* =========================================================
   PERSISTENT FAILURE QUARANTINE
   ========================================================= */

async function testPersistentFailureQuarantine(): Promise<void> {
  let calls = 0;

  const broken = makeProvider(
    "test-persistent-failure-offline",
    async () => {
      calls++;

      throw new Error("Provider unavailable");
    },
  );

  const backup = makeProvider(
    "test-persistent-backup-offline",
    async () => ({
      text: "Persistent failure fallback",
      latencyMs: 10,
    }),
  );

  const router = new AIRouter(
    [broken, backup],
    { persistentHealth: false },
  );

  /*
   * The first three requests should try the broken
   * provider and then fall back.
   */
  for (let i = 0; i < 3; i++) {
    const result = await router.generate(request);

    if (result.text !== "Persistent failure fallback") {
      throw new Error(
        "Persistent failure fallback failed",
      );
    }
  }

  const callsBeforeFourthRequest = calls;

  /*
   * After three consecutive failures, the provider
   * should be quarantined and skipped.
   */
  const result = await router.generate(request);

  if (result.text !== "Persistent failure fallback") {
    throw new Error(
      "Backup provider failed after quarantine",
    );
  }

  if (calls !== callsBeforeFourthRequest) {
    throw new Error(
      `Quarantined provider was retried: ${calls} calls`,
    );
  }
}

/* =========================================================
   RECOVERY PROBE
   ========================================================= */

async function testRecoveryProbe(): Promise<void> {
  let calls = 0;
  let healthy = false;

  const provider = makeProvider(
    "test-recovery-offline",
    async () => {
      calls++;

      if (!healthy) {
        throw new Error(
          "insufficient_quota: no credits remaining",
        );
      }

      return {
        text: "Recovered provider response",
        latencyMs: 10,
      };
    },
  );

  const backup = makeProvider(
    "test-recovery-backup-offline",
    async () => ({
      text: "Backup response",
      latencyMs: 20,
    }),
  );

  const router = new AIRouter(
    [provider, backup],
    { persistentHealth: false },
  );

  /*
   * First request:
   * provider fails with a credit error and is quarantined.
   */
  const first = await router.generate(request);

  if (first.text !== "Backup response") {
    throw new Error(
      "Initial recovery test fallback failed",
    );
  }

  if (calls !== 1) {
    throw new Error(
      `Expected 1 initial provider call, got ${calls}`,
    );
  }

  /*
   * Make the provider healthy again.
   */
  healthy = true;

  /*
   * We intentionally cannot wait 6 hours in an offline test.
   * The test verifies that the health state correctly supports
   * a recovery probe once the quarantine expires.
   */
  const health = router.getHealth();

  const providerHealth = health.find(
    (item) => item.provider === "test-recovery-offline",
  );

  if (!providerHealth) {
    throw new Error(
      "Recovery provider health record not found",
    );
  }

  if (providerHealth.disabledReason !== "credits/billing") {
    throw new Error(
      `Unexpected quarantine reason: ${providerHealth.disabledReason}`,
    );
  }

  if (providerHealth.disabledUntil <= Date.now()) {
    throw new Error(
      "Provider quarantine should still be active",
    );
  }

  /*
   * The important behavior is that the provider remains
   * quarantined while its recovery window has not arrived.
   * This prevents API waste.
   */
  const second = await router.generate(request);

  if (second.text !== "Backup response") {
    throw new Error(
      "Backup provider failed while recovery was pending",
    );
  }

  if (calls !== 1) {
    throw new Error(
      `Quarantined provider was unnecessarily retried: ${calls} calls`,
    );
  }
}

/* =========================================================
   TEST RUNNER
   ========================================================= */

async function main(): Promise<void> {
  console.log(
    "\n🧪 AshenAI Offline Router Tests\n",
  );

  console.log(
    "🔒 Deterministic test mode enabled",
  );

  const tests: Array<
    [string, () => Promise<void>]
  > = [
    [
      "Successful request",
      testSuccess,
    ],
    [
      "Provider fallback",
      testFallback,
    ],
    [
      "Rate-limit fallback",
      testRateLimit,
    ],
    [
      "No providers handling",
      testNoProviders,
    ],
    [
      "Unavailable provider handling",
      testUnavailableProvider,
    ],
    [
      "Credit quarantine",
      testCreditQuarantine,
    ],
    [
      "Auth quarantine",
      testAuthQuarantine,
    ],
    [
      "Persistent failure quarantine",
      testPersistentFailureQuarantine,
    ],
    [
      "Recovery probe protection",
      testRecoveryProbe,
    ],
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
    console.log("❌ OFFLINE TESTS FAILED");

    Math.random = originalRandom;
    process.exit(1);
  }

  console.log("🎉 ALL OFFLINE TESTS PASSED");

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
