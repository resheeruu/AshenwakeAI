import {
  AgentTask,
  TaskAction,
} from "./types";
import {
  loadTasks,
  getTask,
  upsertTask,
} from "./store";
import {
  createTask,
  getProgress,
} from "./planner";
import { TaskExecutor } from "./executor";
import { SystemUsageManager } from "../../ai/system-usage";

export * from "./types";
export * from "./planner";
export * from "./store";
export * from "./executor";

export class AutonomousTaskEngine {
  readonly executor =
    new TaskExecutor();

  registerAction(
    name: string,
    action: TaskAction,
  ): void {
    this.executor.registerAction(
      name,
      action,
    );
  }

  async create(
    goal: string,
    steps: Array<{
      title: string;
      description: string;
      action: string;
      maxAttempts?: number;
    }>,
  ): Promise<AgentTask> {
    const task =
      createTask(goal, steps);

    await upsertTask(task);

    return task;
  }


  async planAndRun(
    router: import("../../ai/router").AIRouter,
    goal: string,
    systemUsage?: SystemUsageManager,
  ): Promise<AgentTask> {
    const { planTask } =
      await import("./aiPlanner");

    const planned =
      await planTask(router, goal, systemUsage);

    await upsertTask(planned);

    return this.executor.run(planned);
  }

  async run(
    taskId: string,
  ): Promise<AgentTask> {
    const task =
      await getTask(taskId);

    if (!task) {
      throw new Error(
        `Task not found: ${taskId}`,
      );
    }

    return this.executor.run(task);
  }

  async runTask(
    task: AgentTask,
  ): Promise<AgentTask> {
    return this.executor.run(task);
  }

  async resume(
    taskId: string,
  ): Promise<AgentTask> {
    return this.executor.resume(
      taskId,
    );
  }

  async pause(
    taskId: string,
  ): Promise<AgentTask> {
    return this.executor.pause(
      taskId,
    );
  }

  async cancel(
    taskId: string,
  ): Promise<AgentTask> {
    return this.executor.cancel(
      taskId,
    );
  }

  async get(
    taskId: string,
  ): Promise<AgentTask | undefined> {
    return getTask(taskId);
  }

  async list(): Promise<AgentTask[]> {
    return loadTasks();
  }

  async progress(
    taskId: string,
  ) {
    const task =
      await getTask(taskId);

    if (!task) {
      throw new Error(
        `Task not found: ${taskId}`,
      );
    }

    return getProgress(task);
  }
}

export const taskEngine =
  new AutonomousTaskEngine();

export { initializeTaskEngine } from "./integration";

export { planTask } from "./aiPlanner";
