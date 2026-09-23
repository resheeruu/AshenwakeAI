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
var selfHeal_exports = {};
__export(selfHeal_exports, {
  isSelfHealerRunning: () => isSelfHealerRunning,
  repairFile: () => repairFile,
  startSelfHealer: () => startSelfHealer,
  stopSelfHealer: () => stopSelfHealer
});
module.exports = __toCommonJS(selfHeal_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_tools = require("./tools");
const PROJECT_ROOT = process.cwd();
const WATCH_DIRS = [
  import_path.default.join(PROJECT_ROOT, "src"),
  import_path.default.join(PROJECT_ROOT, "scripts")
];
const IGNORED_NAMES = /* @__PURE__ */ new Set([
  "node_modules",
  ".git"
]);
const knownFiles = /* @__PURE__ */ new Map();
const repairing = /* @__PURE__ */ new Set();
let repairCallback;
let scanRunning = false;
let healerInterval;
let healerRunning = false;
function isSourceFile(filePath) {
  return filePath.endsWith(".ts") && !filePath.endsWith(".d.ts") && !filePath.includes(".backup") && !filePath.includes(".corrupted-backup");
}
function shouldIgnore(filePath) {
  const parts = filePath.split(import_path.default.sep);
  return parts.some(
    (part) => IGNORED_NAMES.has(part)
  );
}
function relative(filePath) {
  return import_path.default.relative(PROJECT_ROOT, filePath);
}
function collectFiles(directory) {
  const files = [];
  if (!import_fs.default.existsSync(directory)) {
    return files;
  }
  function walk(dir) {
    let entries;
    try {
      entries = import_fs.default.readdirSync(dir, {
        withFileTypes: true
      });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = import_path.default.join(
        dir,
        entry.name
      );
      if (shouldIgnore(fullPath)) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && isSourceFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  walk(directory);
  return files;
}
function snapshotFiles() {
  knownFiles.clear();
  for (const directory of WATCH_DIRS) {
    for (const filePath of collectFiles(directory)) {
      try {
        knownFiles.set(
          filePath,
          import_fs.default.statSync(filePath).mtimeMs
        );
      } catch {
      }
    }
  }
}
async function verify() {
  console.log("\u{1F9EA} Checking TypeScript...");
  const typeOutput = await (0, import_tools.typecheck)();
  const typeFailed = /error TS\d+/i.test(typeOutput) || /error:/i.test(typeOutput);
  if (typeFailed) {
    return {
      passed: false,
      output: typeOutput
    };
  }
  console.log("\u2705 TypeScript passed.");
  console.log("\u{1F9EA} Running tests...");
  const testOutput = await (0, import_tools.runTests)();
  const testFailed = /(?:^|\n)\s*FAIL[:\s]/im.test(testOutput) || /\b\d+\s+\w*\s*failed\b/i.test(testOutput) || /error TS\d+/i.test(testOutput);
  return {
    passed: !testFailed,
    output: typeOutput + "\n\n=== TESTS ===\n" + testOutput
  };
}
async function handleChange(filePath) {
  if (repairing.has(filePath)) {
    return;
  }
  console.log("");
  console.log("\u{1FA79} AshenAI Self-Healer");
  console.log(
    `\u{1F440} Changed: ${relative(filePath)}`
  );
  const verification = await verify();
  if (verification.passed) {
    console.log(
      "\u2705 TypeScript and tests are healthy."
    );
    return;
  }
  console.log("\u274C Verification failed.");
  console.log(
    verification.output.slice(0, 12e3)
  );
  if (!repairCallback) {
    console.log(
      "\u26A0\uFE0F No repair engine connected."
    );
    return;
  }
  console.log(
    "\u{1F9E0} Sending the actual failure to AshenAI..."
  );
  const backupPath = `${filePath}.self-heal-backup`;
  try {
    repairing.add(filePath);
    await import_fs.default.promises.copyFile(
      filePath,
      backupPath
    );
    const repaired = await repairCallback(
      relative(filePath),
      verification.output.slice(0, 3e4)
    );
    if (!repaired) {
      console.log(
        "\u274C AshenAI could not safely repair the file."
      );
      await import_fs.default.promises.copyFile(
        backupPath,
        filePath
      );
      console.log(
        "\u21A9\uFE0F Original file restored."
      );
      return;
    }
    console.log(
      "\u{1F50D} Verifying repair..."
    );
    const finalVerification = await verify();
    if (!finalVerification.passed) {
      console.log(
        "\u274C AI repair failed verification."
      );
      await import_fs.default.promises.copyFile(
        backupPath,
        filePath
      );
      console.log(
        "\u21A9\uFE0F Broken repair restored from backup."
      );
      return;
    }
    console.log(
      "\u2705 SELF-HEAL SUCCESS"
    );
    console.log(
      `   Repaired: ${relative(filePath)}`
    );
    console.log(
      "   TypeScript: PASS"
    );
    console.log(
      "   Tests: PASS"
    );
  } catch (error) {
    console.log(
      "\u274C Self-Healer error:",
      error instanceof Error ? error.message : String(error)
    );
    try {
      if (import_fs.default.existsSync(backupPath)) {
        await import_fs.default.promises.copyFile(
          backupPath,
          filePath
        );
        console.log(
          "\u21A9\uFE0F Original file restored."
        );
      }
    } catch {
      console.log(
        "\u26A0\uFE0F Could not restore backup."
      );
    }
  } finally {
    repairing.delete(filePath);
    try {
      knownFiles.set(
        filePath,
        import_fs.default.statSync(filePath).mtimeMs
      );
    } catch {
      knownFiles.delete(filePath);
    }
    try {
      await import_fs.default.promises.unlink(backupPath);
    } catch {
    }
  }
}
function scanForChanges() {
  if (!healerRunning || scanRunning) {
    return;
  }
  scanRunning = true;
  try {
    const currentFiles = /* @__PURE__ */ new Set();
    for (const directory of WATCH_DIRS) {
      for (const filePath of collectFiles(directory)) {
        currentFiles.add(filePath);
        try {
          const stat = import_fs.default.statSync(filePath);
          const previous = knownFiles.get(
            filePath
          );
          if (previous === void 0) {
            knownFiles.set(
              filePath,
              stat.mtimeMs
            );
            continue;
          }
          if (stat.mtimeMs !== previous && !repairing.has(filePath)) {
            knownFiles.set(
              filePath,
              stat.mtimeMs
            );
            console.log(
              `
\u270F\uFE0F Source changed: ${relative(filePath)}`
            );
            void handleChange(filePath);
          }
        } catch {
        }
      }
    }
    for (const filePath of knownFiles.keys()) {
      if (!currentFiles.has(filePath)) {
        knownFiles.delete(filePath);
        console.log(
          `
\u{1F5D1}\uFE0F Source removed: ${relative(filePath)}`
        );
      }
    }
  } finally {
    scanRunning = false;
  }
}
async function repairFile(filePath, errorOutput) {
  if (!repairCallback) {
    throw new Error(
      "Self-Healer repair engine is not connected."
    );
  }
  const fullPath = import_path.default.resolve(
    PROJECT_ROOT,
    filePath
  );
  const root = import_path.default.resolve(PROJECT_ROOT);
  if (fullPath !== root && !fullPath.startsWith(root + import_path.default.sep)) {
    throw new Error(
      "Repair path outside project is blocked."
    );
  }
  if (!import_fs.default.existsSync(fullPath)) {
    throw new Error(
      `Repair target does not exist: ${filePath}`
    );
  }
  if (repairing.has(fullPath)) {
    throw new Error(
      `File is already being repaired: ${filePath}`
    );
  }
  const backupPath = `${fullPath}.task-repair-backup`;
  repairing.add(fullPath);
  try {
    await import_fs.default.promises.copyFile(
      fullPath,
      backupPath
    );
    const repaired = await repairCallback(
      import_path.default.relative(PROJECT_ROOT, fullPath),
      errorOutput.slice(0, 3e4)
    );
    if (!repaired) {
      await import_fs.default.promises.copyFile(
        backupPath,
        fullPath
      );
      return false;
    }
    const verification = await verify();
    if (!verification.passed) {
      await import_fs.default.promises.copyFile(
        backupPath,
        fullPath
      );
      return false;
    }
    return true;
  } catch (error) {
    try {
      if (import_fs.default.existsSync(backupPath)) {
        await import_fs.default.promises.copyFile(
          backupPath,
          fullPath
        );
      }
    } catch {
    }
    throw error;
  } finally {
    repairing.delete(fullPath);
    try {
      await import_fs.default.promises.unlink(backupPath);
    } catch {
    }
    try {
      knownFiles.set(
        fullPath,
        import_fs.default.statSync(fullPath).mtimeMs
      );
    } catch {
      knownFiles.delete(fullPath);
    }
  }
}
function startSelfHealer(callback) {
  if (healerRunning) {
    console.log(
      "\u{1FA79} Self-Healer is already running."
    );
    return;
  }
  repairCallback = callback;
  healerRunning = true;
  console.log(
    "\u{1FA79} AshenAI Self-Healer starting..."
  );
  console.log(
    "\u{1F440} Watching source files for changes"
  );
  console.log(
    "\u{1F4F1} Termux polling mode enabled"
  );
  console.log(
    "\u{1F9EA} TypeScript errors will be checked automatically"
  );
  console.log(
    "\u{1F4BE} Broken automatic repairs are restored from backup"
  );
  for (const directory of WATCH_DIRS) {
    console.log(
      `\u{1F4C2} Watching: ${relative(directory)}`
    );
  }
  snapshotFiles();
  healerInterval = setInterval(
    () => {
      scanForChanges();
    },
    1e3
  );
  console.log(
    "\u{1F7E2} Self-Healer polling loop is running."
  );
}
function stopSelfHealer() {
  if (!healerRunning) {
    return;
  }
  healerRunning = false;
  if (healerInterval) {
    clearInterval(healerInterval);
    healerInterval = void 0;
  }
  repairCallback = void 0;
  scanRunning = false;
  console.log(
    "\u{1F534} AshenAI Self-Healer stopped."
  );
}
function isSelfHealerRunning() {
  return healerRunning;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  isSelfHealerRunning,
  repairFile,
  startSelfHealer,
  stopSelfHealer
});
