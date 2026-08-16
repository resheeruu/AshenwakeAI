export type CodingAgentStatus =
  | "available"
  | "unavailable"
  | "busy"
  | "failed";

export type CodingAgentRole =
  | "primary"
  | "fallback"
  | "analysis"
  | "long_task"
  | "general";

export interface CodingAgent {
  readonly name: string;
  readonly command: string;
  readonly version: string;
  readonly role: CodingAgentRole;

  isAvailable(): Promise<boolean>;
}

export interface AgentTask {
  id: string;
  title: string;
  objective: string;

  status:
    | "pending"
    | "in_progress"
    | "handoff"
    | "verifying"
    | "completed"
    | "failed";

  currentAgent?: string;

  completed: string[];
  remaining: string[];

  filesModified: string[];

  lastCheckpoint?: string;

  createdAt: number;
  updatedAt: number;
}

export interface AgentHandoff {
  taskId: string;

  fromAgent: string;
  toAgent: string;

  reason:
    | "usage_exhausted"
    | "crashed"
    | "failed"
    | "timeout"
    | "manual"
    | "unavailable";

  progress: string;
  remainingWork: string[];

  timestamp: number;
}
