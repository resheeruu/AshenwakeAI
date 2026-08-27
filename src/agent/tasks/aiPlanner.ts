import { AIRequest } from "../../ai/types";
import { AIRouter } from "../../ai/router";
import { SystemUsageManager, getPriorityForSystem, estimateSystemCredits } from "../../ai/system-usage";
import { canRunInternalOperation } from "../../core/load-manager";
import {
  AgentTask,
  TaskStep,
} from "./types";
import { createTask, validateTaskPlan } from "./planner";

function extractJSON(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const start =
    cleaned.indexOf("{");

  const end =
    cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error(
      "AI planner did not return JSON.",
    );
  }

  return JSON.parse(
    cleaned.slice(start, end + 1),
  );
}

interface PlannedTask {
  goal: string;
  steps: Array<{
    title: string;
    description: string;
    action: string;
    maxAttempts?: number;
  }>;
}

const ALLOWED_ACTIONS = new Set([
  "project_status",
  "check_dependencies",
  "check_project",
  "typecheck",
  "run_tests",
  "search_project",
  "repair_file",
]);

export async function planTask(
  router: AIRouter,
  goal: string,
  systemUsage?: SystemUsageManager,
): Promise<AgentTask> {
  if (!goal.trim()) {
    throw new Error(
      "Task goal cannot be empty.",
    );
  }

  const priority = getPriorityForSystem("task-planner");
  if (!canRunInternalOperation(priority)) {
    throw new Error("System load too high. Try again later.");
  }

  const estimatedCredits = estimateSystemCredits("plan-task");
  if (systemUsage) {
    const check = systemUsage.canExecute("task-planner", priority, estimatedCredits);
    if (!check.allowed) {
      throw new Error(`Task planner deferred: ${check.reason}`);
    }
    systemUsage.acquire("task-planner");
  }

  try {
    const request: AIRequest = {
      messages: [
        {
          role: "system",
          content: `
You are AshenAI's task planner.

Convert the user's goal into a SAFE,
SMALL, ordered execution plan.

Available actions:
- project_status
- check_dependencies
- check_project
- typecheck
- run_tests
- search_project
- repair_file
- repair_file

Rules:
1. Return exactly one JSON object.
2. Never invent an action.
3. Use only the available actions.
4. Use the minimum number of steps necessary.
5. Each step must have a clear purpose.
6. Do not perform destructive operations.
7. repair_file is allowed ONLY after a diagnostic step has identified a specific source file and verification error.
8. For repair_file, description MUST use exactly:
   FILE: <project-relative-file-path>
   ERROR: <actual-verification-error>
9. Do not execute shell commands directly.
10. Maximum 8 steps.

Return:
{
  "goal": "string",
  "steps": [
    {
      "title": "string",
      "description": "string",
      "action": "allowed_action",
      "maxAttempts": 2
    }
  ]
}

Return JSON only.
`,
        },
        {
          role: "user",
          content: goal,
        },
      ],
      temperature: 0.1,
      maxTokens: 2000,
    };

    const response =
      await router.generate(request);

    if (systemUsage) {
      systemUsage.record({
        system: "task-planner",
        operation: "plan",
        provider: response.provider,
        credits: estimatedCredits,
        latencyMs: response.latencyMs,
        success: true,
      });
    }

    const parsed =
      extractJSON(response.text) as PlannedTask;

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      throw new Error(
        "Invalid task plan.",
      );
    }

    if (
      !Array.isArray(parsed.steps) ||
      parsed.steps.length === 0
    ) {
      throw new Error(
        "AI generated an empty task.",
      );
    }

    if (parsed.steps.length > 8) {
      throw new Error(
        "AI generated too many task steps.",
      );
    }

    validateTaskPlan(parsed.steps);

    for (const step of parsed.steps) {
      if (
        !step.title ||
        !step.description ||
        !ALLOWED_ACTIONS.has(
          step.action,
        )
      ) {
        throw new Error(
          `Unsafe or invalid task step: ${JSON.stringify(step)}`,
        );
      }
    }

    return createTask(
      parsed.goal || goal,
      parsed.steps,
    );
  } catch (error) {
    if (systemUsage) {
      systemUsage.record({
        system: "task-planner",
        operation: "plan",
        credits: estimatedCredits,
        success: false,
      });
    }
    throw error;
  } finally {
    if (systemUsage) {
      systemUsage.release("task-planner");
    }
  }
}
