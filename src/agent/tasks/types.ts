export type TaskStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface TaskStep {
  id: string;
  title: string;
  description: string;
  action: string;
  status: TaskStepStatus;
  attempts: number;
  maxAttempts: number;
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentTask {
  id: string;
  goal: string;
  status: TaskStatus;
  steps: TaskStep[];
  currentStep: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface TaskActionContext {
  task: AgentTask;
  step: TaskStep;
}

export type TaskAction = (
  context: TaskActionContext,
) => Promise<string>;

export interface TaskProgress {
  taskId: string;
  status: TaskStatus;
  completed: number;
  total: number;
  percentage: number;
}
