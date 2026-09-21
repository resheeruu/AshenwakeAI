import { logger } from "../logger";

export interface SupervisorStatus {
  running: boolean;
  lastCheck: number;
  failures: number;
  consecutiveFailures: number;
}

export interface SupervisorOptions {
  intervalMs?: number;
  failureThreshold?: number;
  /**
   * Startup grace window in milliseconds.
   *
   * While the process is still starting up (providers have not
   * completed their first request, databases/caches are warming up)
   * transient unhealthy signals must not accumulate towards a
   * termination decision. Unhealthy results observed inside this
   * window are logged and ignored; counting starts afterwards.
   *
   * Default 0 = no grace (previous behaviour, used by unit tests).
   */
  startupGraceMs?: number;
  onUnhealthy?: (reason: string) => void;
  checks: () => {
    healthy: boolean;
    reasons?: string[];
  };
}

export class InternalSupervisor {
  private timer: NodeJS.Timeout | null = null;
  private status: SupervisorStatus = {
    running: false,
    lastCheck: 0,
    failures: 0,
    consecutiveFailures: 0,
  };

  private readonly intervalMs: number;
  private readonly failureThreshold: number;
  private readonly startupGraceMs: number;
  private readonly onUnhealthy?: (reason: string) => void;
  private readonly checks: SupervisorOptions["checks"];

  private startedAt = 0;

  constructor(options: SupervisorOptions) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.startupGraceMs = Math.max(0, options.startupGraceMs ?? 0);
    this.onUnhealthy = options.onUnhealthy;
    this.checks = options.checks;
  }

  start(): void {
    if (this.timer) return;

    this.status.running = true;
    this.startedAt = Date.now();

    this.runCheck();

    this.timer = setInterval(() => {
      this.runCheck();
    }, this.intervalMs);

    this.timer.unref?.();

    logger.info(
      `🛡️ INTERNAL SUPERVISOR ACTIVE: checking every ${this.intervalMs / 1000}s`,
    );

    if (this.startupGraceMs > 0) {
      logger.info(
        `🛡️ INTERNAL SUPERVISOR: startup grace period active for ${Math.round(
          this.startupGraceMs / 1000,
        )}s — transient initialisation signals are logged, not counted.`,
      );
    }
  }

  /**
   * True while the process is still inside the configured startup
   * grace window. Startup state (providers awaiting their first
   * request, cold caches, migrations) must not be mistaken for a
   * sustained production failure.
   */
  private isInStartupGrace(): boolean {
    if (this.startupGraceMs <= 0) return false;
    return Date.now() - this.startedAt < this.startupGraceMs;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.status.running = false;
  }

  getStatus(): SupervisorStatus {
    return { ...this.status };
  }

  private runCheck(): void {
    this.status.lastCheck = Date.now();

    const inGrace = this.isInStartupGrace();

    try {
      const result = this.checks();

      if (result.healthy) {
        if (this.status.consecutiveFailures > 0) {
          logger.info("🟢 INTERNAL SUPERVISOR: system recovered.");
        }

        this.status.consecutiveFailures = 0;
        return;
      }

      // Lifecycle/countdown gate: during startup grace we observe
      // transient signals but do not let them count as sustained
      // failures that could trigger termination.
      if (inGrace) {
        const reason =
          result.reasons?.join("; ") ||
          "Temporary health signal during initialisation";
        logger.debug(
          `🛡️ INTERNAL SUPERVISOR: transient signal during startup grace — ${reason}`,
        );
        return;
      }

      this.status.failures++;
      this.status.consecutiveFailures++;

      const reason =
        result.reasons?.join("; ") ||
        "Unknown health failure";

      logger.warn(
        `⚠️ INTERNAL SUPERVISOR: unhealthy (${this.status.consecutiveFailures}/${this.failureThreshold}) — ${reason}`,
      );

      if (
        this.status.consecutiveFailures >=
        this.failureThreshold
      ) {
        this.onUnhealthy?.(reason);
      }
    } catch (error) {
      // During startup grace, recounting transient check errors as
      // production failures is wrong.
      if (!inGrace) {
        this.status.failures++;
        this.status.consecutiveFailures++;

        logger.error(
          "❌ INTERNAL SUPERVISOR CHECK FAILED:",
          error instanceof Error
            ? error.message
            : String(error),
        );

        if (
          this.status.consecutiveFailures >=
          this.failureThreshold
        ) {
          this.onUnhealthy?.(
            error instanceof Error ? error.message : String(error)
          );
        }
      } else {
        const message =
          error instanceof Error ? error.message : String(error);
        logger.debug(
          `🛡️ INTERNAL SUPERVISOR: startup grace — recording error as transient, not a failure count — ${message}`,
        );
      }
    }
  }
}
