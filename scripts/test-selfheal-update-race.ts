#!/usr/bin/env node
/* ================================================================
 * SELF-HEALER / UPDATE-MANAGER COORDINATION RACE TESTS
 *
 * Regression tests for the production fix that makes the update
 * manager and the Self-Healer cooperate during deployments.
 *
 * Invariants under test:
 *   1. While an update/rollback mutates sources, the Self-Healer
 *      performs ZERO scans, ZERO verifications, ZERO AI repairs,
 *      ZERO source writes.
 *   2. The update manager never runs git while a heal is in flight
 *      (quiesce with bounded timeout; timeout aborts the update).
 *   3. The healer stays suspended across the restart window and
 *      re-baselines on resume (no verification storm on the pulled
 *      tree), then returns to its ordinary repair pipeline.
 *
 * All expensive runners (git, tsc, npm test) are injected fakes —
 * deterministic, no synthetic CPU load.
 * ================================================================ */

import fs from "node:fs";
import path from "node:path";

/* The update manager captures data-file paths at module load, so
 * ASHENAI_DATA_DIR must exist before it is imported. The test runner
 * sets it (isolated TEST_DATA_DIR); standalone runs get a temp dir. */
const OWN_DATA_DIR = !process.env.ASHENAI_DATA_DIR;
process.env.ASHENAI_DATA_DIR ??= path.join(
  process.cwd(),
  "data",
  ".test-race-data",
);

const DATA_DIR = process.env.ASHENAI_DATA_DIR as string;
const LOCK_PATH = path.join(DATA_DIR, ".update-lock");
const RACE_DIR = path.join(process.cwd(), "scripts", ".selfheal-race");
const SELF_HEAL_PATH = path.join(process.cwd(), "src", "agent", "selfHeal.ts");
const RACE_FILES = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];

let passed = 0;
let failed = 0;

function pass(name: string): void {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown): void {
  console.error(`❌ ${name}`, error !== undefined ? error : "");
  failed++;
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected "${String(expected)}", got "${String(actual)}"`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function touch(name: string): void {
  fs.appendFileSync(
    path.join(RACE_DIR, name),
    `\n// touched ${Date.now()}-${Math.random()}\n`,
  );
}

async function main(): Promise<void> {
  console.log("\n🧪 Self-Healer / Update-Manager Coordination Race Tests\n");

  /* ================================================================
   * SETUP
   * ================================================================ */

  try {
    fs.rmSync(RACE_DIR, { recursive: true, force: true });
    fs.mkdirSync(RACE_DIR, { recursive: true });
    for (const name of RACE_FILES) {
      fs.writeFileSync(
        path.join(RACE_DIR, name),
        `// race fixture ${name}\nexport {};\n`,
      );
    }
  } catch (error) {
    fail("setup: create race fixture dir", error);
    report();
    return;
  }

  const selfHeal = await import("../src/agent/selfHeal");
  const lifecycle = await import("../src/core/update-lifecycle");
  const um = await import("../src/core/update-manager");

  /* Fake verifier: deterministic tsc/test outputs. */
  type VerifierMode = "healthy" | "failing" | "blocking";
  let verifierMode: VerifierMode = "healthy";
  let releaseTypecheck: (() => void) | undefined;

  const fakeVerifier = {
    typecheck: async (): Promise<string> => {
      if (verifierMode === "blocking") {
        await new Promise<void>((resolve) => {
          releaseTypecheck = resolve;
        });
      }
      return "";
    },
    runTests: async (): Promise<string> => {
      if (verifierMode === "failing") {
        return "Test Suites: 3 failed\nTests: 7 failed, 35 passed";
      }
      return "Test Suites: 10 passed\nTests: 42 passed, 0 failed";
    },
  };

  let repairCalls: string[] = [];

  const fakeRepairCallback = async (
    filePath: string,
    _errorOutput: string,
  ): Promise<boolean> => {
    repairCalls.push(filePath);
    verifierMode = "healthy"; // simulated successful AI repair
    return true;
  };

  selfHeal.setSelfHealVerifierForTests(fakeVerifier);
  selfHeal.startSelfHealer(fakeRepairCallback);

  const scheduledRestarts: Array<{ delayMs: number; fn: () => void }> = [];
  um.__setRestartSchedulerForTests((delayMs, fn) => {
    scheduledRestarts.push({ delayMs, fn });
  });

  let pullCalls = 0;

  interface RunnerOverrides {
    gitPull?: () => Promise<boolean>;
    gitCheckout?: (commit: string) => Promise<boolean>;
    runTypecheck?: () => Promise<boolean>;
    runBuild?: () => Promise<boolean>;
    runCriticalTests?: () => Promise<boolean>;
  }

  function installRunners(overrides: RunnerOverrides = {}): void {
    um.__setUpdateRunnersForTests({
      getRemoteHead: async () => "bbbbbbb",
      getShortCommit: async () => "aaaaaaa",
      gitPull: async () => {
        pullCalls++;
        return overrides.gitPull ? overrides.gitPull() : true;
      },
      gitCheckout: async (commit: string) =>
        overrides.gitCheckout
          ? overrides.gitCheckout(commit)
          : true,
      installDepsIfNeeded: async () => true,
      runTypecheck: async () =>
        overrides.runTypecheck ? overrides.runTypecheck() : true,
      runBuild: async () =>
        overrides.runBuild ? overrides.runBuild() : true,
      runCriticalTests: async () =>
        overrides.runCriticalTests
          ? overrides.runCriticalTests()
          : true,
    });
  }

  function resetManager(): void {
    um.__resetUpdateManagerForTests();
    selfHeal.resetSelfHealMetrics();
    scheduledRestarts.length = 0;
    pullCalls = 0;
    repairCalls = [];
    verifierMode = "healthy";
    releaseTypecheck = undefined;
  }

  function makeRecord(): um.UpdateRecord {
    return {
      previousKnownGoodCommit: "aaaaaaa",
      targetCommit: "bbbbbbb",
      currentCommit: "aaaaaaa",
      updateStartedAt: Date.now(),
      state: "RESTART_PENDING",
      validationResult: "failed",
      buildResult: "pending",
      testResult: "pending",
      restartResult: "pending",
      healthResult: "failed",
      rollbackResult: "pending",
      rollbackAttempt: 0,
      failedTargets: [],
    };
  }

  /* ================================================================
   * TEST 1: update starts while healer idle → suspended, zero work
   * ================================================================ */
  try {
    resetManager();

    let flagDuringPull = false;
    let suspendedDuringPull = false;

    installRunners({
      gitPull: async () => {
        flagDuringPull = lifecycle.isUpdateInProgress();
        suspendedDuringPull = selfHeal.isSelfHealerSuspended();
        touch("a.ts");
        selfHeal.runSelfHealScanNow();
        return true;
      },
      runTypecheck: async () => {
        touch("b.ts");
        selfHeal.runSelfHealScanNow();
        return true;
      },
    });

    const ok = await um.performUpdate();
    assertEqual(ok, true, "update succeeded");
    assertEqual(flagDuringPull, true, "lifecycle flag set during pull");
    assertEqual(
      suspendedDuringPull,
      true,
      "healer suspended during pull",
    );

    const metrics = selfHeal.getSelfHealMetrics();
    assertEqual(metrics.verificationRuns, 0, "zero verifications");
    assertEqual(metrics.repairAttempts, 0, "zero repairs");

    assertEqual(
      um.getUpdateRecord()?.state,
      "RESTART_PENDING",
      "record state",
    );
    assertEqual(
      selfHeal.isSelfHealerSuspended(),
      true,
      "still suspended until restart",
    );
    assertEqual(
      lifecycle.isUpdateInProgress(),
      true,
      "flag kept until restart",
    );
    assertEqual(scheduledRestarts.length, 1, "restart scheduled");
    assertEqual(
      fs.existsSync(LOCK_PATH),
      true,
      "lock held until restart",
    );

    const rejected = await selfHeal.repairFile(
      "scripts/.selfheal-race/a.ts",
      "boom",
    );
    assertEqual(rejected, false, "repairFile rejected during update");

    pass("1. Update while idle suspends healer, zero verify/repair");
  } catch (error) {
    fail("1. Update while idle suspends healer, zero verify/repair", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 2: one file change during update → no verification
   * ================================================================ */
  try {
    resetManager();
    installRunners({
      gitPull: async () => {
        touch("a.ts");
        selfHeal.runSelfHealScanNow();
        return true;
      },
    });

    const ok = await um.performUpdate();
    assertEqual(ok, true, "update succeeded");

    const metrics = selfHeal.getSelfHealMetrics();
    assertEqual(metrics.verificationRuns, 0, "zero verifications");
    assertEqual(metrics.repairAttempts, 0, "zero repairs");

    pass("2. One source change during update triggers no verification");
  } catch (error) {
    fail("2. One source change during update triggers no verification", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 3: five file changes during update → no verification
   * ================================================================ */
  try {
    resetManager();
    installRunners({
      runTypecheck: async () => {
        for (const name of RACE_FILES) {
          touch(name);
        }
        selfHeal.runSelfHealScanNow();
        return true;
      },
    });

    const ok = await um.performUpdate();
    assertEqual(ok, true, "update succeeded");

    const metrics = selfHeal.getSelfHealMetrics();
    assertEqual(metrics.verificationRuns, 0, "zero verifications");
    assertEqual(metrics.repairAttempts, 0, "zero repairs");

    pass("3. Five source changes during update trigger no verification");
  } catch (error) {
    fail("3. Five source changes during update trigger no verification", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 4: selfHeal.ts change during update → ignored;
   *          resume re-baselines (absorbed after resume)
   * ================================================================ */
  try {
    resetManager();
    installRunners({
      runCriticalTests: async () => {
        const now = new Date();
        fs.utimesSync(SELF_HEAL_PATH, now, now);
        selfHeal.runSelfHealScanNow();
        return true;
      },
    });

    const ok = await um.performUpdate();
    assertEqual(ok, true, "update succeeded");

    let metrics = selfHeal.getSelfHealMetrics();
    assertEqual(metrics.verificationRuns, 0, "zero during update");

    // Simulate the restart boundary: end lifecycle + resume.
    um.__resetUpdateManagerForTests();
    selfHeal.runSelfHealScanNow();
    await sleep(150);

    metrics = selfHeal.getSelfHealMetrics();
    assertEqual(
      metrics.verificationRuns,
      0,
      "pulled file change absorbed on resume (no storm)",
    );
    assertEqual(metrics.repairAttempts, 0, "zero repairs");

    pass("4. selfHeal.ts change during update ignored and absorbed");
  } catch (error) {
    fail("4. selfHeal.ts change during update ignored and absorbed", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 5: work queued right before suspend is discarded
   * ================================================================ */
  try {
    resetManager();

    touch("a.ts");
    selfHeal.runSelfHealScanNow(); // queues + schedules drain
    selfHeal.suspendSelfHealer(); // same tick, before drain runs
    assertEqual(
      selfHeal.isSelfHealerSuspended(),
      true,
      "suspended",
    );

    await sleep(150); // drain runs, sees blocked state, discards

    const metrics = selfHeal.getSelfHealMetrics();
    assertEqual(metrics.verificationRuns, 0, "queued work discarded");
    assertEqual(metrics.repairAttempts, 0, "zero repairs");

    selfHeal.resumeSelfHealer();
    assertEqual(
      selfHeal.isSelfHealerSuspended(),
      false,
      "resumed",
    );

    pass("5. Pre-suspended queued work is discarded, not verified");
  } catch (error) {
    fail("5. Pre-suspended queued work is discarded, not verified", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 6: failed update → git checkout rollback, no verify during
   *          it, healer resumed + baseline absorbed after failure
   * ================================================================ */
  try {
    resetManager();
    installRunners({
      runTypecheck: async () => {
        touch("b.ts");
        selfHeal.runSelfHealScanNow();
        return false;
      },
      gitCheckout: async () => {
        const now = new Date();
        fs.utimesSync(SELF_HEAL_PATH, now, now);
        selfHeal.runSelfHealScanNow();
        return true;
      },
    });

    const ok = await um.performUpdate();
    assertEqual(ok, false, "failed update returns false");
    assertEqual(pullCalls, 1, "pull ran once");
    assertEqual(
      um.getUpdateRecord()?.state,
      "FAILED",
      "record FAILED",
    );

    let metrics = selfHeal.getSelfHealMetrics();
    assertEqual(metrics.verificationRuns, 0, "zero during update");
    assertEqual(metrics.repairAttempts, 0, "zero repairs");

    assertEqual(
      selfHeal.isSelfHealerSuspended(),
      false,
      "resumed after failed update",
    );
    assertEqual(
      lifecycle.isUpdateInProgress(),
      false,
      "flag closed after failed update",
    );
    assertEqual(fs.existsSync(LOCK_PATH), false, "lock released");

    selfHeal.runSelfHealScanNow();
    await sleep(150);

    metrics = selfHeal.getSelfHealMetrics();
    assertEqual(
      metrics.verificationRuns,
      0,
      "rollback changes absorbed on resume",
    );

    pass("6. Failed update: rollback checkout with zero verify, resumed");
  } catch (error) {
    fail("6. Failed update: rollback checkout with zero verify, resumed", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 7: successful update → restart scheduled per existing
   *          architecture (5s timer, lock held, suspension kept)
   * ================================================================ */
  try {
    resetManager();
    installRunners();

    const ok = await um.performUpdate();
    assertEqual(ok, true, "update succeeded");

    const record = um.getUpdateRecord();
    assertEqual(record?.state, "RESTART_PENDING", "record state");
    assertEqual(record?.restartResult, "pending", "restart pending");

    assertEqual(scheduledRestarts.length, 1, "one restart scheduled");
    assertEqual(scheduledRestarts[0].delayMs, 5000, "5s delay");
    assertEqual(
      typeof scheduledRestarts[0].fn,
      "function",
      "restart fn recorded (real path exits the process; not executed here)",
    );
    assertEqual(fs.existsSync(LOCK_PATH), true, "lock held");
    assertEqual(
      selfHeal.isSelfHealerSuspended(),
      true,
      "suspended until restart",
    );

    pass("7. Successful update schedules 5s restart, stays suspended");
  } catch (error) {
    fail("7. Successful update schedules 5s restart, stays suspended", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 8: stop → start fresh cycle + repair pipeline still works
   * ================================================================ */
  try {
    resetManager();

    selfHeal.stopSelfHealer();
    selfHeal.startSelfHealer(fakeRepairCallback);

    assertEqual(selfHeal.isSelfHealerRunning(), true, "running");
    assertEqual(selfHeal.SCAN_INTERVAL_MS, 10_000, "scan interval 10s");

    verifierMode = "healthy";
    touch("c.ts");
    selfHeal.runSelfHealScanNow();
    await sleep(150);

    let metrics = selfHeal.getSelfHealMetrics();
    assertEqual(metrics.verificationRuns, 1, "one healthy verification");
    assertEqual(metrics.repairAttempts, 0, "no repair on healthy tree");

    verifierMode = "failing";
    touch("d.ts");
    selfHeal.runSelfHealScanNow();
    await sleep(300);

    metrics = selfHeal.getSelfHealMetrics();
    assertEqual(repairCalls.length, 1, "repair callback invoked once");
    assertEqual(
      repairCalls[0].includes("d.ts"),
      true,
      "repaired the right file",
    );
    assertEqual(metrics.repairAttempts, 1, "one repair attempt");
    assertEqual(
      verifierMode,
      "healthy",
      "repair verification passed",
    );

    verifierMode = "healthy";
    pass("8. Stop/start cycle works; repair pipeline still functional");
  } catch (error) {
    fail("8. Stop/start cycle works; repair pipeline still functional", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 9: test-output classifier ("0 failed" must NOT fail)
   * ================================================================ */
  try {
    const cases: Array<[string, boolean]> = [
      ["Tests: 10 passed, 0 failed", false],
      ["Test Suites: 0 failed\nTests: 0 failed", false],
      ["Tests:       3 failed, 39 passed", true],
      ["FAIL scripts/test-x.ts", true],
      ["  ❌ FAIL  unit-test", true],
      ["npm ERR! code ELIFECYCLE", true],
      ["error TS2304: Cannot find name 'x'.", true],
      ["Test Suites: 10 passed, 0 skipped", false],
    ];

    for (const [input, expected] of cases) {
      assertEqual(
        selfHeal.isTestFailure(input),
        expected,
        `isTestFailure(${JSON.stringify(input)})`,
      );
    }

    pass("9. Test-output classifier: '0 failed' is not a failure");
  } catch (error) {
    fail("9. Test-output classifier: '0 failed' is not a failure", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 10: 5-file burst → exactly one verification, zero repairs
   * ================================================================ */
  try {
    resetManager();
    verifierMode = "healthy";

    for (const name of RACE_FILES) {
      touch(name);
    }
    selfHeal.runSelfHealScanNow();
    await sleep(250);

    const metrics = selfHeal.getSelfHealMetrics();
    assertEqual(
      metrics.verificationRuns,
      1,
      "exactly one verification for 5-file burst",
    );
    assertEqual(metrics.repairAttempts, 0, "zero repairs on healthy burst");

    pass("10. Five-file burst batches into one verification, zero repairs");
  } catch (error) {
    fail("10. Five-file burst batches into one verification, zero repairs", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 11 (extra): quiesce timeout aborts update before git pull
   * ================================================================ */
  try {
    resetManager();
    installRunners();

    verifierMode = "blocking";
    touch("e.ts");
    selfHeal.runSelfHealScanNow();
    await sleep(150);

    assertEqual(
      typeof releaseTypecheck,
      "function",
      "verification in flight",
    );

    const ok = await um.performUpdate({ quiesceTimeoutMs: 300 });
    assertEqual(ok, false, "update aborted on quiesce timeout");
    assertEqual(pullCalls, 0, "git pull never ran");
    assertEqual(
      selfHeal.isSelfHealerSuspended(),
      false,
      "resumed after abort",
    );
    assertEqual(
      lifecycle.isUpdateInProgress(),
      false,
      "flag closed after abort",
    );
    assertEqual(fs.existsSync(LOCK_PATH), false, "lock released");
    assertEqual(
      selfHeal.getSelfHealMetrics().verificationRuns,
      1,
      "only the pre-update verification ran",
    );

    const release = releaseTypecheck as () => void;
    releaseTypecheck = undefined;
    verifierMode = "healthy";
    release();
    await sleep(200);

    const metrics = selfHeal.getSelfHealMetrics();
    assertEqual(metrics.verificationRuns, 1, "no verification after abort");
    assertEqual(metrics.repairAttempts, 0, "zero repairs");

    pass("11. Quiesce timeout aborts update before any git operation");
  } catch (error) {
    fail("11. Quiesce timeout aborts update before any git operation", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 12a (extra): rollback in new process suspends until restart
   * ================================================================ */
  try {
    resetManager();
    installRunners({
      gitCheckout: async () => {
        touch("a.ts");
        selfHeal.runSelfHealScanNow();
        return true;
      },
    });

    const record = makeRecord();
    await um.triggerRollback(record);

    assertEqual(record.state, "HEALTH_CHECKING", "rollback built");
    assertEqual(scheduledRestarts.length, 1, "restart scheduled");
    assertEqual(scheduledRestarts[0].delayMs, 5000, "5s delay");
    assertEqual(
      selfHeal.isSelfHealerSuspended(),
      true,
      "suspended until rollback restart",
    );
    assertEqual(
      lifecycle.isUpdateInProgress(),
      true,
      "flag kept until restart",
    );

    const metrics = selfHeal.getSelfHealMetrics();
    assertEqual(metrics.verificationRuns, 0, "zero verifications");
    assertEqual(metrics.repairAttempts, 0, "zero repairs");

    pass("12a. Rollback suspends healer until restart, zero verify");
  } catch (error) {
    fail("12a. Rollback suspends healer until restart, zero verify", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * TEST 12b (extra): failed rollback resumes + closes flag
   * (must run last: it persists failedTargets in the record)
   * ================================================================ */
  try {
    resetManager();
    installRunners({ gitCheckout: async () => false });

    const record = makeRecord();
    await um.triggerRollback(record);

    assertEqual(record.state, "ROLLBACK_FAILED", "rollback failed");
    assertEqual(
      selfHeal.isSelfHealerSuspended(),
      false,
      "resumed after failed rollback",
    );
    assertEqual(
      lifecycle.isUpdateInProgress(),
      false,
      "flag closed after failed rollback",
    );

    const metrics = selfHeal.getSelfHealMetrics();
    assertEqual(metrics.verificationRuns, 0, "zero verifications");
    assertEqual(metrics.repairAttempts, 0, "zero repairs");

    pass("12b. Failed rollback resumes healer and closes lifecycle");
  } catch (error) {
    fail("12b. Failed rollback resumes healer and closes lifecycle", error);
  } finally {
    resetManager();
  }

  /* ================================================================
   * CLEANUP
   * ================================================================ */
  try {
    selfHeal.stopSelfHealer();
    selfHeal.setSelfHealVerifierForTests(undefined);
    fs.rmSync(RACE_DIR, { recursive: true, force: true });
    if (OWN_DATA_DIR) {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    }
  } catch (error) {
    console.error("cleanup warning:", error);
  }

  report();
}

function report(): void {
  console.log(`\n${"=".repeat(50)}`);
  console.log(
    `Self-Heal Update Race Tests: ${passed} passed, ${failed} failed`,
  );
  console.log(`${"=".repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("❌ suite crashed:", error);
  process.exit(1);
});
