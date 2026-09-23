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
var agent_security_exports = {};
__export(agent_security_exports, {
  assertSafeAction: () => assertSafeAction,
  getAgentSecurityPolicy: () => getAgentSecurityPolicy,
  isActionBlocked: () => isActionBlocked,
  isProtectedPath: () => isProtectedPath
});
module.exports = __toCommonJS(agent_security_exports);
var import_path = __toESM(require("path"));
const BLOCKED_PATHS = [
  ".env",
  ".env.local",
  ".env.production",
  "node_modules",
  ".git",
  "data/agent-logs",
  "data/agent-backups"
];
const BLOCKED_ACTIONS = [
  "delete_project",
  "delete_repository",
  "remove_security",
  "disable_logging",
  "modify_agent_security",
  "read_credentials",
  "read_env"
];
function isProtectedPath(filePath) {
  const normalized = import_path.default.normalize(filePath).replace(/\\/g, "/");
  return BLOCKED_PATHS.some(
    (blocked) => normalized === blocked || normalized.startsWith(`${blocked}/`) || normalized.endsWith(`/${blocked}`)
  );
}
function isActionBlocked(action) {
  return BLOCKED_ACTIONS.includes(action);
}
function assertSafeAction(action, filePath) {
  if (isActionBlocked(action)) {
    throw new Error(
      `SECURITY BLOCK: action "${action}" is not permitted.`
    );
  }
  if (filePath && isProtectedPath(filePath)) {
    throw new Error(
      `SECURITY BLOCK: protected path "${filePath}" cannot be modified.`
    );
  }
}
function getAgentSecurityPolicy() {
  return {
    protectedPaths: [...BLOCKED_PATHS],
    blockedActions: [...BLOCKED_ACTIONS],
    failClosed: true
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  assertSafeAction,
  getAgentSecurityPolicy,
  isActionBlocked,
  isProtectedPath
});
