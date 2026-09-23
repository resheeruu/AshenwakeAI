"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var cli_agent_exports = {};
__export(cli_agent_exports, {
  CliCodingAgent: () => CliCodingAgent
});
module.exports = __toCommonJS(cli_agent_exports);
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");
const execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
const COMMAND_ALLOWLIST = /* @__PURE__ */ new Set([
  "claude",
  "aider",
  "opencode",
  "codex",
  "cursor",
  "continue",
  "gptme",
  "sweep",
  "swe-agent",
  "devon",
  "mentat"
]);
function sanitizeCommandName(command) {
  return command.replace(/[^a-zA-Z0-9._-]/g, "");
}
class CliCodingAgent {
  constructor(name, command, version, role, executionMode = "stdin") {
    this.name = name;
    this.command = command;
    this.version = version;
    this.role = role;
    this.executionMode = executionMode;
  }
  name;
  command;
  version;
  role;
  executionMode;
  async isAvailable() {
    const safeCommand = sanitizeCommandName(this.command);
    if (!COMMAND_ALLOWLIST.has(safeCommand) && !COMMAND_ALLOWLIST.has(this.command)) {
      return false;
    }
    try {
      await execFileAsync("command", ["-v", this.command], {
        timeout: 5e3
      });
      return true;
    } catch {
      return false;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CliCodingAgent
});
