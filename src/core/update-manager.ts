import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { logger } from "../logger";
import { getDataPath, getDataDir, getDatabasePath } from "../config/data-dir";
import { beginUpdateLifecycle, endUpdateLifecycle } from "./update-lifecycle";
import {
  suspendSelfHealer,
  resumeSelfHealer,
  waitForSelfHealIdle,
} from "../agent/selfHeal";

/* ================================================================
 * SAFE AUTOMATIC UPDATE MANAGER WITH REAL ROLLBACK
 *
 * Update flow:
 *   A (known-good) -> git pull -> B -> validate -> restart -> health
 *
 * If health passes: B becomes known-good.
 * If health fails: git checkout A -> rebuild -> restart -> health.
 *
 * Rollback is a real git checkout to the previous known-good commit.
 * Persistent data (data/, node_modules/, dist/) is preserved because
 * it is gitignored and never touched by git checkout.
 *
 * State machine:
 *   IDLE -> CHECKING -> UPDATING -> VALIDATING -> RESTART_PENDING
 *     -> HEALTH_CHECKING -> SUCCESS | ROLLING_BACK -> ROLLED_BACK | ROLLBACK_FAILED
 *   Any stage can -> FAILED
 * ================================================================ */

export type UpdateState =
  | "IDLE"
  | "CHECKING"
  | "UPDATING"
  | "VALIDATING"
  | "RESTART_PENDING"
  | "HEALTH_CHECKING"
  | "SUCCESS"
  | "FAILED"
  | "ROLLING_BACK"
  | "ROLLED_BACK"
  | "ROLLBACK_FAILED";

export interface UpdateRecord {
  previousKnownGoodCommit: string;
  targetCommit: string;
  currentCommit: string;
  updateStartedAt: number;
  state: UpdateState;
  validationResult: "pending" | "passed" | "failed";
  buildResult: "pending" | "passed" | "failed";
  testResult: "pending" | "passed" | "failed";
  restartResult: "pending" | "success" | "failed";
  healthResult: "pending" | "passed" | "failed";
  rollbackResult: "pending" | "success" | "failed" | "skipped";
  rollbackAttempt: number;
  failedTargets: string[];
  error?: string;
}

export interface UpdateManagerConfig {
  branch: string;
  checkIntervalMs: number;
  lockFile: string;
  recordFile: string;
  maxRollbackAttempts: number;
  healthCheckDelayMs: number;
  gitTimeoutMs: number;
}

const DEFAULT_CONFIG: UpdateManagerConfig = {
  branch: "main",
  checkIntervalMs: 5 * 60 * 1000,
  lockFile: getDataPath(".update-lock"),
  recordFile: getDataPath("update-record.json"),
  maxRollbackAttempts: 2,
  healthCheckDelayMs: 15_000,
  gitTimeoutMs: 15_000,
};

let config = { ...DEFAULT_CONFIG };
let checkTimer: NodeJS.Timeout | null = null;
let currentVersion = "";
let isUpdating = false;
let updateState: UpdateState = "IDLE";

/* ================================================================
 * SELF-HEALER COORDINATION
 *
 * The old flow let the Self-Healer (10s poll) scan while this module
 * was pulling / validating / rolling back: typecheck + full test runs
 * + possible AI source repairs then overlapped git, and rollbacks
 * blacklisted SHAs the healer had just broken. Now every update:
 *
 *   beginUpdateLifecycle()  — sets the shared in-memory flag
 *   suspendSelfHealer()     — stops polling + drops queued work
 *   waitForSelfHealIdle()   — quiesces in-flight scans/repairs
 *   ... git + validation ...
 *   finally                 — end flag + resume ONLY if the process
 *                             keeps running (failure paths); on the
 *                             success path the process exits with the
 *                             flag still set, successor starts clean.
 * ================================================================ */

const SELF_HEAL_QUIESCE_MS = 120_000;
const SELF_HEAL_ROLLBACK_QUIESCE_MS = 30_000;

/* ================================================================
 * TEST SEAMS — injected only by scripts/test-selfheal-update-race.ts
 * ================================================================ */

export interface UpdateRunners {
  getRemoteHead: () => Promise<string | null>;
  getShortCommit: () => Promise<string>;
  gitPull: () => Promise<boolean>;
  gitCheckout: (commit: string) => Promise<boolean>;
  installDepsIfNeeded: () => Promise<boolean>;
  runTypecheck: () => Promise<boolean>;
  runBuild: () => Promise<boolean>;
  runCriticalTests: () => Promise<boolean>;
}

const defaultRunners: UpdateRunners = {
  getRemoteHead,
  getShortCommit,
  gitPull,
  gitCheckout,
  installDepsIfNeeded,
  runTypecheck,
  runBuild,
  runCriticalTests,
};

let runners: UpdateRunners = { ...defaultRunners };

export function __setUpdateRunnersForTests(
  overrides?: Partial<UpdateRunners>,
): void {
  runners = { ...defaultRunners, ...overrides };
}

type RestartScheduler = (
  delayMs: number,
  fn: () => void,
) => void;

const defaultRestartScheduler: RestartScheduler = (
  delayMs,
  fn,
) => {
  setTimeout(fn, delayMs);
};

let restartScheduler: RestartScheduler =
  defaultRestartScheduler;

export function __setRestartSchedulerForTests(
  scheduler?: RestartScheduler,
): void {
  restartScheduler =
    scheduler ?? defaultRestartScheduler;
}

/**
 * Test-only: force the manager back to a clean idle state
 * (a successful update intentionally keeps the update flag set
 * until the scheduled process exit).
 */
export function __resetUpdateManagerForTests(): void {
  isUpdating = false;
  updateState = "IDLE";
  releaseLock();
  endUpdateLifecycle();
  resumeSelfHealer();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ================================================================
 * GIT HELPERS — async spawn with bounded timeout
 * ================================================================ */

/**
 * Hard cap on captured child-process output (replaces the ineffective
 * `maxBuffer` spawn option — `spawn` never supported it).
 */
const MAX_CAPTURED_OUTPUT_BYTES = 1024 * 1024;

function runGitAsync(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    /*
     * `spawn()` has no `maxBuffer` option (that belongs to exec/execFile), so
     * passing it was both a type error and a no-op. The bound is enforced
     * explicitly below via MAX_CAPTURED_OUTPUT_BYTES, and stdio is declared
     * explicitly so stdout/stderr are typed as non-null streams.
     */
    const proc = spawn("git", args, {
      cwd: process.cwd(),
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      reject(error);
    };

    proc.stdout.on("data", (d: Buffer) => {
      if (settled) return;
      stdout += d.toString();
      if (stdout.length > MAX_CAPTURED_OUTPUT_BYTES) {
        fail(new Error(`git ${args.join(" ")} produced too much output`));
      }
    });

    proc.stderr.on("data", (d: Buffer) => {
      if (settled) return;
      stderr += d.toString();
      if (stderr.length > MAX_CAPTURED_OUTPUT_BYTES) {
        stderr = stderr.slice(0, MAX_CAPTURED_OUTPUT_BYTES);
      }
    });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr.slice(0, 200)}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on("error", (err) => fail(err instanceof Error ? err : new Error(String(err))));
  });
}

function getShortCommit(): Promise<string> {
  return runGitAsync(["rev-parse", "--short", "HEAD"], 5_000).catch(() => "unknown");
}

function getFullCommit(): Promise<string> {
  return runGitAsync(["rev-parse", "HEAD"], 5_000).catch(() => "unknown");
}

function getRemoteHead(): Promise<string | null> {
  return runGitAsync(["fetch", "origin", config.branch, "--quiet"], config.gitTimeoutMs)
    .then(() => runGitAsync(["rev-parse", `origin/${config.branch}`], 5_000))
    .catch((error) => {
      logger.warn(`[UpdateManager] failed to fetch remote: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
}

function gitCheckout(commit: string): Promise<boolean> {
  return runGitAsync(["checkout", commit], 30_000)
    .then(() => { logger.info(`[UpdateManager] checked out ${commit}`); return true; })
    .catch((error) => {
      logger.error(`[UpdateManager] git checkout ${commit} failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    });
}

function gitPull(): Promise<boolean> {
  return runGitAsync(["pull", "origin", config.branch, "--ff-only"], config.gitTimeoutMs)
    .then(() => true)
    .catch(() => false);
}

/* ================================================================
 * LOCK MANAGEMENT
 * ================================================================ */

function acquireLock(): boolean {
  try {
    const dataDir = path.dirname(config.lockFile);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    if (existsSync(config.lockFile)) {
      const lockContent = readFileSync(config.lockFile, "utf8");
      const lockData = JSON.parse(lockContent);
      const lockAge = Date.now() - (lockData.acquiredAt || 0);

      if (lockAge < 30 * 60 * 1000) {
        logger.warn(
          `[UpdateManager] update lock held by PID ${lockData.pid} (${Math.round(lockAge / 1000)}s ago)`
        );
        return false;
      }

      logger.warn("[UpdateManager] stale lock detected, removing");
    }

    writeFileSync(
      config.lockFile,
      JSON.stringify({ pid: process.pid, acquiredAt: Date.now() })
    );
    return true;
  } catch (error) {
    logger.error(
      `[UpdateManager] lock acquisition failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

function releaseLock(): void {
  try {
    if (existsSync(config.lockFile)) {
      unlinkSync(config.lockFile);
    }
  } catch {
    // Best effort
  }
}

/* ================================================================
 * RECORD MANAGEMENT
 * ================================================================ */

function saveRecord(record: UpdateRecord): void {
  try {
    const dataDir = path.dirname(config.recordFile);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    writeFileSync(config.recordFile, JSON.stringify(record, null, 2));
  } catch {
    // Best effort
  }
}

export function getUpdateRecord(): UpdateRecord | null {
  try {
    if (existsSync(config.recordFile)) {
      return JSON.parse(readFileSync(config.recordFile, "utf8"));
    }
  } catch {
    // Ignore
  }
  return null;
}

/* ================================================================
 * VALIDATION GATES
 * ================================================================ */

function runTypecheck(): Promise<boolean> {
  return runNodeAsync("./node_modules/.bin/tsc", ["--noEmit"], 120_000);
}

function runBuild(): Promise<boolean> {
  return runNodeAsync("./node_modules/.bin/tsc", [], 120_000);
}

function runCriticalTests(): Promise<boolean> {
  return runNodeAsync("./node_modules/.bin/tsx", ["scripts/run-all-tests.ts"], 600_000, { ...process.env, NODE_OPTIONS: "" });
}

function installDepsIfNeeded(): Promise<boolean> {
  return new Promise((resolve) => {
    const lockfile = path.join(process.cwd(), "package-lock.json");
    const nodeModules = path.join(process.cwd(), "node_modules");

    if (!existsSync(nodeModules) || !existsSync(lockfile)) {
      logger.info("[UpdateManager] installing dependencies...");
      runNodeAsync("npm", ["ci", "--include=dev"], 120_000)
        .then(() => resolve(true))
        .catch(() => resolve(false));
    } else {
      resolve(true);
    }
  });
}

function runNodeAsync(bin: string, args: string[], timeoutMs: number, env?: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, {
      cwd: process.cwd(),
      timeout: timeoutMs,
      /* Explicit stdio + drained pipes: see capture() below. */
      stdio: ["ignore", "pipe", "pipe"],
      env: env || process.env,
    });

    /*
     * stdout/stderr MUST be drained. An unread pipe fills up (~64 KB), the
     * child blocks on write, and the spawn timeout then kills it — which made
     * every validation step (tsc / the test runner write far more than the
     * pipe buffer) fail regardless of the real result. A bounded tail is kept
     * for diagnostics only.
     */
    let captured = "";
    const capture = (d: Buffer): void => {
      captured += d.toString();
      if (captured.length > MAX_CAPTURED_OUTPUT_BYTES) {
        captured = captured.slice(captured.length - MAX_CAPTURED_OUTPUT_BYTES);
      }
    };

    proc.stdout.on("data", capture);
    proc.stderr.on("data", capture);

    proc.on("close", (code) => {
      if (code !== 0) {
        const tail = captured.trim().split("\n").slice(-10).join("\n");
        logger.warn(
          `${path.basename(bin)} ${args.join(" ")} exited ${code}${tail ? `: ${tail}` : ""}`,
        );
      }
      resolve(code === 0);
    });

    proc.on("error", (err) => {
      logger.warn(
        `Failed to spawn ${bin} ${args.join(" ")}: ${err instanceof Error ? err.message : String(err)}`,
      );
      resolve(false);
    });
  });
}

/* ================================================================
 * POST-START HEALTH VALIDATION
 * ================================================================ */

function runPostStartHealthCheck(): { healthy: boolean; reason: string } {
  try {
    const dbPath = getDatabasePath();
    if (!existsSync(dbPath)) {
      return { healthy: false, reason: "database file missing" };
    }

    const criticalFiles = ["src/index.ts", "package.json", "tsconfig.json"];
    const missing = criticalFiles.filter(
      (f) => !existsSync(path.join(process.cwd(), f))
    );
    if (missing.length > 0) {
      return { healthy: false, reason: `critical files missing: ${missing.join(", ")}` };
    }

    if (!existsSync(path.join(process.cwd(), "node_modules"))) {
      return { healthy: false, reason: "node_modules missing" };
    }

    const dataDir = getDataDir();
    if (existsSync(dataDir)) {
      try {
        const testFile = path.join(dataDir, ".health-test");
        writeFileSync(testFile, "ok");
        unlinkSync(testFile);
      } catch {
        return { healthy: false, reason: "data directory not writable" };
      }
    }

    return { healthy: true, reason: "all checks passed" };
  } catch (error) {
    return {
      healthy: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/* ================================================================
 * POST-START VALIDATION
 *
 * Called on startup after Discord READY. Checks whether the current
 * version (which just restarted) is healthy. If not, triggers rollback.
 * ================================================================ */

export async function postStartValidation(): Promise<void> {
  const record = getUpdateRecord();
  if (!record) return;

  if (record.state !== "RESTART_PENDING" && record.state !== "HEALTH_CHECKING") {
    return;
  }

  // Rollback restart: check health of the restored version
  if (record.state === "HEALTH_CHECKING" && record.rollbackResult === "pending") {
    logger.info("[UpdateManager] post-start: checking rolled-back version health...");

    await sleep(config.healthCheckDelayMs);

    const health = runPostStartHealthCheck();
    if (health.healthy) {
      record.state = "ROLLED_BACK";
      record.healthResult = "passed";
      record.rollbackResult = "success";
      saveRecord(record);
      logger.info(`[UpdateManager] rollback to ${record.previousKnownGoodCommit} verified healthy.`);
    } else {
      record.state = "ROLLBACK_FAILED";
      record.healthResult = "failed";
      record.rollbackResult = "failed";
      record.error = `rollback health check failed: ${health.reason}`;
      saveRecord(record);
      logger.error(`[UpdateManager] ROLLBACK FAILED: ${record.error}`);
    }
    return;
  }

  // Normal update restart: check health of the new version
  if (record.state === "RESTART_PENDING") {
    logger.info("[UpdateManager] post-start: checking new version health...");

    await sleep(config.healthCheckDelayMs);

    const health = runPostStartHealthCheck();
    if (health.healthy) {
      record.state = "SUCCESS";
      record.healthResult = "passed";
      record.currentCommit = await getShortCommit();
      saveRecord(record);
      logger.info(`[UpdateManager] new version ${record.targetCommit} verified healthy and is now known-good.`);
    } else {
      logger.warn(`[UpdateManager] new version health check failed: ${health.reason}`);
      await triggerRollback(record);
    }
  }
}

/* ================================================================
 * ROLLBACK
 * ================================================================ */

/** Exported for regression tests (scripts/test-selfheal-update-race.ts). */
export async function triggerRollback(record: UpdateRecord): Promise<void> {
  if (record.rollbackAttempt >= config.maxRollbackAttempts) {
    record.state = "ROLLBACK_FAILED";
    record.healthResult = "failed";
    record.rollbackResult = "failed";
    record.error = `max rollback attempts (${config.maxRollbackAttempts}) exhausted`;
    saveRecord(record);
    logger.error(`[UpdateManager] ${record.error}`);
    return;
  }

  const previousCommit = record.previousKnownGoodCommit;
  if (!previousCommit || previousCommit === "unknown") {
    record.state = "ROLLBACK_FAILED";
    record.healthResult = "failed";
    record.rollbackResult = "failed";
    record.error = "no previous known-good commit to rollback to";
    saveRecord(record);
    logger.error(`[UpdateManager] ${record.error}`);
    return;
  }

  if (!record.failedTargets.includes(record.targetCommit)) {
    record.failedTargets.push(record.targetCommit);
  }

  // Everything from here mutates the source tree (git checkout,
  // npm ci, tsc): suspend the Self-Healer for the whole window.
  beginUpdateLifecycle();
  suspendSelfHealer();

  try {
    record.state = "ROLLING_BACK";
    record.rollbackAttempt++;
    record.healthResult = "failed";
    saveRecord(record);

    logger.info(
      `[UpdateManager] ROLLING BACK: ${record.targetCommit} -> ${previousCommit} (attempt ${record.rollbackAttempt}/${config.maxRollbackAttempts})`
    );

    const idle = await waitForSelfHealIdle(SELF_HEAL_ROLLBACK_QUIESCE_MS);
    if (!idle) {
      // Rollback correctness beats strict quiesce here: the fresh
      // process has no in-flight repairs in practice, and the source
      // must be restored even if something is stuck.
      logger.warn(
        "[UpdateManager] self-healer still busy during rollback quiesce — proceeding with rollback"
      );
    }

    if (!(await runners.gitCheckout(previousCommit))) {
      record.state = "ROLLBACK_FAILED";
      record.rollbackResult = "failed";
      record.error = `git checkout ${previousCommit} failed`;
      saveRecord(record);
      logger.error(`[UpdateManager] ${record.error}`);
      return;
    }

    if (!(await runners.installDepsIfNeeded())) {
      record.state = "ROLLBACK_FAILED";
      record.rollbackResult = "failed";
      record.error = "dependency installation failed during rollback";
      saveRecord(record);
      logger.error(`[UpdateManager] ${record.error}`);
      return;
    }

    if (!(await runners.runBuild())) {
      record.state = "ROLLBACK_FAILED";
      record.rollbackResult = "failed";
      record.error = "build failed during rollback";
      saveRecord(record);
      logger.error(`[UpdateManager] ${record.error}`);
      return;
    }

    record.state = "HEALTH_CHECKING";
    record.rollbackResult = "pending";
    saveRecord(record);

    logger.info(
      `[UpdateManager] rollback to ${previousCommit} built successfully. Restarting in 5s...`
    );

    // Success path: this process exits in 5s. The lifecycle flag and
    // the suspension stay set until then (no source work may start
    // in that window); the successor process starts clean.
    restartScheduler(5_000, () => {
      releaseLock();
      process.exit(0);
    });
  } finally {
    if (record.state !== "HEALTH_CHECKING") {
      endUpdateLifecycle();
      resumeSelfHealer();
    }
  }
}

/* ================================================================
 * MAIN UPDATE FLOW
 * ================================================================ */

export async function performUpdate(options?: {
  quiesceTimeoutMs?: number;
}): Promise<boolean> {
  if (isUpdating) {
    logger.warn("[UpdateManager] update already in progress");
    return false;
  }

  const remoteCommit = await runners.getRemoteHead();
  if (!remoteCommit) {
    return false;
  }

  const localCommit = await runners.getShortCommit();
  if (remoteCommit === localCommit || remoteCommit.slice(0, 7) === localCommit) {
    return false;
  }

  const existingRecord = getUpdateRecord();
  if (existingRecord?.failedTargets?.includes(remoteCommit.slice(0, 7))) {
    logger.warn(
      `[UpdateManager] commit ${remoteCommit.slice(0, 7)} previously failed, skipping`
    );
    return false;
  }

  logger.info(
    `[UpdateManager] new commit detected: ${localCommit} -> ${remoteCommit.slice(0, 7)}`
  );

  if (!acquireLock()) {
    return false;
  }

  isUpdating = true;
  updateState = "UPDATING";

  // Coordinate with the Self-Healer BEFORE any source mutation.
  beginUpdateLifecycle();
  suspendSelfHealer();

  const record: UpdateRecord = {
    previousKnownGoodCommit: localCommit,
    targetCommit: remoteCommit.slice(0, 7),
    currentCommit: localCommit,
    updateStartedAt: Date.now(),
    state: "UPDATING",
    validationResult: "pending",
    buildResult: "pending",
    testResult: "pending",
    restartResult: "pending",
    healthResult: "pending",
    rollbackResult: "skipped",
    rollbackAttempt: 0,
    failedTargets: existingRecord?.failedTargets || [],
  };

  try {
    // Quiesce: no scan in flight, no drain in flight, no file being
    // repaired. If the healer cannot go idle in time the update is
    // aborted cleanly (no record write, nothing persisted) and will
    // be retried on the next check — never over a busy healer.
    const idle = await waitForSelfHealIdle(
      options?.quiesceTimeoutMs ?? SELF_HEAL_QUIESCE_MS
    );
    if (!idle) {
      logger.warn(
        "[UpdateManager] self-healer still busy after quiesce timeout — aborting update, will retry next check"
      );
      return false;
    }

    logger.info("[UpdateManager] pulling changes...");
    if (!(await runners.gitPull())) {
      record.state = "FAILED";
      record.error = "git pull failed";
      saveRecord(record);
      return false;
    }

    logger.info("[UpdateManager] checking dependencies...");
    if (!(await runners.installDepsIfNeeded())) {
      record.state = "FAILED";
      record.error = "dependency installation failed";
      saveRecord(record);
      return false;
    }

    updateState = "VALIDATING";
    record.state = "VALIDATING";
    logger.info("[UpdateManager] running typecheck...");
    record.validationResult = (await runners.runTypecheck()) ? "passed" : "failed";
    if (record.validationResult === "failed") {
      record.state = "FAILED";
      record.error = "typecheck failed - keeping current version";
      saveRecord(record);
      logger.error("[UpdateManager] typecheck failed, aborting update");
      await runners.gitCheckout(record.previousKnownGoodCommit);
      return false;
    }

    logger.info("[UpdateManager] running build...");
    record.buildResult = (await runners.runBuild()) ? "passed" : "failed";
    if (record.buildResult === "failed") {
      record.state = "FAILED";
      record.error = "build failed - keeping current version";
      saveRecord(record);
      logger.error("[UpdateManager] build failed, aborting update");
      await runners.gitCheckout(record.previousKnownGoodCommit);
      return false;
    }

    logger.info("[UpdateManager] running critical tests...");
    record.testResult = (await runners.runCriticalTests()) ? "passed" : "failed";
    if (record.testResult === "failed") {
      record.state = "FAILED";
      record.error = "tests failed - keeping current version";
      saveRecord(record);
      logger.error("[UpdateManager] tests failed, aborting update");
      await runners.gitCheckout(record.previousKnownGoodCommit);
      return false;
    }

    record.state = "RESTART_PENDING";
    record.restartResult = "pending";
    saveRecord(record);
    updateState = "RESTART_PENDING";

    logger.info(
      `[UpdateManager] all validation passed. Restarting in 5s... (previous=${record.previousKnownGoodCommit}, target=${record.targetCommit})`
    );

    // Success path: keep lifecycle flag + suspension set until this
    // process exits in 5s; the successor process starts clean.
    restartScheduler(5_000, () => {
      record.restartResult = "success";
      saveRecord(record);
      releaseLock();
      process.exit(0);
    });

    return true;
  } catch (error) {
    record.state = "FAILED";
    record.error = error instanceof Error ? error.message : String(error);
    saveRecord(record);
    logger.error(`[UpdateManager] update failed: ${record.error}`);
    await runners.gitCheckout(record.previousKnownGoodCommit);
    return false;
  } finally {
    if (record.state !== "RESTART_PENDING") {
      isUpdating = false;
      updateState = "IDLE";
      releaseLock();
      // The process keeps running: close the lifecycle window and
      // let the healer re-baseline (never over a half-rolled-back tree
      // — the gitCheckout above ran inside this try block).
      endUpdateLifecycle();
      resumeSelfHealer();
    }
  }
}

/* ================================================================
 * STATUS & LIFECYCLE
 * ================================================================ */

let cachedCurrentCommit = "unknown";
let cachedLatestAvailable: string | null = null;

(async () => {
  cachedCurrentCommit = await getShortCommit().catch(() => "unknown");
  getRemoteHead().then((r) => { cachedLatestAvailable = r?.slice(0, 7) ?? null; }).catch(() => {});
})();

export async function getUpdateStatus(): Promise<{
  currentCommit: string;
  knownGoodCommit: string | null;
  targetCommit: string | null;
  latestAvailable: string | null;
  updateAvailable: boolean;
  updateState: UpdateState;
  lastUpdate: UpdateRecord | null;
  lastFailedUpdate: UpdateRecord | null;
  lastRollback: UpdateRecord | null;
  isUpdating: boolean;
  branch: string;
}> {
  const current = cachedCurrentCommit;
  const record = getUpdateRecord();

  return {
    currentCommit: current,
    knownGoodCommit:
      record?.state === "SUCCESS"
        ? record.targetCommit
        : record?.previousKnownGoodCommit ?? null,
    targetCommit: record?.targetCommit ?? null,
    latestAvailable: cachedLatestAvailable,
    updateAvailable: cachedLatestAvailable ? cachedLatestAvailable !== current : false,
    updateState,
    lastUpdate: record,
    lastFailedUpdate:
      record?.state === "FAILED" || record?.state === "ROLLBACK_FAILED"
        ? record
        : null,
    lastRollback:
      record?.state === "ROLLED_BACK" || record?.state === "ROLLBACK_FAILED"
        ? record
        : null,
    isUpdating,
    branch: config.branch,
  };
}

export async function startUpdateManager(
  customConfig?: Partial<UpdateManagerConfig>
): Promise<void> {
  if (customConfig) {
    config = { ...DEFAULT_CONFIG, ...customConfig };
  }

  currentVersion = cachedCurrentCommit;
  logger.info(
    `[UpdateManager] monitoring branch=${config.branch} every ${
      config.checkIntervalMs / 1000
    }s (current=${currentVersion})`
  );

  checkTimer = setInterval(async () => {
    try {
      await performUpdate();
    } catch (error) {
      logger.error(
        `[UpdateManager] check failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, config.checkIntervalMs);

  checkTimer.unref?.();
}

export function stopUpdateManager(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
  releaseLock();
}
