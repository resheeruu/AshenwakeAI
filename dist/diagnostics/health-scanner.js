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
var health_scanner_exports = {};
__export(health_scanner_exports, {
  scanAshenAI: () => scanAshenAI
});
module.exports = __toCommonJS(health_scanner_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
const ROOT = process.cwd();
const IMPORTANT_FILES = [
  "package.json",
  "tsconfig.json",
  ".env",
  "src/index.ts",
  "src/ai/router.ts",
  "src/ai/memory.ts",
  "src/commands/ask.ts",
  "src/commands/handler.ts",
  "src/commands/register.ts"
];
function exists(relativePath) {
  return import_fs.default.existsSync(
    import_path.default.join(ROOT, relativePath)
  );
}
function collectTypeScriptFiles(directory, result = []) {
  if (!import_fs.default.existsSync(directory)) {
    return result;
  }
  for (const entry of import_fs.default.readdirSync(directory, {
    withFileTypes: true
  })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name.includes(".backup") || entry.name.includes(".before-") || entry.name.includes(".final-backup-") || entry.name.endsWith(".broken")) {
      continue;
    }
    const fullPath = import_path.default.join(
      directory,
      entry.name
    );
    if (entry.isDirectory()) {
      collectTypeScriptFiles(fullPath, result);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      result.push(fullPath);
    }
  }
  return result;
}
function scanAshenAI() {
  const startedAt = Date.now();
  const findings = [];
  for (const file of IMPORTANT_FILES) {
    if (!exists(file)) {
      findings.push({
        level: file === ".env" ? "warning" : "error",
        area: "Files",
        message: `Missing ${file}`
      });
    }
  }
  if (exists("package.json")) {
    try {
      const packageJson = JSON.parse(
        import_fs.default.readFileSync(
          import_path.default.join(ROOT, "package.json"),
          "utf8"
        )
      );
      if (!packageJson.scripts?.typecheck) {
        findings.push({
          level: "warning",
          area: "Build",
          message: "No npm typecheck script is configured."
        });
      }
      if (!packageJson.scripts?.test) {
        findings.push({
          level: "warning",
          area: "Tests",
          message: "No npm test script is configured."
        });
      }
    } catch {
      findings.push({
        level: "error",
        area: "Build",
        message: "package.json could not be parsed."
      });
    }
  }
  const tsFiles = collectTypeScriptFiles(
    import_path.default.join(ROOT, "src")
  );
  for (const file of tsFiles) {
    try {
      const content = import_fs.default.readFileSync(
        file,
        "utf8"
      );
      if (content.includes("console.log(")) {
        findings.push({
          level: "ok",
          area: "Logging",
          message: `${import_path.default.relative(ROOT, file)} contains runtime logging.`
        });
      }
      if (content.includes("process.env.") && !content.includes("dotenv")) {
        findings.push({
          level: "warning",
          area: "Configuration",
          message: `${import_path.default.relative(ROOT, file)} reads environment variables.`
        });
      }
    } catch (error) {
      findings.push({
        level: "error",
        area: "Files",
        message: `Could not read ${import_path.default.relative(ROOT, file)}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
  if (exists("src/ai/router.ts") && exists("src/commands/ask.ts")) {
    findings.push({
      level: "ok",
      area: "AI",
      message: "AI router and /ask command are present."
    });
  }
  if (exists("src/commands/handler.ts") && exists("src/commands/register.ts")) {
    findings.push({
      level: "ok",
      area: "Discord",
      message: "Command handler and command registration are present."
    });
  }
  if (findings.length === 0) {
    findings.push({
      level: "ok",
      area: "System",
      message: "No structural problems were detected."
    });
  }
  return {
    startedAt,
    durationMs: Date.now() - startedAt,
    filesScanned: tsFiles.length,
    findings
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  scanAshenAI
});
