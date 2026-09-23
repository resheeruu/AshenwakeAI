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
var scheduler_exports = {};
__export(scheduler_exports, {
  AgentScheduler: () => AgentScheduler
});
module.exports = __toCommonJS(scheduler_exports);
var import_logger = require("../../logger");
var import_audit_log = require("../audit/audit-log");
class AgentScheduler {
  timers = /* @__PURE__ */ new Map();
  running = false;
  start(jobs) {
    if (this.running) {
      return;
    }
    this.running = true;
    for (const job of jobs) {
      if (!job.name.trim() || !Number.isFinite(job.intervalMs) || job.intervalMs < 1e3) {
        throw new Error(
          `Invalid scheduled job: ${job.name}`
        );
      }
      const timer = setInterval(() => {
        void this.execute(job);
      }, job.intervalMs);
      this.timers.set(job.name, timer);
      (0, import_audit_log.audit)(
        "info",
        "scheduler_job_registered",
        `${job.name} every ${job.intervalMs}ms`
      );
    }
    import_logger.logger.info(
      `\u23F1\uFE0F Agent scheduler started with ${jobs.length} job(s).`
    );
  }
  stop() {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.running = false;
    (0, import_audit_log.audit)("info", "scheduler_stopped");
    import_logger.logger.info("\u23F9\uFE0F Agent scheduler stopped.");
  }
  isRunning() {
    return this.running;
  }
  async execute(job) {
    const startedAt = Date.now();
    (0, import_audit_log.audit)(
      "info",
      "job_started",
      job.name
    );
    try {
      await job.run();
      (0, import_audit_log.audit)(
        "success",
        "job_completed",
        `${job.name} (${Date.now() - startedAt}ms)`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      (0, import_audit_log.audit)(
        "error",
        "job_failed",
        `${job.name}: ${message}`
      );
      import_logger.logger.error(
        `\u274C Agent job "${job.name}" failed:`,
        message
      );
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentScheduler
});
