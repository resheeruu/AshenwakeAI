import {
  AgentTask,
  TaskAction,
  TaskStep,
} from "./types";
import {
  getTask,
  upsertTask,
} from "./store";
import { isActionAllowed } from "./permissions";
import { logger } from "../../logger";

const MAX_STEP_ATTEMPTS = 10;
const MAX_TASK_EXECUTION_MS = 30 * 60_000; // 30 minutes total

export class TaskExecutor {
  private readonly actions =
    new Map<string, TaskAction>();

  /** Track currently running task IDs to prevent concurrent execution */
  private readonly runningTasks = new Set<string>();

  registerAction(
    name: string,
    action: TaskAction,
  ): void {
    if (!name.trim()) {
      throw new Error(
        "Task action name cannot be empty.",
      );
    }

    this.actions.set(name, action);
  }

  hasAction(name: string): boolean {
    return this.actions.has(name);
  }

  async run(
    task: AgentTask,
  ): Promise<AgentTask> {
    if (
      task.status === "completed" ||
      task.status === "cancelled"
    ) {
      return task;
    }

    // Prevent concurrent execution of the same task
    if (this.runningTasks.has(task.id)) {
      logger.warn(`Task ${task.id} is already running — skipping duplicate execution`);
      return task;
    }

    this.runningTasks.add(task.id);

    try {
      return await this.doRun(task);
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  private async doRun(
    task: AgentTask,
  ): Promise<AgentTask> {
    task.status = "running";
    task.updatedAt =
      new Date().toISOString();

    await upsertTask(task);

    const taskStart = Date.now();

    for (
      let index = task.currentStep;
      index < task.steps.length;
      index++
    ) {
      if (task.status !== "running") {
        break;
      }

      // Enforce total task execution time limit
      if (Date.now() - taskStart > MAX_TASK_EXECUTION_MS) {
        task.status = "failed";
        task.error = "Task exceeded maximum execution time";
        task.updatedAt = new Date().toISOString();
        await upsertTask(task);
        logger.warn(`Task ${task.id} exceeded execution time limit`);
        return task;
      }

      const step =
        task.steps[index];

      task.currentStep = index;

      if (!isActionAllowed(step.action)) {
        step.status = "failed";
        step.error =
          `Permission denied for action "${step.action}".`;

        task.status = "failed";
        task.error = step.error;
        task.updatedAt =
          new Date().toISOString();

        await upsertTask(task);

        return task;
      }

      const action =
        this.actions.get(step.action);

      if (!action) {
        step.status = "failed";
        step.error =
          `Action "${step.action}" is not registered.`;

        task.status = "failed";
        task.error = step.error;
        task.updatedAt =
          new Date().toISOString();

        await upsertTask(task);

        return task;
      }

      const success =
        await this.runStep(
          task,
          step,
          action,
        );

      if (!success) {
        task.status = "failed";
        task.error =
          step.error ??
          `Task step failed: ${step.title}`;

        task.updatedAt =
          new Date().toISOString();

        await upsertTask(task);

        return task;
      }
    }

    if (task.status === "running") {
      task.status = "completed";
      task.completedAt =
        new Date().toISOString();
      task.updatedAt =
        new Date().toISOString();

      await upsertTask(task);
    }

    return task;
  }

  private async runStep(
    task: AgentTask,
    step: TaskStep,
    action: TaskAction,
  ): Promise<boolean> {
    // Ensure maxAttempts has a valid value (undefined from JSON parsing would cause silent failure)
    if (typeof step.maxAttempts !== "number" || step.maxAttempts < 1) {
      step.maxAttempts = 2;
    }
    const maxAttempts = Math.min(step.maxAttempts, MAX_STEP_ATTEMPTS);

    while (
      step.attempts <
      maxAttempts
    ) {
      step.attempts++;
      step.status = "running";
      step.startedAt =
        new Date().toISOString();
      step.error = undefined;

      task.updatedAt =
        new Date().toISOString();

      await upsertTask(task);

      try {
        const result =
          await action({
            task,
            step,
          });

        step.result = result;
        step.status = "completed";
        step.completedAt =
          new Date().toISOString();

        task.updatedAt =
          new Date().toISOString();

        await upsertTask(task);

        return true;
      } catch (error) {
        step.error =
          error instanceof Error
            ? error.message
            : String(error);

        step.status = "failed";

        task.updatedAt =
          new Date().toISOString();

        await upsertTask(task);
      }
    }

    return false;
  }

  async resume(
    taskId: string,
  ): Promise<AgentTask> {
    const task =
      await getTask(taskId);

    if (!task) {
      throw new Error(
        `Task not found: ${taskId}`,
      );
    }

    if (
      task.status !== "paused" &&
      task.status !== "pending"
    ) {
      return task;
    }

    // Prevent concurrent execution
    if (this.runningTasks.has(task.id)) {
      logger.warn(`Task ${taskId} is already running — cannot resume`);
      return task;
    }

    task.status = "running";
    task.updatedAt =
      new Date().toISOString();

    await upsertTask(task);

    return this.run(task);
  }

  async pause(
    taskId: string,
  ): Promise<AgentTask> {
    const task =
      await getTask(taskId);

    if (!task) {
      throw new Error(
        `Task not found: ${taskId}`,
      );
    }

    if (task.status === "running") {
      task.status = "paused";
      task.updatedAt =
        new Date().toISOString();

      await upsertTask(task);
    }

    return task;
  }

  async cancel(
    taskId: string,
  ): Promise<AgentTask> {
    const task =
      await getTask(taskId);

    if (!task) {
      throw new Error(
        `Task not found: ${taskId}`,
      );
    }

    // Only cancel tasks that are in a cancellable state
    const cancellableStatuses = new Set(["pending", "running", "paused"]);
    if (!cancellableStatuses.has(task.status)) {
      return task;
    }

    task.status = "cancelled";
    task.updatedAt =
      new Date().toISOString();

    // Remove from running tasks set if it was running
    this.runningTasks.delete(task.id);

    await upsertTask(task);

    return task;
  }
}
