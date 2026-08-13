export type AgentStatus =
  | "starting"
  | "online"
  | "degraded"
  | "offline";

export class AgentLifecycle {
  private status: AgentStatus = "offline";
  private startedAt?: Date;

  start(): void {
    this.status = "starting";
    this.startedAt = new Date();

    this.status = "online";
  }

  stop(): void {
    this.status = "offline";
  }

  degrade(): void {
    this.status = "degraded";
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getStartedAt(): Date | undefined {
    return this.startedAt;
  }

  isOnline(): boolean {
    return this.status === "online";
  }
}
