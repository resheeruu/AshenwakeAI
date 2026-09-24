import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { logger } from "../logger";

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
  lockFile: path.join(process.cwd(), "data", ".update-lock"),
  recordFile: path.join(process.cwd(), "data", "update-record.json"),
  maxRollbackAttempts: 2,
  healthCheckDelayMs: 15_000,
  gitTimeoutMs: 15_000,
};

let config = { ...DEFAULT_CONFIG };
let checkTimer: NodeJS.Timeout | null = null;
let currentVersion = "";
let isUpdating = false;
let updateState: UpdateState = "IDLE";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ================================================================
 * GIT HELPERS — async spawn with bounded timeout
 * ================================================================ */

function runGitAsync(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, {
      cwd: process.cwd(),
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) { reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr.slice(0, 200)}`)); }
      else { resolve(stdout.trim()); }
    });
    proc.on("error", (err) => reject(err));
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
      maxBuffer: 1024 * 1024,
      env: env || process.env,
    });
    proc.on("close", (code) => { resolve(code === 0); });
    proc.on("error", () => { resolve(false); });
  });
}

/* ================================================================
 * POST-START HEALTH VALIDATION
 * ================================================================ */

function runPostStartHealthCheck(): { healthy: boolean; reason: string } {
  try {
    const dbPath = path.join(process.cwd(), "data", "ashenai.db");
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

    const dataDir = path.join(process.cwd(), "data");
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

async function triggerRollback(record: UpdateRecord): Promise<void> {
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

  record.state = "ROLLING_BACK";
  record.rollbackAttempt++;
  record.healthResult = "failed";
  saveRecord(record);

  logger.info(
    `[UpdateManager] ROLLING BACK: ${record.targetCommit} -> ${previousCommit} (attempt ${record.rollbackAttempt}/${config.maxRollbackAttempts})`
  );

  if (!(await gitCheckout(previousCommit))) {
    record.state = "ROLLBACK_FAILED";
    record.rollbackResult = "failed";
    record.error = `git checkout ${previousCommit} failed`;
    saveRecord(record);
    logger.error(`[UpdateManager] ${record.error}`);
    return;
  }

  if (!(await installDepsIfNeeded())) {
    record.state = "ROLLBACK_FAILED";
    record.rollbackResult = "failed";
    record.error = "dependency installation failed during rollback";
    saveRecord(record);
    logger.error(`[UpdateManager] ${record.error}`);
    return;
  }

  if (!(await runBuild())) {
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

  setTimeout(() => {
    releaseLock();
    process.exit(0);
  }, 5_000);
}

/* ================================================================
 * MAIN UPDATE FLOW
 * ================================================================ */

async function performUpdate(): Promise<boolean> {
  if (isUpdating) {
    logger.warn("[UpdateManager] update already in progress");
    return false;
  }

  const remoteCommit = await getRemoteHead();
  if (!remoteCommit) {
    return false;
  }

  const localCommit = await getShortCommit();
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
    logger.info("[UpdateManager] pulling changes...");
    if (!(await gitPull())) {
      record.state = "FAILED";
      record.error = "git pull failed";
      saveRecord(record);
      return false;
    }

    logger.info("[UpdateManager] checking dependencies...");
    if (!(await installDepsIfNeeded())) {
      record.state = "FAILED";
      record.error = "dependency installation failed";
      saveRecord(record);
      return false;
    }

    updateState = "VALIDATING";
    record.state = "VALIDATING";
    logger.info("[UpdateManager] running typecheck...");
    record.validationResult = (await runTypecheck()) ? "passed" : "failed";
    if (record.validationResult === "failed") {
      record.state = "FAILED";
      record.error = "typecheck failed - keeping current version";
      saveRecord(record);
      logger.error("[UpdateManager] typecheck failed, aborting update");
      await gitCheckout(record.previousKnownGoodCommit);
      return false;
    }

    logger.info("[UpdateManager] running build...");
    record.buildResult = (await runBuild()) ? "passed" : "failed";
    if (record.buildResult === "failed") {
      record.state = "FAILED";
      record.error = "build failed - keeping current version";
      saveRecord(record);
      logger.error("[UpdateManager] build failed, aborting update");
      await gitCheckout(record.previousKnownGoodCommit);
      return false;
    }

    logger.info("[UpdateManager] running critical tests...");
    record.testResult = (await runCriticalTests()) ? "passed" : "failed";
    if (record.testResult === "failed") {
      record.state = "FAILED";
      record.error = "tests failed - keeping current version";
      saveRecord(record);
      logger.error("[UpdateManager] tests failed, aborting update");
      await gitCheckout(record.previousKnownGoodCommit);
      return false;
    }

    record.state = "RESTART_PENDING";
    record.restartResult = "pending";
    saveRecord(record);
    updateState = "RESTART_PENDING";

    logger.info(
      `[UpdateManager] all validation passed. Restarting in 5s... (previous=${record.previousKnownGoodCommit}, target=${record.targetCommit})`
    );

    setTimeout(() => {
      record.restartResult = "success";
      saveRecord(record);
      releaseLock();
      process.exit(0);
    }, 5_000);

    return true;
  } catch (error) {
    record.state = "FAILED";
    record.error = error instanceof Error ? error.message : String(error);
    saveRecord(record);
    logger.error(`[UpdateManager] update failed: ${record.error}`);
    await gitCheckout(record.previousKnownGoodCommit);
    return false;
  } finally {
    if (record.state !== "RESTART_PENDING") {
      isUpdating = false;
      updateState = "IDLE";
      releaseLock();
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
