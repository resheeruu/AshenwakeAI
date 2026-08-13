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

export class TaskExecutor {
  private readonly actions =
    new Map<string, TaskAction>();

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

    task.status = "running";
    task.updatedAt =
      new Date().toISOString();

    await upsertTask(task);

    for (
      let index = task.currentStep;
      index < task.steps.length;
      index++
    ) {
      if (task.status !== "running") {
        break;
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
    while (
      step.attempts <
      step.maxAttempts
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

    task.status = "cancelled";
    task.updatedAt =
      new Date().toISOString();

    await upsertTask(task);

    return task;
  }
}
