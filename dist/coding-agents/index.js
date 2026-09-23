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
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var coding_agents_exports = {};
__export(coding_agents_exports, {
  codingAgentCoordinator: () => codingAgentCoordinator,
  codingAgentRegistry: () => codingAgentRegistry
});
module.exports = __toCommonJS(coding_agents_exports);
var import_coordinator = require("./coordinator");
var import_registry = require("./registry");
var import_cli_agent = require("./adapters/cli-agent");
__reExport(coding_agents_exports, require("./types"), module.exports);
__reExport(coding_agents_exports, require("./registry"), module.exports);
__reExport(coding_agents_exports, require("./handoff"), module.exports);
__reExport(coding_agents_exports, require("./coordinator"), module.exports);
const codingAgentRegistry = new import_registry.CodingAgentRegistry();
codingAgentRegistry.register(
  new import_cli_agent.CliCodingAgent(
    "Gemini CLI",
    "gemini",
    "0.55.1",
    "primary",
    "prompt_arg"
  )
);
codingAgentRegistry.register(
  new import_cli_agent.CliCodingAgent(
    "Qwen Code",
    "qwen",
    "0.21.12",
    "general",
    "prompt_arg"
  )
);
codingAgentRegistry.register(
  new import_cli_agent.CliCodingAgent(
    "Pi Coding Agent",
    "pi",
    "0.84.2",
    "fallback",
    "print_arg"
  )
);
codingAgentRegistry.register(
  new import_cli_agent.CliCodingAgent(
    "Fabric",
    "fabric",
    "1.4.470",
    "analysis",
    "stdin"
  )
);
codingAgentRegistry.register(
  new import_cli_agent.CliCodingAgent(
    "aichat",
    "aichat",
    "0.30.0",
    "general",
    "text_arg"
  )
);
const codingAgentCoordinator = new import_coordinator.CodingAgentCoordinator(codingAgentRegistry);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  codingAgentCoordinator,
  codingAgentRegistry,
  ...require("./types"),
  ...require("./registry"),
  ...require("./handoff"),
  ...require("./coordinator")
});
