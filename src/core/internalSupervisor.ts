export interface SupervisorStatus {
  running: boolean;
  lastCheck: number;
  failures: number;
  consecutiveFailures: number;
}

export interface SupervisorOptions {
  intervalMs?: number;
  failureThreshold?: number;
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
  private readonly onUnhealthy?: (reason: string) => void;
  private readonly checks: SupervisorOptions["checks"];

  constructor(options: SupervisorOptions) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.onUnhealthy = options.onUnhealthy;
    this.checks = options.checks;
  }

  start(): void {
    if (this.timer) return;

    this.status.running = true;

    this.runCheck();

    this.timer = setInterval(() => {
      this.runCheck();
    }, this.intervalMs);

    this.timer.unref?.();

    console.log(
      `🛡️ INTERNAL SUPERVISOR ACTIVE: checking every ${this.intervalMs / 1000}s`,
    );
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

    try {
      const result = this.checks();

      if (result.healthy) {
        if (this.status.consecutiveFailures > 0) {
          console.log("🟢 INTERNAL SUPERVISOR: system recovered.");
        }

        this.status.consecutiveFailures = 0;
        return;
      }

      this.status.failures++;
      this.status.consecutiveFailures++;

      const reason =
        result.reasons?.join("; ") ||
        "Unknown health failure";

      console.warn(
        `⚠️ INTERNAL SUPERVISOR: unhealthy (${this.status.consecutiveFailures}/${this.failureThreshold}) — ${reason}`,
      );

      if (
        this.status.consecutiveFailures >=
        this.failureThreshold
      ) {
        this.onUnhealthy?.(reason);
      }
    } catch (error) {
      this.status.failures++;
      this.status.consecutiveFailures++;

      console.error(
        "❌ INTERNAL SUPERVISOR CHECK FAILED:",
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }
}
