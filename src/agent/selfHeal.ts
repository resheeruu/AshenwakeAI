import fs from "fs";
import path from "path";

import { typecheck, runTests } from "./tools";

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

async function verify(): Promise<{
  passed: boolean;
  output: string;
}> {
  console.log("🧪 Checking TypeScript...");

  const typeOutput = await typecheck();

  const typeFailed =
    /error TS\d+/i.test(typeOutput) ||
    /error:/i.test(typeOutput) ||
    /failed/i.test(typeOutput);

  if (typeFailed) {
    return {
      passed: false,
      output: typeOutput,
    };
  }

  console.log("✅ TypeScript passed.");
  console.log("🧪 Running tests...");

  const testOutput = await runTests();

  const testFailed =
    /FAIL/i.test(testOutput) ||
    /failed/i.test(testOutput) ||
    /error TS\d+/i.test(testOutput);

  return {
    passed: !testFailed,
    output:
      typeOutput +
      "\n\n=== TESTS ===\n" +
      testOutput,
  };
}

async function handleChange(
  filePath: string,
): Promise<void> {
  if (repairing.has(filePath)) {
    return;
  }

  console.log("");
  console.log("🩹 AshenAI Self-Healer");
  console.log(
    `👀 Changed: ${relative(filePath)}`,
  );

  const verification = await verify();

  if (verification.passed) {
    console.log(
      "✅ TypeScript and tests are healthy.",
    );
    return;
  }

  console.log("❌ Verification failed.");
  console.log(
    verification.output.slice(0, 12000),
  );

  if (!repairCallback) {
    console.log(
      "⚠️ No repair engine connected.",
    );
    return;
  }

  console.log(
    "🧠 Sending the actual failure to AshenAI...",
  );

  const backupPath =
    `${filePath}.self-heal-backup`;

  try {
    repairing.add(filePath);

    await fs.promises.copyFile(
      filePath,
      backupPath,
    );

    const repaired = await repairCallback(
      relative(filePath),
      verification.output.slice(0, 30000),
    );

    if (!repaired) {
      console.log(
        "❌ AshenAI could not safely repair the file.",
      );

      await fs.promises.copyFile(
        backupPath,
        filePath,
      );

      console.log(
        "↩️ Original file restored.",
      );

      return;
    }

    console.log(
      "🔍 Verifying repair...",
    );

    const finalVerification =
      await verify();

    if (!finalVerification.passed) {
      console.log(
        "❌ AI repair failed verification.",
      );

      await fs.promises.copyFile(
        backupPath,
        filePath,
      );

      console.log(
        "↩️ Broken repair restored from backup.",
      );

      return;
    }

    console.log(
      "✅ SELF-HEAL SUCCESS",
    );

    console.log(
      `   Repaired: ${relative(filePath)}`,
    );

    console.log(
      "   TypeScript: PASS",
    );

    console.log(
      "   Tests: PASS",
    );
  } catch (error) {
    console.log(
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

        console.log(
          "↩️ Original file restored.",
        );
      }
    } catch {
      console.log(
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
  if (!healerRunning || scanRunning) {
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

            console.log(
              `\n✏️ Source changed: ${relative(filePath)}`,
            );

            void handleChange(filePath);
          }
        } catch {
          // Ignore temporary filesystem changes.
        }
      }
    }

    for (const filePath of knownFiles.keys()) {
      if (!currentFiles.has(filePath)) {
        knownFiles.delete(filePath);

        console.log(
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
    console.log(
      "🩹 Self-Healer is already running.",
    );
    return;
  }

  repairCallback = callback;
  healerRunning = true;

  console.log(
    "🩹 AshenAI Self-Healer starting...",
  );

  console.log(
    "👀 Watching source files for changes",
  );

  console.log(
    "📱 Termux polling mode enabled",
  );

  console.log(
    "🧪 TypeScript errors will be checked automatically",
  );

  console.log(
    "💾 Broken automatic repairs are restored from backup",
  );

  for (const directory of WATCH_DIRS) {
    console.log(
      `📂 Watching: ${relative(directory)}`,
    );
  }

  snapshotFiles();

  healerInterval = setInterval(
    () => {
      scanForChanges();
    },
    1000,
  );

  console.log(
    "🟢 Self-Healer polling loop is running.",
  );
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

  console.log(
    "🔴 AshenAI Self-Healer stopped.",
  );
}

export function isSelfHealerRunning(): boolean {
  return healerRunning;
}
