import { logger } from "../logger";

/**
 * Lightweight stage timer for comparing /ask vs mention latency.
 * Collects named stages and logs them at the end.
 */
export class StageTimer {
  private stages: Array<{ name: string; ms: number }> = [];
  private lastMark: number;

  constructor(private readonly label: string) {
    this.lastMark = Date.now();
  }

  mark(stageName: string): void {
    const now = Date.now();
    this.stages.push({ name: stageName, ms: now - this.lastMark });
    this.lastMark = now;
  }

  total(): number {
    return this.stages.reduce((s, e) => s + e.ms, 0);
  }

  log(): void {
    const lines = [`⏱️ ${this.label} — total ${this.total()}ms`];
    for (const s of this.stages) {
      lines.push(`  ${s.name}: ${s.ms}ms`);
    }
    logger.info(lines.join("\n"));
  }
}
