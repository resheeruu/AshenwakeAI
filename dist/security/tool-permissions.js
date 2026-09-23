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
var tool_permissions_exports = {};
__export(tool_permissions_exports, {
  canReadPath: () => canReadPath,
  canUseTool: () => canUseTool,
  canWritePath: () => canWritePath,
  getToolDeniedMessage: () => getToolDeniedMessage,
  isSecretPath: () => isSecretPath
});
module.exports = __toCommonJS(tool_permissions_exports);
var import_node_path = __toESM(require("node:path"));
const SECRET_PATH_PATTERNS = [
  /^\.env(?:\..*)?$/i,
  /(^|\/)\.env(?:\..*)?$/i,
  /(^|\/)(?:secrets?|credentials?|private|tokens?)(?:\/|$)/i,
  /(?:api[_-]?key|access[_-]?token|bot[_-]?token|password|private[_-]?key)/i
];
const PRIVILEGED_TOOLS = /* @__PURE__ */ new Set([
  "readFile",
  "writeFile",
  "searchProject",
  "gitDiff",
  "installPackage",
  "runCommand",
  "checkDependencies",
  "typecheck",
  "runTests",
  "checkProject",
  "diagnoseProject"
]);
const AGENT_TOOLS = /* @__PURE__ */ new Set([
  "gitDiff",
  "checkDependencies",
  "typecheck",
  "runTests",
  "checkProject",
  "diagnoseProject"
]);
const FIX_TOOLS = /* @__PURE__ */ new Set([
  ...AGENT_TOOLS,
  "readFile",
  "writeFile",
  "searchProject",
  "runCommand",
  "installPackage"
]);
function normalizePath(filePath) {
  const raw = String(filePath ?? "").replace(/\\/g, "/");
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
    return null;
  }
  let decoded = raw;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
  }
  if (decoded.includes("\0")) {
    return null;
  }
  const normalized = import_node_path.default.posix.normalize(decoded);
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    return null;
  }
  if (normalized.includes("..")) {
    return null;
  }
  return normalized.replace(/^\.\//, "");
}
function isSecretPath(filePath) {
  const normalized = normalizePath(filePath);
  if (normalized === null) return true;
  return SECRET_PATH_PATTERNS.some(
    (pattern) => pattern.test(normalized)
  );
}
function canUseTool(toolName, access) {
  if (!PRIVILEGED_TOOLS.has(toolName)) {
    return access === "public" || access === "agent" || access === "admin";
  }
  if (access === "admin") {
    return true;
  }
  if (access === "agent") {
    return AGENT_TOOLS.has(toolName);
  }
  if (access === "fix") {
    return FIX_TOOLS.has(toolName);
  }
  return false;
}
function canReadPath(filePath, access) {
  if (isSecretPath(filePath)) {
    return false;
  }
  if (access === "admin" || access === "agent" || access === "fix") {
    return true;
  }
  return false;
}
function canWritePath(filePath, access) {
  if (isSecretPath(filePath)) {
    return false;
  }
  return access === "agent" || access === "fix" || access === "admin";
}
function getToolDeniedMessage() {
  return "I don't have access to internal project tools or private files.";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  canReadPath,
  canUseTool,
  canWritePath,
  getToolDeniedMessage,
  isSecretPath
});
