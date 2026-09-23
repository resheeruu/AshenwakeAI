"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var aiPlanner_exports = {};
__export(aiPlanner_exports, {
  planTask: () => planTask
});
module.exports = __toCommonJS(aiPlanner_exports);
var import_system_usage = require("../../ai/system-usage");
var import_load_manager = require("../../core/load-manager");
var import_planner = require("./planner");
function extractJSON(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(
      "AI planner did not return JSON."
    );
  }
  return JSON.parse(
    cleaned.slice(start, end + 1)
  );
}
const ALLOWED_ACTIONS = /* @__PURE__ */ new Set([
  "project_status",
  "check_dependencies",
  "check_project",
  "typecheck",
  "run_tests",
  "search_project",
  "repair_file"
]);
async function planTask(router, goal, systemUsage) {
  if (!goal.trim()) {
    throw new Error(
      "Task goal cannot be empty."
    );
  }
  const priority = (0, import_system_usage.getPriorityForSystem)("task-planner");
  if (!(0, import_load_manager.canRunInternalOperation)(priority)) {
    throw new Error("System load too high. Try again later.");
  }
  const estimatedCredits = (0, import_system_usage.estimateSystemCredits)("plan-task");
  if (systemUsage) {
    const check = systemUsage.canExecute("task-planner", priority, estimatedCredits);
    if (!check.allowed) {
      throw new Error(`Task planner deferred: ${check.reason}`);
    }
    systemUsage.acquire("task-planner");
  }
  try {
    const request = {
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
`
        },
        {
          role: "user",
          content: goal
        }
      ],
      temperature: 0.1,
      maxTokens: 2e3
    };
    const response = await router.generate(request);
    if (systemUsage) {
      systemUsage.record({
        system: "task-planner",
        operation: "plan",
        provider: response.provider,
        credits: estimatedCredits,
        latencyMs: response.latencyMs,
        success: true
      });
    }
    const parsed = extractJSON(response.text);
    if (!parsed || typeof parsed !== "object") {
      throw new Error(
        "Invalid task plan."
      );
    }
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error(
        "AI generated an empty task."
      );
    }
    if (parsed.steps.length > 8) {
      throw new Error(
        "AI generated too many task steps."
      );
    }
    (0, import_planner.validateTaskPlan)(parsed.steps);
    for (const step of parsed.steps) {
      if (!step.title || !step.description || !ALLOWED_ACTIONS.has(
        step.action
      )) {
        throw new Error(
          `Unsafe or invalid task step: ${JSON.stringify(step)}`
        );
      }
    }
    return (0, import_planner.createTask)(
      parsed.goal || goal,
      parsed.steps
    );
  } catch (error) {
    if (systemUsage) {
      systemUsage.record({
        system: "task-planner",
        operation: "plan",
        credits: estimatedCredits,
        success: false
      });
    }
    throw error;
  } finally {
    if (systemUsage) {
      systemUsage.release("task-planner");
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  planTask
});
