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
var tools_exports = {};
__export(tools_exports, {
  checkDependencies: () => checkDependencies,
  checkProject: () => checkProject,
  diagnoseProject: () => diagnoseProject,
  gitDiff: () => gitDiff,
  installPackage: () => installPackage,
  projectStatus: () => projectStatus,
  readFile: () => readFile,
  runCommand: () => runCommand,
  runTests: () => runTests,
  searchProject: () => searchProject,
  testProviders: () => testProviders,
  typecheck: () => typecheck,
  writeFile: () => writeFile
});
module.exports = __toCommonJS(tools_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_child_process = require("child_process");
var import_util = require("util");
var import_tool_permissions = require("../security/tool-permissions");
const execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
const PROJECT_ROOT = process.cwd();
async function exec(command, args = [], timeout = 12e4) {
  const { stdout, stderr } = await execFileAsync(
    command,
    args,
    {
      cwd: PROJECT_ROOT,
      timeout,
      maxBuffer: 10 * 1024 * 1024
    }
  );
  return `${stdout}${stderr}`.trim();
}
function safePath(filePath) {
  const requestedPath = String(
    filePath ?? ""
  ).trim();
  if (!requestedPath) {
    throw new Error(
      "File path is empty."
    );
  }
  if ((0, import_tool_permissions.isSecretPath)(requestedPath)) {
    throw new Error(
      "Access to private configuration and secret files is blocked."
    );
  }
  const root = import_path.default.resolve(PROJECT_ROOT);
  const full = import_path.default.resolve(
    PROJECT_ROOT,
    requestedPath
  );
  if (full !== root && !full.startsWith(
    root + import_path.default.sep
  )) {
    throw new Error(
      "Path outside project is blocked."
    );
  }
  const relative = import_path.default.relative(root, full).replace(/\\/g, "/");
  if ((0, import_tool_permissions.isSecretPath)(relative)) {
    throw new Error(
      "Access to private configuration and secret files is blocked."
    );
  }
  return full;
}
async function readFile(filePath) {
  return import_fs.default.promises.readFile(
    safePath(filePath),
    "utf8"
  );
}
async function writeFile(filePath, content) {
  const fullPath = safePath(filePath);
  await import_fs.default.promises.mkdir(
    import_path.default.dirname(fullPath),
    {
      recursive: true
    }
  );
  if (import_fs.default.existsSync(fullPath)) {
    const backupPath = `${fullPath}.agent-backup`;
    await import_fs.default.promises.copyFile(
      fullPath,
      backupPath
    );
  }
  await import_fs.default.promises.writeFile(
    fullPath,
    content,
    "utf8"
  );
  return `\u2705 File written: ${filePath}`;
}
async function checkDependencies() {
  const packageJson = await readFile("package.json");
  const pkg = JSON.parse(packageJson);
  const dependencies = {
    ...pkg.dependencies || {},
    ...pkg.devDependencies || {}
  };
  const results = [];
  for (const name of Object.keys(
    dependencies
  )) {
    try {
      const output = await exec(
        "npm",
        [
          "list",
          name,
          "--depth=0",
          "--json"
        ],
        3e4
      );
      const data = JSON.parse(output);
      const installed = data?.dependencies?.[name]?.version;
      if (installed) {
        results.push(
          `\u2705 ${name}: installed (${installed})`
        );
      } else {
        results.push(
          `\u274C ${name}: missing`
        );
      }
    } catch {
      results.push(
        `\u274C ${name}: missing`
      );
    }
  }
  return results.join("\n");
}
async function typecheck() {
  try {
    return await exec(
      "npm",
      ["run", "typecheck"],
      12e4
    );
  } catch (error) {
    return `${error?.stdout ?? ""}${error?.stderr ?? ""}`.trim();
  }
}
async function runTests() {
  try {
    return await exec(
      "npm",
      ["test"],
      18e4
    );
  } catch (error) {
    return `${error?.stdout ?? ""}${error?.stderr ?? ""}`.trim();
  }
}
async function checkProject() {
  const results = [];
  results.push(
    "=== PROJECT CHECK ==="
  );
  results.push(
    "\n=== PROJECT STATUS ==="
  );
  results.push(
    await projectStatus()
  );
  results.push(
    "\n=== DEPENDENCIES ==="
  );
  results.push(
    await checkDependencies()
  );
  results.push(
    "\n=== TYPESCRIPT ==="
  );
  results.push(
    await typecheck()
  );
  return results.join("\n");
}
async function testProviders() {
  return [
    "=== PROVIDER TEST ===",
    "Provider testing is handled by the AI router.",
    "Use the configured provider router for live provider checks."
  ].join("\n");
}
async function projectStatus() {
  const results = [];
  results.push(
    "=== PROJECT STATUS ==="
  );
  results.push(
    `Project: ${PROJECT_ROOT}`
  );
  results.push(
    `package.json: ${import_fs.default.existsSync(
      import_path.default.join(
        PROJECT_ROOT,
        "package.json"
      )
    ) ? "present" : "missing"}`
  );
  results.push(
    `src/: ${import_fs.default.existsSync(
      import_path.default.join(
        PROJECT_ROOT,
        "src"
      )
    ) ? "present" : "missing"}`
  );
  try {
    await exec(
      "git",
      [
        "rev-parse",
        "--is-inside-work-tree"
      ],
      1e4
    );
    results.push(
      "Git: repository initialized"
    );
  } catch {
    results.push(
      "Git: not a git repository"
    );
  }
  return results.join("\n");
}
async function searchProject(query) {
  if (!query.trim()) {
    throw new Error(
      "Search query is empty."
    );
  }
  try {
    return await exec(
      "grep",
      [
        "-RIn",
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        query,
        "."
      ],
      3e4
    );
  } catch (error) {
    return error?.stdout || "No matches found.";
  }
}
async function gitDiff() {
  try {
    return await exec(
      "git",
      [
        "diff",
        "--stat"
      ],
      1e4
    );
  } catch {
    return "Git repository not initialized.";
  }
}
async function installPackage(packageName, dev = false) {
  if (!/^[a-zA-Z0-9@/_\-.]+$/.test(
    packageName
  )) {
    throw new Error(
      "Invalid package name."
    );
  }
  const packageJson = JSON.parse(
    await readFile("package.json")
  );
  const declaredInDependencies = Boolean(packageJson.dependencies?.[packageName]);
  const declaredInDevDependencies = Boolean(packageJson.devDependencies?.[packageName]);
  const declared = declaredInDependencies || declaredInDevDependencies;
  if (declared) {
    try {
      const installed = await exec(
        "npm",
        [
          "ls",
          packageName,
          "--depth=0",
          "--json"
        ],
        3e4
      );
      const data = JSON.parse(installed);
      const version = data?.dependencies?.[packageName]?.version;
      if (version) {
        return [
          `\u2139\uFE0F Package already installed: ${packageName}@${version}`,
          `No installation needed.`
        ].join("\n");
      }
    } catch {
    }
  }
  const args = [
    "install",
    packageName
  ];
  if (dev) {
    args.push("--save-dev");
  }
  return exec(
    "npm",
    args,
    18e4
  );
}
async function runCommand(command) {
  const parts = Array.isArray(command) ? command : command.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) {
    throw new Error(
      "Command is empty."
    );
  }
  const allowedCommands = /* @__PURE__ */ new Set([
    "npm",
    "npx",
    "node",
    "git",
    "grep",
    "find",
    "ls",
    "pwd"
  ]);
  if (!allowedCommands.has(
    parts[0]
  )) {
    throw new Error(
      `Command not allowed: ${parts[0]}`
    );
  }
  const forbiddenTokens = [
    ";",
    "&&",
    "||",
    "|",
    ">",
    ">>",
    "<",
    "$(",
    "`"
  ];
  if (parts.some(
    (part) => forbiddenTokens.some(
      (token) => part.includes(token)
    )
  )) {
    throw new Error(
      "Unsafe shell syntax is not allowed."
    );
  }
  return exec(
    parts[0],
    parts.slice(1)
  );
}
async function diagnoseProject() {
  const results = [];
  results.push(
    "=== PROJECT DIAGNOSIS ==="
  );
  results.push(
    await projectStatus()
  );
  results.push(
    "\n=== DEPENDENCIES ==="
  );
  results.push(
    await checkDependencies()
  );
  results.push(
    "\n=== TYPESCRIPT ==="
  );
  results.push(
    await typecheck()
  );
  return results.join("\n");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  checkDependencies,
  checkProject,
  diagnoseProject,
  gitDiff,
  installPackage,
  projectStatus,
  readFile,
  runCommand,
  runTests,
  searchProject,
  testProviders,
  typecheck,
  writeFile
});
