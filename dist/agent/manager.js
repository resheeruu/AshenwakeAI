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
var manager_exports = {};
__export(manager_exports, {
  AgentManager: () => AgentManager
});
module.exports = __toCommonJS(manager_exports);
var import_logger = require("../logger");
var import_lifecycle = require("./lifecycle");
var import_selfHealCallback = require("./selfHealCallback");
var import_selfHeal = require("./selfHeal");
class AgentManager {
  lifecycle = new import_lifecycle.AgentLifecycle();
  running = false;
  selfHealerCallback;
  constructor(router, selfHealerCallback, systemUsage) {
    this.selfHealerCallback = selfHealerCallback ?? (0, import_selfHealCallback.createSelfHealerCallback)(router, [], systemUsage);
  }
  setSelfHealerCallback(callback) {
    this.selfHealerCallback = callback;
  }
  async start() {
    if (this.running) {
      import_logger.logger.debug(
        "\u{1F9E0} AshenAI agent is already running."
      );
      return;
    }
    try {
      import_logger.logger.info(
        "\u{1F9E0} Starting AshenAI agent..."
      );
      this.lifecycle.start();
      if (!(0, import_selfHeal.isSelfHealerRunning)()) {
        (0, import_selfHeal.startSelfHealer)(
          this.selfHealerCallback
        );
      }
      this.running = true;
      import_logger.logger.info(
        "\u{1F517} AI agent connected to AshenAI core."
      );
      import_logger.logger.info(
        "\u{1FA79} Self-Healer connected."
      );
      import_logger.logger.info(
        "\u{1F7E2} AshenAI agent is ONLINE."
      );
    } catch (error) {
      this.lifecycle.degrade();
      import_logger.logger.error(
        "\u274C AshenAI agent startup failed:",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }
  async stop() {
    if (!this.running) {
      return;
    }
    import_logger.logger.info(
      "\u{1F6D1} Stopping AshenAI agent..."
    );
    (0, import_selfHeal.stopSelfHealer)();
    this.running = false;
    this.lifecycle.stop();
    import_logger.logger.info(
      "\u{1F534} AshenAI agent stopped."
    );
  }
  getStatus() {
    return {
      status: this.lifecycle.getStatus(),
      running: this.running,
      startedAt: this.lifecycle.getStartedAt()?.toISOString() ?? null,
      selfHealer: {
        running: (0, import_selfHeal.isSelfHealerRunning)()
      }
    };
  }
  isOnline() {
    return this.lifecycle.isOnline() && this.running;
  }
  isSelfHealerOnline() {
    return (0, import_selfHeal.isSelfHealerRunning)();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentManager
});
