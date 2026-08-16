import { execFile } from "child_process";
import { promisify } from "util";

import { logger } from "../../logger";
import { scanAshenAI } from "../../diagnostics/health-scanner";
import { audit } from "../audit/audit-log";
import { AgentScheduler } from "./scheduler";

const execFileAsync = promisify(execFile);

export interface SupervisorStatus {
  running: boolean;
  cycles: number;
  lastCycleAt: string | null;
  lastResult: "ok" | "warning" | "error" | "never";
}

export class AgentSupervisor {
  private readonly scheduler = new AgentScheduler();

  private running = false;
  private cycles = 0;
  private lastCycleAt: string | null = null;
  private lastResult: SupervisorStatus["lastResult"] = "never";
  private cycleInProgress = false;

  start(intervalMs = 15 * 60 * 1000): void {
    if (this.running) {
      return;
    }

    this.running = true;

    audit(
      "info",
      "supervisor_started",
      `interval=${intervalMs}ms`,
    );

    logger.info(
      `🧠 Autonomous supervisor ONLINE (${Math.round(intervalMs / 60000)}m cycle).`,
    );

    this.scheduler.start([
      {
        name: "health-check",
        intervalMs,
        run: async () => {
          await this.runCycle();
        },
      },
    ]);

    void this.runCycle();
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.scheduler.stop();
    this.running = false;

    audit("info", "supervisor_stopped");
    logger.info("🔴 Autonomous supervisor OFFLINE.");
  }

  getStatus(): SupervisorStatus {
    return {
      running: this.running,
      cycles: this.cycles,
      lastCycleAt: this.lastCycleAt,
      lastResult: this.lastResult,
    };
  }

  private async runCycle(): Promise<void> {
    if (!this.running || this.cycleInProgress) {
      return;
    }

    this.cycleInProgress = true;
    this.cycles++;
    this.lastCycleAt = new Date().toISOString();

    audit(
      "info",
      "supervisor_cycle_started",
      `cycle=${this.cycles}`,
    );

    try {
      const health = scanAshenAI();

      const errors = health.findings.filter(
        (finding) => finding.level === "error",
      );

      const warnings = health.findings.filter(
        (finding) => finding.level === "warning",
      );

      audit(
        errors.length > 0
          ? "error"
          : warnings.length > 0
            ? "warning"
            : "success",
        "health_scan_completed",
        `files=${health.filesScanned}, findings=${health.findings.length}, errors=${errors.length}, warnings=${warnings.length}`,
      );

      if (errors.length > 0) {
        this.lastResult = "error";
        logger.error(
          `🚨 Supervisor detected ${errors.length} health error(s).`,
        );
      } else if (warnings.length > 0) {
        this.lastResult = "warning";
        logger.warn(
          `⚠️ Supervisor detected ${warnings.length} warning(s).`,
        );
      } else {
        this.lastResult = "ok";
      }

      await this.runTypecheck();

      audit(
        "success",
        "supervisor_cycle_completed",
        `cycle=${this.cycles}`,
      );
    } catch (error) {
      this.lastResult = "error";

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      audit(
        "error",
        "supervisor_cycle_failed",
        message,
      );

      logger.error(
        "❌ Supervisor cycle failed:",
        message,
      );
    } finally {
      this.cycleInProgress = false;
    }
  }

  private async runTypecheck(): Promise<void> {
    audit("info", "typecheck_started");

    try {
      await execFileAsync(
        "npm",
        ["run", "typecheck"],
        {
          cwd: process.cwd(),
          timeout: 120_000,
          maxBuffer: 2 * 1024 * 1024,
        },
      );

      audit("success", "typecheck_passed");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      audit(
        "error",
        "typecheck_failed",
        message.slice(0, 4000),
      );

      logger.error(
        "❌ Autonomous typecheck failed.",
      );

      throw error;
    }
  }
}
