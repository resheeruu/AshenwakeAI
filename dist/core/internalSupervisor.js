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
var internalSupervisor_exports = {};
__export(internalSupervisor_exports, {
  InternalSupervisor: () => InternalSupervisor
});
module.exports = __toCommonJS(internalSupervisor_exports);
var import_logger = require("../logger");
class InternalSupervisor {
  timer = null;
  status = {
    running: false,
    lastCheck: 0,
    failures: 0,
    consecutiveFailures: 0
  };
  intervalMs;
  failureThreshold;
  startupGraceMs;
  onUnhealthy;
  checks;
  startedAt = 0;
  constructor(options) {
    this.intervalMs = options.intervalMs ?? 3e4;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.startupGraceMs = Math.max(0, options.startupGraceMs ?? 0);
    this.onUnhealthy = options.onUnhealthy;
    this.checks = options.checks;
  }
  start() {
    if (this.timer) return;
    this.status.running = true;
    this.startedAt = Date.now();
    this.runCheck();
    this.timer = setInterval(() => {
      this.runCheck();
    }, this.intervalMs);
    this.timer.unref?.();
    import_logger.logger.info(
      `\u{1F6E1}\uFE0F INTERNAL SUPERVISOR ACTIVE: checking every ${this.intervalMs / 1e3}s`
    );
    if (this.startupGraceMs > 0) {
      import_logger.logger.info(
        `\u{1F6E1}\uFE0F INTERNAL SUPERVISOR: startup grace period active for ${Math.round(
          this.startupGraceMs / 1e3
        )}s \u2014 transient initialisation signals are logged, not counted.`
      );
    }
  }
  /**
   * True while the process is still inside the configured startup
   * grace window. Startup state (providers awaiting their first
   * request, cold caches, migrations) must not be mistaken for a
   * sustained production failure.
   */
  isInStartupGrace() {
    if (this.startupGraceMs <= 0) return false;
    return Date.now() - this.startedAt < this.startupGraceMs;
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status.running = false;
  }
  getStatus() {
    return { ...this.status };
  }
  runCheck() {
    this.status.lastCheck = Date.now();
    const inGrace = this.isInStartupGrace();
    try {
      const result = this.checks();
      if (result.healthy) {
        if (this.status.consecutiveFailures > 0) {
          import_logger.logger.info("\u{1F7E2} INTERNAL SUPERVISOR: system recovered.");
        }
        this.status.consecutiveFailures = 0;
        return;
      }
      if (inGrace) {
        const reason2 = result.reasons?.join("; ") || "Temporary health signal during initialisation";
        import_logger.logger.debug(
          `\u{1F6E1}\uFE0F INTERNAL SUPERVISOR: transient signal during startup grace \u2014 ${reason2}`
        );
        return;
      }
      this.status.failures++;
      this.status.consecutiveFailures++;
      const reason = result.reasons?.join("; ") || "Unknown health failure";
      import_logger.logger.warn(
        `\u26A0\uFE0F INTERNAL SUPERVISOR: unhealthy (${this.status.consecutiveFailures}/${this.failureThreshold}) \u2014 ${reason}`
      );
      if (this.status.consecutiveFailures >= this.failureThreshold) {
        this.onUnhealthy?.(reason);
      }
    } catch (error) {
      if (!inGrace) {
        this.status.failures++;
        this.status.consecutiveFailures++;
        import_logger.logger.error(
          "\u274C INTERNAL SUPERVISOR CHECK FAILED:",
          error instanceof Error ? error.message : String(error)
        );
        if (this.status.consecutiveFailures >= this.failureThreshold) {
          this.onUnhealthy?.(
            error instanceof Error ? error.message : String(error)
          );
        }
      } else {
        const message = error instanceof Error ? error.message : String(error);
        import_logger.logger.debug(
          `\u{1F6E1}\uFE0F INTERNAL SUPERVISOR: startup grace \u2014 recording error as transient, not a failure count \u2014 ${message}`
        );
      }
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  InternalSupervisor
});
