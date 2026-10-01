import fs from "fs";
import path from "path";
import { logger } from "../logger";

import { typecheck, runTests } from "./tools";
import { isUpdateInProgress } from "../core/update-lifecycle";

type RepairCallback = (
  filePath: string,
  errorOutput: string,
) => Promise<boolean>;

const PROJECT_ROOT = process.cwd();

const WATCH_DIRS = [
  path.join(PROJECT_ROOT, "src"),
  path.join(PROJECT_ROOT, "scripts"),
];

const IGNORED_NAMES = new Set([
  "node_modules",
  ".git",
]);

const knownFiles = new Map<string, number>();
const repairing = new Set<string>();

let repairCallback: RepairCallback | undefined;
let scanRunning = false;
let healerInterval: ReturnType<typeof setInterval> | undefined;
let healerRunning = false;

export const SCAN_INTERVAL_MS = 10_000;

let pendingChanges = new Set<string>();
let drainPromise: Promise<void> | undefined;

/* ================================================================
 * UPDATE COORDINATION
 *
 * While the update manager is pulling / validating / rolling back,
 * the Self-Healer must not scan, verify, repair, or write sources —
 * otherwise old process + new tree compete and updates corrupt each
 * other. `suspended` is set explicitly by the update manager;
 * `isUpdateInProgress()` is the shared in-memory lifecycle flag.
 * ================================================================ */

let suspended = false;

function updateBlocked(): boolean {
  return suspended || isUpdateInProgress();
}

/* ================================================================
 * METRICS + TEST SEAMS
 * ================================================================ */

let verificationRuns = 0;
let repairAttempts = 0;

export function getSelfHealMetrics(): {
  verificationRuns: number;
  repairAttempts: number;
} {
  return { verificationRuns, repairAttempts };
}

export function resetSelfHealMetrics(): void {
  verificationRuns = 0;
  repairAttempts = 0;
}

export interface SelfHealVerifier {
  typecheck: () => Promise<string>;
  runTests: () => Promise<string>;
}

const defaultVerifier: SelfHealVerifier = {
  typecheck,
  runTests,
};

let activeVerifier: SelfHealVerifier = defaultVerifier;

/**
 * Test seam: replace the expensive verifier (tsc / full npm test)
 * with deterministic fakes. Pass undefined to restore the real one.
 * Production code never calls this.
 */
export function setSelfHealVerifierForTests(
  verifier?: SelfHealVerifier,
): void {
  activeVerifier = verifier ?? defaultVerifier;
}

/** Test seam: trigger one scan cycle without waiting for the interval. */
export function runSelfHealScanNow(): void {
  scanForChanges();
}

function isSourceFile(filePath: string): boolean {
  return (
    filePath.endsWith(".ts") &&
    !filePath.endsWith(".d.ts") &&
    !filePath.includes(".backup") &&
    !filePath.includes(".corrupted-backup")
  );
}

function shouldIgnore(filePath: string): boolean {
  const parts = filePath.split(path.sep);

  return parts.some((part) =>
    IGNORED_NAMES.has(part),
  );
}

function relative(filePath: string): string {
  return path.relative(PROJECT_ROOT, filePath);
}

function collectFiles(directory: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(directory)) {
    return files;
  }

  function walk(dir: string): void {
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(dir, {
        withFileTypes: true,
      });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(
        dir,
        entry.name,
      );

      if (shouldIgnore(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (
        entry.isFile() &&
        isSourceFile(fullPath)
      ) {
        files.push(fullPath);
      }
    }
  }

  walk(directory);
  return files;
}

function snapshotFiles(): void {
  knownFiles.clear();

  for (const directory of WATCH_DIRS) {
    for (const filePath of collectFiles(directory)) {
      try {
        knownFiles.set(
          filePath,
          fs.statSync(filePath).mtimeMs,
        );
      } catch {
        // Ignore temporary filesystem changes.
      }
    }
  }
}

/**
 * Classify a test-runner output as failed.
 *
 * IMPORTANT: must NOT match "0 failed" (only 1..999 failed counts).
 * Exported for regression tests.
 */
export function isTestFailure(testOutput: string): boolean {
  return (
    /(?:^|\n)\s*(?:❌\s+)?FAIL[:\s]/im.test(testOutput) ||
    /\b[1-9]\d*\s+\w*\s*failed\b/i.test(testOutput) ||
    /error TS\d+/i.test(testOutput) ||
    /npm ERR!/.test(testOutput)
  );
}

async function verify(): Promise<{
  passed: boolean;
  output: string;
  aborted?: boolean;
}> {
  if (updateBlocked()) {
    // No work, no metric: verification runs during an update must stay 0.
    return {
      passed: false,
      output: "",
      aborted: true,
    };
  }

  verificationRuns++;

  logger.info("🧪 Checking TypeScript...");

  const typeOutput = await activeVerifier.typecheck();

  const typeFailed =
    /error TS\d+/i.test(typeOutput) ||
    /error:/i.test(typeOutput);

  if (typeFailed) {
    return {
      passed: false,
      output: typeOutput,
    };
  }

  if (updateBlocked()) {
    // Update started while typecheck was running: stop before tests.
    return {
      passed: false,
      output: "",
      aborted: true,
    };
  }

  logger.info("✅ TypeScript passed.");
  logger.info("🧪 Running tests...");

  const testOutput = await activeVerifier.runTests();

  const testFailed = isTestFailure(testOutput);

  return {
    passed: !testFailed,
    output:
      typeOutput +
      "\n\n=== TESTS ===\n" +
      testOutput,
  };
}

function queueChange(filePath: string): void {
  pendingChanges.add(filePath);

  if (!drainPromise) {
    startDrain();
  }
}

function startDrain(): void {
  drainPromise = drainChanges()
    .finally(() => {
      drainPromise = undefined;

      if (pendingChanges.size > 0) {
        startDrain();
      }
    })
    .catch(() => {
      // Keep the change-drain worker alive; per-iteration errors are logged in the loop.
    });
}

async function drainChanges(): Promise<void> {
  while (pendingChanges.size > 0) {
    if (updateBlocked()) {
      // Discard queued work: during an update no verification may start.
      pendingChanges.clear();
      return;
    }

    await new Promise((resolve) => setImmediate(resolve));

    if (updateBlocked()) {
      pendingChanges.clear();
      return;
    }

    const batch = [...pendingChanges].filter(
      (filePath) => !repairing.has(filePath),
    );
    pendingChanges.clear();

    if (batch.length === 0) {
      continue;
    }

    try {
      logger.info("");
      logger.info("🩹 AshenAI Self-Healer");
      logger.info(
        `👀 Changed: ${batch
          .map((filePath) => relative(filePath))
          .join(", ")}`,
      );

      const verification = await verify();

      if (verification.aborted) {
        continue;
      }

      if (verification.passed) {
        logger.info(
          "✅ TypeScript and tests are healthy.",
        );
        continue;
      }

      if (updateBlocked()) {
        // Update started mid-verification: never begin repairs then.
        pendingChanges.clear();
        return;
      }

      for (const filePath of batch) {
        await handleChange(
          filePath,
          verification,
        );
      }
    } catch (error) {
      logger.warn(
        "Self-healer verification failed:",
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }
}

async function handleChange(
  filePath: string,
  preVerified?: {
    passed: boolean;
    output: string;
    aborted?: boolean;
  },
): Promise<void> {
  if (repairing.has(filePath)) {
    return;
  }

  if (updateBlocked()) {
    // Never start repair work while an update is in progress.
    return;
  }

  logger.info("");
  logger.info("🩹 AshenAI Self-Healer");
  logger.info(
    `👀 Changed: ${relative(filePath)}`,
  );

  const verification =
    preVerified ?? (await verify());

  if (verification.aborted) {
    return;
  }

  if (verification.passed) {
    logger.info(
      "✅ TypeScript and tests are healthy.",
    );
    return;
  }

  logger.info("❌ Verification failed.");
  logger.info(
    verification.output.slice(0, 12000),
  );

  if (!repairCallback) {
    logger.info(
      "⚠️ No repair engine connected.",
    );
    return;
  }

  logger.info(
    "🧠 Sending the actual failure to AshenAI...",
  );

  if (updateBlocked()) {
    logger.info(
      "⏸️ Update started — repair deferred.",
    );
    return;
  }

  const backupPath =
    `${filePath}.self-heal-backup`;

  try {
    repairing.add(filePath);

    await fs.promises.copyFile(
      filePath,
      backupPath,
    );

    if (updateBlocked()) {
      // Update began during the backup copy: abandon before any write.
      try {
        await fs.promises.unlink(backupPath);
      } catch {
        // Backup may not exist.
      }

      logger.info(
        "⏸️ Update started — repair deferred.",
      );
      return;
    }

    repairAttempts++;

    const repaired = await repairCallback(
      relative(filePath),
      verification.output.slice(0, 30000),
    );

    if (!repaired) {
      logger.info(
        "❌ AshenAI could not safely repair the file.",
      );

      await fs.promises.copyFile(
        backupPath,
        filePath,
      );

      logger.info(
        "↩️ Original file restored.",
      );

      return;
    }

    logger.info(
      "🔍 Verifying repair...",
    );

    const finalVerification =
      await verify();

    if (!finalVerification.passed) {
      if (finalVerification.aborted) {
        logger.info(
          "⏸️ Update started during repair — restoring original file.",
        );
      } else {
        logger.info(
          "❌ AI repair failed verification.",
        );
      }

      await fs.promises.copyFile(
        backupPath,
        filePath,
      );

      logger.info(
        "↩️ Broken repair restored from backup.",
      );

      return;
    }

    logger.info(
      "✅ SELF-HEAL SUCCESS",
    );

    logger.info(
      `   Repaired: ${relative(filePath)}`,
    );

    logger.info(
      "   TypeScript: PASS",
    );

    logger.info(
      "   Tests: PASS",
    );
  } catch (error) {
    logger.info(
      "❌ Self-Healer error:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    try {
      if (fs.existsSync(backupPath)) {
        await fs.promises.copyFile(
          backupPath,
          filePath,
        );

        logger.info(
          "↩️ Original file restored.",
        );
      }
    } catch {
      logger.info(
        "⚠️ Could not restore backup.",
      );
    }
  } finally {
    repairing.delete(filePath);

    try {
      knownFiles.set(
        filePath,
        fs.statSync(filePath).mtimeMs,
      );
    } catch {
      knownFiles.delete(filePath);
    }

    try {
      await fs.promises.unlink(backupPath);
    } catch {
      // Backup may not exist.
    }
  }
}

function scanForChanges(): void {
  if (!healerRunning || scanRunning || updateBlocked()) {
    // During an update: no scan, no queueing, no repair triggers.
    return;
  }

  scanRunning = true;

  try {
    const currentFiles = new Set<string>();

    for (const directory of WATCH_DIRS) {
      for (const filePath of collectFiles(directory)) {
        currentFiles.add(filePath);

        try {
          const stat = fs.statSync(filePath);
          const previous = knownFiles.get(
            filePath,
          );

          if (previous === undefined) {
            knownFiles.set(
              filePath,
              stat.mtimeMs,
            );
            continue;
          }

          if (
            stat.mtimeMs !== previous &&
            !repairing.has(filePath)
          ) {
            knownFiles.set(
              filePath,
              stat.mtimeMs,
            );

            logger.info(
              `\n✏️ Source changed: ${relative(filePath)}`,
            );

            queueChange(filePath);
          }
        } catch {
          // Ignore temporary filesystem changes.
        }
      }
    }

    for (const filePath of knownFiles.keys()) {
      if (!currentFiles.has(filePath)) {
        knownFiles.delete(filePath);

        logger.info(
          `\n🗑️ Source removed: ${relative(filePath)}`,
        );
      }
    }
  } finally {
    scanRunning = false;
  }
}

/**
 * Run the existing Self-Healer repair pipeline manually.
 *
 * This reuses the same repair callback used by the filesystem watcher.
 * It does not create a second repair engine.
 */
export async function repairFile(
  filePath: string,
  errorOutput: string,
): Promise<boolean> {
  if (updateBlocked()) {
    logger.warn(
      "⏸️ Self-Healer repair rejected: update in progress.",
    );
    return false;
  }

  if (!repairCallback) {
    throw new Error(
      "Self-Healer repair engine is not connected.",
    );
  }

  const fullPath = path.resolve(
    PROJECT_ROOT,
    filePath,
  );

  const root = path.resolve(PROJECT_ROOT);

  if (
    fullPath !== root &&
    !fullPath.startsWith(root + path.sep)
  ) {
    throw new Error(
      "Repair path outside project is blocked.",
    );
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Repair target does not exist: ${filePath}`,
    );
  }

  if (repairing.has(fullPath)) {
    throw new Error(
      `File is already being repaired: ${filePath}`,
    );
  }

  const backupPath =
    `${fullPath}.task-repair-backup`;

  repairing.add(fullPath);

  try {
    await fs.promises.copyFile(
      fullPath,
      backupPath,
    );

    if (updateBlocked()) {
      // Update began during the backup copy: abandon before any write.
      logger.warn(
        "⏸️ Self-Healer repair rejected: update in progress.",
      );
      return false;
    }

    repairAttempts++;

    const repaired =
      await repairCallback(
        path.relative(PROJECT_ROOT, fullPath),
        errorOutput.slice(0, 30000),
      );

    if (!repaired) {
      await fs.promises.copyFile(
        backupPath,
        fullPath,
      );

      return false;
    }

    const verification =
      await verify();

    if (!verification.passed) {
      await fs.promises.copyFile(
        backupPath,
        fullPath,
      );

      return false;
    }

    return true;
  } catch (error) {
    try {
      if (fs.existsSync(backupPath)) {
        await fs.promises.copyFile(
          backupPath,
          fullPath,
        );
      }
    } catch {
      // Preserve the original error.
    }

    throw error;
  } finally {
    repairing.delete(fullPath);

    try {
      await fs.promises.unlink(backupPath);
    } catch {
      // Backup may already be gone.
    }

    try {
      knownFiles.set(
        fullPath,
        fs.statSync(fullPath).mtimeMs,
      );
    } catch {
      knownFiles.delete(fullPath);
    }
  }
}

export function startSelfHealer(
  callback?: RepairCallback,
): void {
  if (healerRunning) {
    logger.info(
      "🩹 Self-Healer is already running.",
    );
    return;
  }

  repairCallback = callback;
  healerRunning = true;

  logger.info(
    "🩹 AshenAI Self-Healer starting...",
  );

  logger.info(
    "👀 Watching source files for changes",
  );

  logger.info(
    "📱 Termux polling mode enabled",
  );

  logger.info(
    "🧪 TypeScript errors will be checked automatically",
  );

  logger.info(
    "💾 Broken automatic repairs are restored from backup",
  );

  for (const directory of WATCH_DIRS) {
    logger.info(
      `📂 Watching: ${relative(directory)}`,
    );
  }

  snapshotFiles();

  if (suspended) {
    logger.info(
      "⏸️ Self-Healer is suspended for an update — polling starts after resume.",
    );
  } else {
    healerInterval = setInterval(
      () => {
        scanForChanges();
      },
      SCAN_INTERVAL_MS,
    );

    logger.info(
      "🟢 Self-Healer polling loop is running.",
    );
  }
}

export function stopSelfHealer(): void {
  if (!healerRunning) {
    return;
  }

  healerRunning = false;

  if (healerInterval) {
    clearInterval(healerInterval);
    healerInterval = undefined;
  }

  repairCallback = undefined;
  scanRunning = false;

  logger.info(
    "🔴 AshenAI Self-Healer stopped.",
  );
}

export function isSelfHealerRunning(): boolean {
  return healerRunning;
}

/* ================================================================
 * UPDATE COORDINATION API
 *
 * Called exclusively by src/core/update-manager.ts around git
 * operations. Semantics:
 *   suspend  — stop polling, drop queued work, keep `healerRunning`
 *              true so health/preflight still report LIVE (the healer
 *              exists; it is intentionally parked).
 *   resume   — re-baseline the file snapshot (absorbs everything the
 *              update/rollback just wrote) and restart polling. The
 *              re-baseline is what guarantees no verification storm
 *              on the freshly pulled tree.
 * ================================================================ */

export function suspendSelfHealer(): void {
  if (suspended) {
    return;
  }

  suspended = true;
  pendingChanges.clear();

  if (healerInterval) {
    clearInterval(healerInterval);
    healerInterval = undefined;
  }

  logger.info(
    "⏸️ AshenAI Self-Healer suspended for update",
  );
}

export function resumeSelfHealer(): void {
  if (!suspended) {
    return;
  }

  suspended = false;
  pendingChanges.clear();

  if (healerRunning) {
    // Re-baseline FIRST: pull/rollback file changes must not be
    // detected as fresh user edits after resume.
    snapshotFiles();

    if (!healerInterval) {
      healerInterval = setInterval(
        () => {
          scanForChanges();
        },
        SCAN_INTERVAL_MS,
      );
    }

    logger.info(
      "▶️ AshenAI Self-Healer resumed after update",
    );
  }
}

export function isSelfHealerSuspended(): boolean {
  return suspended;
}

/**
 * Quiesce helper for the update manager: resolves true once no scan
 * is running, no change-drain is in flight, and no file is being
 * repaired. Returns false on timeout.
 */
export async function waitForSelfHealIdle(
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (
      !drainPromise &&
      !scanRunning &&
      repairing.size === 0
    ) {
      return true;
    }

    if (Date.now() >= deadline) {
      return false;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 50),
    );
  }
}
