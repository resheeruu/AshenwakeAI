import { logger } from "../logger";
import { AIRouter } from "../ai/router";
import { SystemUsageManager } from "../ai/system-usage";
import { AgentLifecycle } from "./lifecycle";
import { createSelfHealerCallback } from "./selfHealCallback";
import {
  startSelfHealer,
  stopSelfHealer,
  isSelfHealerRunning,
} from "./selfHeal";

type SelfHealerCallback = (
  filePath: string,
  errorOutput: string,
) => Promise<boolean>;

export class AgentManager {
  private readonly lifecycle = new AgentLifecycle();
  private running = false;
  private selfHealerCallback?: SelfHealerCallback;

  constructor(
    router: AIRouter,
    selfHealerCallback?: SelfHealerCallback,
    systemUsage?: SystemUsageManager,
  ) {
    this.selfHealerCallback =
      selfHealerCallback ??
      createSelfHealerCallback(router, [], systemUsage);
  }

  setSelfHealerCallback(
    callback: SelfHealerCallback,
  ): void {
    this.selfHealerCallback = callback;
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.debug(
        "🧠 AshenAI agent is already running.",
      );
      return;
    }

    try {
      logger.info(
        "🧠 Starting AshenAI agent...",
      );

      this.lifecycle.start();

      if (!isSelfHealerRunning()) {
        startSelfHealer(
          this.selfHealerCallback,
        );
      }

      this.running = true;

      logger.info(
        "🔗 AI agent connected to AshenAI core.",
      );

      logger.info(
        "🩹 Self-Healer connected.",
      );

      logger.info(
        "🟢 AshenAI agent is ONLINE.",
      );
    } catch (error) {
      this.lifecycle.degrade();

      logger.error(
        "❌ AshenAI agent startup failed:",
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info(
      "🛑 Stopping AshenAI agent...",
    );

    stopSelfHealer();

    this.running = false;
    this.lifecycle.stop();

    logger.info(
      "🔴 AshenAI agent stopped.",
    );
  }

  getStatus() {
    return {
      status: this.lifecycle.getStatus(),
      running: this.running,
      startedAt:
        this.lifecycle
          .getStartedAt()
          ?.toISOString() ?? null,
      selfHealer: {
        running: isSelfHealerRunning(),
      },
    };
  }

  isOnline(): boolean {
    return (
      this.lifecycle.isOnline() &&
      this.running
    );
  }

  isSelfHealerOnline(): boolean {
    return isSelfHealerRunning();
  }
}
