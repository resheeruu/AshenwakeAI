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
var supervisor_exports = {};
__export(supervisor_exports, {
  AgentSupervisor: () => AgentSupervisor
});
module.exports = __toCommonJS(supervisor_exports);
var import_child_process = require("child_process");
var import_util = require("util");
var import_logger = require("../../logger");
var import_health_scanner = require("../../diagnostics/health-scanner");
var import_audit_log = require("../audit/audit-log");
var import_scheduler = require("./scheduler");
const execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
class AgentSupervisor {
  scheduler = new import_scheduler.AgentScheduler();
  running = false;
  cycles = 0;
  lastCycleAt = null;
  lastResult = "never";
  cycleInProgress = false;
  start(intervalMs = 15 * 60 * 1e3) {
    if (this.running) {
      return;
    }
    this.running = true;
    (0, import_audit_log.audit)(
      "info",
      "supervisor_started",
      `interval=${intervalMs}ms`
    );
    import_logger.logger.info(
      `\u{1F9E0} Autonomous supervisor ONLINE (${Math.round(intervalMs / 6e4)}m cycle).`
    );
    this.scheduler.start([
      {
        name: "health-check",
        intervalMs,
        run: async () => {
          await this.runCycle();
        }
      }
    ]);
    void this.runCycle();
  }
  stop() {
    if (!this.running) {
      return;
    }
    this.scheduler.stop();
    this.running = false;
    (0, import_audit_log.audit)("info", "supervisor_stopped");
    import_logger.logger.info("\u{1F534} Autonomous supervisor OFFLINE.");
  }
  getStatus() {
    return {
      running: this.running,
      cycles: this.cycles,
      lastCycleAt: this.lastCycleAt,
      lastResult: this.lastResult
    };
  }
  async runCycle() {
    if (!this.running || this.cycleInProgress) {
      return;
    }
    this.cycleInProgress = true;
    this.cycles++;
    this.lastCycleAt = (/* @__PURE__ */ new Date()).toISOString();
    (0, import_audit_log.audit)(
      "info",
      "supervisor_cycle_started",
      `cycle=${this.cycles}`
    );
    try {
      const health = (0, import_health_scanner.scanAshenAI)();
      const errors = health.findings.filter(
        (finding) => finding.level === "error"
      );
      const warnings = health.findings.filter(
        (finding) => finding.level === "warning"
      );
      (0, import_audit_log.audit)(
        errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "success",
        "health_scan_completed",
        `files=${health.filesScanned}, findings=${health.findings.length}, errors=${errors.length}, warnings=${warnings.length}`
      );
      if (errors.length > 0) {
        this.lastResult = "error";
        import_logger.logger.error(
          `\u{1F6A8} Supervisor detected ${errors.length} health error(s).`
        );
      } else if (warnings.length > 0) {
        this.lastResult = "warning";
        import_logger.logger.warn(
          `\u26A0\uFE0F Supervisor detected ${warnings.length} warning(s).`
        );
      } else {
        this.lastResult = "ok";
      }
      await this.runTypecheck();
      (0, import_audit_log.audit)(
        "success",
        "supervisor_cycle_completed",
        `cycle=${this.cycles}`
      );
    } catch (error) {
      this.lastResult = "error";
      const message = error instanceof Error ? error.message : String(error);
      (0, import_audit_log.audit)(
        "error",
        "supervisor_cycle_failed",
        message
      );
      import_logger.logger.error(
        "\u274C Supervisor cycle failed:",
        message
      );
    } finally {
      this.cycleInProgress = false;
    }
  }
  async runTypecheck() {
    (0, import_audit_log.audit)("info", "typecheck_started");
    try {
      await execFileAsync(
        "npm",
        ["run", "typecheck"],
        {
          cwd: process.cwd(),
          timeout: 12e4,
          maxBuffer: 2 * 1024 * 1024
        }
      );
      (0, import_audit_log.audit)("success", "typecheck_passed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      (0, import_audit_log.audit)(
        "error",
        "typecheck_failed",
        message.slice(0, 4e3)
      );
      import_logger.logger.error(
        "\u274C Autonomous typecheck failed."
      );
      throw error;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentSupervisor
});
