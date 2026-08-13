import {
  AgentTask,
  TaskStep,
} from "./types";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function createTask(
  goal: string,
  steps: Array<{
    title: string;
    description: string;
    action: string;
    maxAttempts?: number;
  }>,
): AgentTask {
  const now =
    new Date().toISOString();

  const taskSteps: TaskStep[] =
    steps.map(step => ({
      id: createId("step"),
      title: step.title,
      description: step.description,
      action: step.action,
      status: "pending",
      attempts: 0,
      maxAttempts:
        step.maxAttempts ?? 2,
    }));

  return {
    id: createId("task"),
    goal,
    status: "pending",
    steps: taskSteps,
    currentStep: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function getProgress(
  task: AgentTask,
) {
  const total =
    task.steps.length;

  const completed =
    task.steps.filter(
      step =>
        step.status === "completed" ||
        step.status === "skipped",
    ).length;

  const percentage =
    total === 0
      ? 100
      : Math.round(
          (completed / total) * 100,
        );

  return {
    taskId: task.id,
    status: task.status,
    completed,
    total,
    percentage,
  };
}

/* =========================================================
   DETERMINISTIC TASK SAFETY VALIDATION
   ========================================================= */

export function validateTaskPlan(
  steps: Array<{
    title: string;
    description: string;
    action: string;
    maxAttempts?: number;
  }>,
): void {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("Task plan contains no steps.");
  }

  if (steps.length > 8) {
    throw new Error("Task plan exceeds the 8-step limit.");
  }

  const diagnosticActions = new Set([
    "project_status",
    "check_dependencies",
    "check_project",
    "typecheck",
    "search_project",
    "repair_file",
  ]);

  let diagnosticCompleted = false;
  let repairSeen = false;

  for (const step of steps) {
    if (!step.action || !step.title || !step.description) {
      throw new Error(
        "Every task step requires title, description, and action.",
      );
    }

    if (step.action === "repair_file") {
      if (!diagnosticCompleted) {
        throw new Error(
          "Unsafe task plan: repair_file requires a diagnostic step first.",
        );
      }

      if (repairSeen) {
        throw new Error(
          "Unsafe task plan: only one repair_file action is allowed.",
        );
      }

      const match = step.description.match(
        /^FILE:\s*(.+?)\s*\nERROR:\s*([\s\S]+)$/i,
      );

      if (!match) {
        throw new Error(
          "Unsafe repair step: expected FILE and ERROR.",
        );
      }

      repairSeen = true;
      continue;
    }

    if (repairSeen) {
      const allowedAfterRepair = new Set([
        "typecheck",
        "run_tests",
      ]);

      if (!allowedAfterRepair.has(step.action)) {
        throw new Error(
          `Unsafe task plan: ${step.action} cannot run after repair_file.`,
        );
      }
    }

    if (diagnosticActions.has(step.action)) {
      diagnosticCompleted = true;
    }
  }
}
