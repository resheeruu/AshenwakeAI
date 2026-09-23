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
var integration_exports = {};
__export(integration_exports, {
  initializeTaskEngine: () => initializeTaskEngine
});
module.exports = __toCommonJS(integration_exports);
var import_selfHeal = require("../selfHeal");
var import_coding_agents = require("../../coding-agents");
var import_index = require("./index");
var import_tools = require("../tools");
let initialized = false;
function initializeTaskEngine() {
  if (initialized) {
    return;
  }
  import_index.taskEngine.registerAction(
    "project_status",
    async () => (0, import_tools.projectStatus)()
  );
  import_index.taskEngine.registerAction(
    "check_dependencies",
    async () => (0, import_tools.checkDependencies)()
  );
  import_index.taskEngine.registerAction(
    "check_project",
    async () => (0, import_tools.checkProject)()
  );
  import_index.taskEngine.registerAction(
    "typecheck",
    async () => (0, import_tools.typecheck)()
  );
  import_index.taskEngine.registerAction(
    "run_tests",
    async () => (0, import_tools.runTests)()
  );
  import_index.taskEngine.registerAction(
    "repair_file",
    async ({ step }) => {
      const description = step.description.trim();
      const match = description.match(
        /^FILE:\s*(.+?)\s*\nERROR:\s*([\s\S]+)$/i
      );
      if (!match) {
        throw new Error(
          "repair_file requires: FILE: <path>\\nERROR: <verification error>"
        );
      }
      const filePath = match[1].trim();
      const errorOutput = match[2].trim();
      if (!filePath || !errorOutput) {
        throw new Error(
          "Repair file path and verification error are required."
        );
      }
      const repaired = await (0, import_selfHeal.repairFile)(
        filePath,
        errorOutput
      );
      return repaired ? `\u2705 Repair succeeded: ${filePath}` : `\u274C Repair rejected or rolled back: ${filePath}`;
    }
  );
  import_index.taskEngine.registerAction(
    "coding_agent",
    async ({ task, step }) => {
      const result = await import_coding_agents.codingAgentCoordinator.executeWithFailover(
        task,
        step.description
      );
      if (result.exitCode !== 0) {
        throw new Error(
          `Coding agent ${result.agent} failed: ${result.output}`
        );
      }
      return `Agent: ${result.agent}
${result.output}`;
    }
  );
  import_index.taskEngine.registerAction(
    "search_project",
    async ({ step }) => {
      const query = step.description.trim();
      if (!query) {
        throw new Error(
          "Search query is empty."
        );
      }
      return (0, import_tools.searchProject)(query);
    }
  );
  initialized = true;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  initializeTaskEngine
});
