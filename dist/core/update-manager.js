"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var update_manager_exports = {};
__export(update_manager_exports, {
  getUpdateRecord: () => getUpdateRecord,
  getUpdateStatus: () => getUpdateStatus,
  postStartValidation: () => postStartValidation,
  startUpdateManager: () => startUpdateManager,
  stopUpdateManager: () => stopUpdateManager
});
module.exports = __toCommonJS(update_manager_exports);
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));
var import_logger = require("../logger");
const DEFAULT_CONFIG = {
  branch: "main",
  checkIntervalMs: 5 * 60 * 1e3,
  lockFile: import_node_path.default.join(process.cwd(), "data", ".update-lock"),
  recordFile: import_node_path.default.join(process.cwd(), "data", "update-record.json"),
  maxRollbackAttempts: 2,
  healthCheckDelayMs: 15e3
};
let config = { ...DEFAULT_CONFIG };
let checkTimer = null;
let currentVersion = "";
let isUpdating = false;
let updateState = "IDLE";
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getShortCommit() {
  try {
    return (0, import_node_child_process.execFileSync)("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return "unknown";
  }
}
function getFullCommit() {
  try {
    return (0, import_node_child_process.execFileSync)("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return "unknown";
  }
}
function getRemoteHead() {
  try {
    (0, import_node_child_process.execFileSync)("git", ["fetch", "origin", config.branch, "--quiet"], {
      encoding: "utf8",
      timeout: 3e4
    });
    return (0, import_node_child_process.execFileSync)("git", ["rev-parse", `origin/${config.branch}`], {
      encoding: "utf8",
      timeout: 5e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    import_logger.logger.warn(
      `[UpdateManager] failed to fetch remote: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
function gitCheckout(commit) {
  try {
    (0, import_node_child_process.execFileSync)("git", ["checkout", commit], {
      encoding: "utf8",
      timeout: 3e4,
      cwd: process.cwd()
    });
    import_logger.logger.info(`[UpdateManager] checked out ${commit}`);
    return true;
  } catch (error) {
    import_logger.logger.error(
      `[UpdateManager] git checkout ${commit} failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}
function gitPull() {
  try {
    (0, import_node_child_process.execFileSync)("git", ["pull", "origin", config.branch, "--ff-only"], {
      encoding: "utf8",
      timeout: 3e4,
      cwd: process.cwd()
    });
    return true;
  } catch {
    return false;
  }
}
function acquireLock() {
  try {
    const dataDir = import_node_path.default.dirname(config.lockFile);
    if (!(0, import_node_fs.existsSync)(dataDir)) {
      (0, import_node_fs.mkdirSync)(dataDir, { recursive: true });
    }
    if ((0, import_node_fs.existsSync)(config.lockFile)) {
      const lockContent = (0, import_node_fs.readFileSync)(config.lockFile, "utf8");
      const lockData = JSON.parse(lockContent);
      const lockAge = Date.now() - (lockData.acquiredAt || 0);
      if (lockAge < 30 * 60 * 1e3) {
        import_logger.logger.warn(
          `[UpdateManager] update lock held by PID ${lockData.pid} (${Math.round(lockAge / 1e3)}s ago)`
        );
        return false;
      }
      import_logger.logger.warn("[UpdateManager] stale lock detected, removing");
    }
    (0, import_node_fs.writeFileSync)(
      config.lockFile,
      JSON.stringify({ pid: process.pid, acquiredAt: Date.now() })
    );
    return true;
  } catch (error) {
    import_logger.logger.error(
      `[UpdateManager] lock acquisition failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}
function releaseLock() {
  try {
    if ((0, import_node_fs.existsSync)(config.lockFile)) {
      (0, import_node_fs.unlinkSync)(config.lockFile);
    }
  } catch {
  }
}
function saveRecord(record) {
  try {
    const dataDir = import_node_path.default.dirname(config.recordFile);
    if (!(0, import_node_fs.existsSync)(dataDir)) {
      (0, import_node_fs.mkdirSync)(dataDir, { recursive: true });
    }
    (0, import_node_fs.writeFileSync)(config.recordFile, JSON.stringify(record, null, 2));
  } catch {
  }
}
function getUpdateRecord() {
  try {
    if ((0, import_node_fs.existsSync)(config.recordFile)) {
      return JSON.parse((0, import_node_fs.readFileSync)(config.recordFile, "utf8"));
    }
  } catch {
  }
  return null;
}
function runTypecheck() {
  try {
    (0, import_node_child_process.execFileSync)("node", ["./node_modules/.bin/tsc", "--noEmit"], {
      encoding: "utf8",
      timeout: 12e4,
      cwd: process.cwd()
    });
    return true;
  } catch {
    return false;
  }
}
function runBuild() {
  try {
    (0, import_node_child_process.execFileSync)("node", ["./node_modules/.bin/tsc"], {
      encoding: "utf8",
      timeout: 12e4,
      cwd: process.cwd()
    });
    return true;
  } catch {
    return false;
  }
}
function runCriticalTests() {
  try {
    (0, import_node_child_process.execFileSync)("node", ["./node_modules/.bin/tsx", "scripts/run-all-tests.ts"], {
      encoding: "utf8",
      timeout: 6e5,
      cwd: process.cwd(),
      env: { ...process.env, NODE_OPTIONS: "" }
    });
    return true;
  } catch {
    return false;
  }
}
function installDepsIfNeeded() {
  try {
    const lockfile = import_node_path.default.join(process.cwd(), "package-lock.json");
    const nodeModules = import_node_path.default.join(process.cwd(), "node_modules");
    if (!(0, import_node_fs.existsSync)(nodeModules) || !(0, import_node_fs.existsSync)(lockfile)) {
      import_logger.logger.info("[UpdateManager] installing dependencies...");
      (0, import_node_child_process.execFileSync)("npm", ["ci", "--include=dev"], {
        encoding: "utf8",
        timeout: 12e4,
        cwd: process.cwd()
      });
    }
    return true;
  } catch {
    return false;
  }
}
function runPostStartHealthCheck() {
  try {
    const dbPath = import_node_path.default.join(process.cwd(), "data", "ashenai.db");
    if (!(0, import_node_fs.existsSync)(dbPath)) {
      return { healthy: false, reason: "database file missing" };
    }
    const criticalFiles = ["src/index.ts", "package.json", "tsconfig.json"];
    const missing = criticalFiles.filter(
      (f) => !(0, import_node_fs.existsSync)(import_node_path.default.join(process.cwd(), f))
    );
    if (missing.length > 0) {
      return { healthy: false, reason: `critical files missing: ${missing.join(", ")}` };
    }
    if (!(0, import_node_fs.existsSync)(import_node_path.default.join(process.cwd(), "node_modules"))) {
      return { healthy: false, reason: "node_modules missing" };
    }
    const dataDir = import_node_path.default.join(process.cwd(), "data");
    if ((0, import_node_fs.existsSync)(dataDir)) {
      try {
        const testFile = import_node_path.default.join(dataDir, ".health-test");
        (0, import_node_fs.writeFileSync)(testFile, "ok");
        (0, import_node_fs.unlinkSync)(testFile);
      } catch {
        return { healthy: false, reason: "data directory not writable" };
      }
    }
    return { healthy: true, reason: "all checks passed" };
  } catch (error) {
    return {
      healthy: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
async function postStartValidation() {
  const record = getUpdateRecord();
  if (!record) return;
  if (record.state !== "RESTART_PENDING" && record.state !== "HEALTH_CHECKING") {
    return;
  }
  if (record.state === "HEALTH_CHECKING" && record.rollbackResult === "pending") {
    import_logger.logger.info("[UpdateManager] post-start: checking rolled-back version health...");
    await sleep(config.healthCheckDelayMs);
    const health = runPostStartHealthCheck();
    if (health.healthy) {
      record.state = "ROLLED_BACK";
      record.healthResult = "passed";
      record.rollbackResult = "success";
      saveRecord(record);
      import_logger.logger.info(`[UpdateManager] rollback to ${record.previousKnownGoodCommit} verified healthy.`);
    } else {
      record.state = "ROLLBACK_FAILED";
      record.healthResult = "failed";
      record.rollbackResult = "failed";
      record.error = `rollback health check failed: ${health.reason}`;
      saveRecord(record);
      import_logger.logger.error(`[UpdateManager] ROLLBACK FAILED: ${record.error}`);
    }
    return;
  }
  if (record.state === "RESTART_PENDING") {
    import_logger.logger.info("[UpdateManager] post-start: checking new version health...");
    await sleep(config.healthCheckDelayMs);
    const health = runPostStartHealthCheck();
    if (health.healthy) {
      record.state = "SUCCESS";
      record.healthResult = "passed";
      record.currentCommit = getShortCommit();
      saveRecord(record);
      import_logger.logger.info(`[UpdateManager] new version ${record.targetCommit} verified healthy and is now known-good.`);
    } else {
      import_logger.logger.warn(`[UpdateManager] new version health check failed: ${health.reason}`);
      await triggerRollback(record);
    }
  }
}
async function triggerRollback(record) {
  if (record.rollbackAttempt >= config.maxRollbackAttempts) {
    record.state = "ROLLBACK_FAILED";
    record.healthResult = "failed";
    record.rollbackResult = "failed";
    record.error = `max rollback attempts (${config.maxRollbackAttempts}) exhausted`;
    saveRecord(record);
    import_logger.logger.error(`[UpdateManager] ${record.error}`);
    return;
  }
  const previousCommit = record.previousKnownGoodCommit;
  if (!previousCommit || previousCommit === "unknown") {
    record.state = "ROLLBACK_FAILED";
    record.healthResult = "failed";
    record.rollbackResult = "failed";
    record.error = "no previous known-good commit to rollback to";
    saveRecord(record);
    import_logger.logger.error(`[UpdateManager] ${record.error}`);
    return;
  }
  if (!record.failedTargets.includes(record.targetCommit)) {
    record.failedTargets.push(record.targetCommit);
  }
  record.state = "ROLLING_BACK";
  record.rollbackAttempt++;
  record.healthResult = "failed";
  saveRecord(record);
  import_logger.logger.info(
    `[UpdateManager] ROLLING BACK: ${record.targetCommit} -> ${previousCommit} (attempt ${record.rollbackAttempt}/${config.maxRollbackAttempts})`
  );
  if (!gitCheckout(previousCommit)) {
    record.state = "ROLLBACK_FAILED";
    record.rollbackResult = "failed";
    record.error = `git checkout ${previousCommit} failed`;
    saveRecord(record);
    import_logger.logger.error(`[UpdateManager] ${record.error}`);
    return;
  }
  if (!installDepsIfNeeded()) {
    record.state = "ROLLBACK_FAILED";
    record.rollbackResult = "failed";
    record.error = "dependency installation failed during rollback";
    saveRecord(record);
    import_logger.logger.error(`[UpdateManager] ${record.error}`);
    return;
  }
  if (!runBuild()) {
    record.state = "ROLLBACK_FAILED";
    record.rollbackResult = "failed";
    record.error = "build failed during rollback";
    saveRecord(record);
    import_logger.logger.error(`[UpdateManager] ${record.error}`);
    return;
  }
  record.state = "HEALTH_CHECKING";
  record.rollbackResult = "pending";
  saveRecord(record);
  import_logger.logger.info(
    `[UpdateManager] rollback to ${previousCommit} built successfully. Restarting in 5s...`
  );
  setTimeout(() => {
    releaseLock();
    process.exit(0);
  }, 5e3);
}
async function performUpdate() {
  if (isUpdating) {
    import_logger.logger.warn("[UpdateManager] update already in progress");
    return false;
  }
  const remoteCommit = getRemoteHead();
  if (!remoteCommit) {
    return false;
  }
  const localCommit = getShortCommit();
  if (remoteCommit === localCommit || remoteCommit.slice(0, 7) === localCommit) {
    return false;
  }
  const existingRecord = getUpdateRecord();
  if (existingRecord?.failedTargets?.includes(remoteCommit.slice(0, 7))) {
    import_logger.logger.warn(
      `[UpdateManager] commit ${remoteCommit.slice(0, 7)} previously failed, skipping`
    );
    return false;
  }
  import_logger.logger.info(
    `[UpdateManager] new commit detected: ${localCommit} -> ${remoteCommit.slice(0, 7)}`
  );
  if (!acquireLock()) {
    return false;
  }
  isUpdating = true;
  updateState = "UPDATING";
  const record = {
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
    failedTargets: existingRecord?.failedTargets || []
  };
  try {
    import_logger.logger.info("[UpdateManager] pulling changes...");
    if (!gitPull()) {
      record.state = "FAILED";
      record.error = "git pull failed";
      saveRecord(record);
      return false;
    }
    import_logger.logger.info("[UpdateManager] checking dependencies...");
    if (!installDepsIfNeeded()) {
      record.state = "FAILED";
      record.error = "dependency installation failed";
      saveRecord(record);
      return false;
    }
    updateState = "VALIDATING";
    record.state = "VALIDATING";
    import_logger.logger.info("[UpdateManager] running typecheck...");
    record.validationResult = runTypecheck() ? "passed" : "failed";
    if (record.validationResult === "failed") {
      record.state = "FAILED";
      record.error = "typecheck failed - keeping current version";
      saveRecord(record);
      import_logger.logger.error("[UpdateManager] typecheck failed, aborting update");
      gitCheckout(record.previousKnownGoodCommit);
      return false;
    }
    import_logger.logger.info("[UpdateManager] running build...");
    record.buildResult = runBuild() ? "passed" : "failed";
    if (record.buildResult === "failed") {
      record.state = "FAILED";
      record.error = "build failed - keeping current version";
      saveRecord(record);
      import_logger.logger.error("[UpdateManager] build failed, aborting update");
      gitCheckout(record.previousKnownGoodCommit);
      return false;
    }
    import_logger.logger.info("[UpdateManager] running critical tests...");
    record.testResult = runCriticalTests() ? "passed" : "failed";
    if (record.testResult === "failed") {
      record.state = "FAILED";
      record.error = "tests failed - keeping current version";
      saveRecord(record);
      import_logger.logger.error("[UpdateManager] tests failed, aborting update");
      gitCheckout(record.previousKnownGoodCommit);
      return false;
    }
    record.state = "RESTART_PENDING";
    record.restartResult = "pending";
    saveRecord(record);
    updateState = "RESTART_PENDING";
    import_logger.logger.info(
      `[UpdateManager] all validation passed. Restarting in 5s... (previous=${record.previousKnownGoodCommit}, target=${record.targetCommit})`
    );
    setTimeout(() => {
      record.restartResult = "success";
      saveRecord(record);
      releaseLock();
      process.exit(0);
    }, 5e3);
    return true;
  } catch (error) {
    record.state = "FAILED";
    record.error = error instanceof Error ? error.message : String(error);
    saveRecord(record);
    import_logger.logger.error(`[UpdateManager] update failed: ${record.error}`);
    gitCheckout(record.previousKnownGoodCommit);
    return false;
  } finally {
    if (record.state !== "RESTART_PENDING") {
      isUpdating = false;
      updateState = "IDLE";
      releaseLock();
    }
  }
}
function getUpdateStatus() {
  const current = getShortCommit();
  const record = getUpdateRecord();
  let latestAvailable = null;
  try {
    if (!isUpdating) {
      const remote = getRemoteHead();
      latestAvailable = remote?.slice(0, 7) ?? null;
    }
  } catch {
  }
  return {
    currentCommit: current,
    knownGoodCommit: record?.state === "SUCCESS" ? record.targetCommit : record?.previousKnownGoodCommit ?? null,
    targetCommit: record?.targetCommit ?? null,
    latestAvailable,
    updateAvailable: latestAvailable ? latestAvailable !== current : false,
    updateState,
    lastUpdate: record,
    lastFailedUpdate: record?.state === "FAILED" || record?.state === "ROLLBACK_FAILED" ? record : null,
    lastRollback: record?.state === "ROLLED_BACK" || record?.state === "ROLLBACK_FAILED" ? record : null,
    isUpdating,
    branch: config.branch
  };
}
function startUpdateManager(customConfig) {
  if (customConfig) {
    config = { ...DEFAULT_CONFIG, ...customConfig };
  }
  currentVersion = getShortCommit();
  import_logger.logger.info(
    `[UpdateManager] monitoring branch=${config.branch} every ${config.checkIntervalMs / 1e3}s (current=${currentVersion})`
  );
  checkTimer = setInterval(async () => {
    try {
      await performUpdate();
    } catch (error) {
      import_logger.logger.error(
        `[UpdateManager] check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }, config.checkIntervalMs);
  checkTimer.unref?.();
}
function stopUpdateManager() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
  releaseLock();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getUpdateRecord,
  getUpdateStatus,
  postStartValidation,
  startUpdateManager,
  stopUpdateManager
});
