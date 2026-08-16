import { logger } from "../../logger";
import { audit } from "../audit/audit-log";

export type ScheduledJob = {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

export class AgentScheduler {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private running = false;

  start(jobs: ScheduledJob[]): void {
    if (this.running) {
      return;
    }

    this.running = true;

    for (const job of jobs) {
      if (
        !job.name.trim() ||
        !Number.isFinite(job.intervalMs) ||
        job.intervalMs < 1000
      ) {
        throw new Error(
          `Invalid scheduled job: ${job.name}`,
        );
      }

      const timer = setInterval(() => {
        void this.execute(job);
      }, job.intervalMs);

      this.timers.set(job.name, timer);

      audit(
        "info",
        "scheduler_job_registered",
        `${job.name} every ${job.intervalMs}ms`,
      );
    }

    logger.info(
      `⏱️ Agent scheduler started with ${jobs.length} job(s).`,
    );
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }

    this.timers.clear();
    this.running = false;

    audit("info", "scheduler_stopped");
    logger.info("⏹️ Agent scheduler stopped.");
  }

  isRunning(): boolean {
    return this.running;
  }

  private async execute(job: ScheduledJob): Promise<void> {
    const startedAt = Date.now();

    audit(
      "info",
      "job_started",
      job.name,
    );

    try {
      await job.run();

      audit(
        "success",
        "job_completed",
        `${job.name} (${Date.now() - startedAt}ms)`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      audit(
        "error",
        "job_failed",
        `${job.name}: ${message}`,
      );

      logger.error(
        `❌ Agent job "${job.name}" failed:`,
        message,
      );
    }
  }
}
