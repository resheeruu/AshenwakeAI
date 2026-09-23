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
var planner_exports = {};
__export(planner_exports, {
  createTask: () => createTask,
  getProgress: () => getProgress,
  validateTaskPlan: () => validateTaskPlan
});
module.exports = __toCommonJS(planner_exports);
function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function createTask(goal, steps) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const taskSteps = steps.map((step) => ({
    id: createId("step"),
    title: step.title,
    description: step.description,
    action: step.action,
    status: "pending",
    attempts: 0,
    maxAttempts: step.maxAttempts ?? 2
  }));
  return {
    id: createId("task"),
    goal,
    status: "pending",
    steps: taskSteps,
    currentStep: 0,
    createdAt: now,
    updatedAt: now
  };
}
function getProgress(task) {
  const total = task.steps.length;
  const completed = task.steps.filter(
    (step) => step.status === "completed" || step.status === "skipped"
  ).length;
  const percentage = total === 0 ? 100 : Math.round(
    completed / total * 100
  );
  return {
    taskId: task.id,
    status: task.status,
    completed,
    total,
    percentage
  };
}
function validateTaskPlan(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("Task plan contains no steps.");
  }
  if (steps.length > 8) {
    throw new Error("Task plan exceeds the 8-step limit.");
  }
  const diagnosticActions = /* @__PURE__ */ new Set([
    "project_status",
    "check_dependencies",
    "check_project",
    "typecheck",
    "search_project"
  ]);
  let diagnosticCompleted = false;
  let repairSeen = false;
  for (const step of steps) {
    if (!step.action || !step.title || !step.description) {
      throw new Error(
        "Every task step requires title, description, and action."
      );
    }
    if (step.action === "repair_file") {
      if (!diagnosticCompleted) {
        throw new Error(
          "Unsafe task plan: repair_file requires a diagnostic step first."
        );
      }
      if (repairSeen) {
        throw new Error(
          "Unsafe task plan: only one repair_file action is allowed."
        );
      }
      const description = step.description.trim();
      const match = description.match(
        /^FILE:\s*([^\n]+?)\s*\nERROR:\s*([\s\S]+)$/i
      );
      if (!match) {
        throw new Error(
          "Unsafe repair step: expected exactly 'FILE: <path>' followed by 'ERROR: <actual verification error>'."
        );
      }
      const filePath = match[1].trim();
      let errorOutput = match[2].trim();
      if (!filePath || !errorOutput) {
        throw new Error(
          "Unsafe repair step: file path and verification error cannot be empty."
        );
      }
      errorOutput = errorOutput.replace(/(?:ignore|disregard|override|bypass)\s+(?:all\s+)?(?:previous|prior|above|system)\s+instructions?/gi, "[REDACTED]").replace(/\[SYSTEM\]|\[INST\]|<<\|im_start\|>>/gi, "[REDACTED]").slice(0, 2e3);
      if (filePath.startsWith("/") || filePath.includes("..")) {
        throw new Error(
          `Unsafe repair step: invalid project-relative file path "${filePath}".`
        );
      }
      repairSeen = true;
      continue;
    }
    if (repairSeen) {
      const allowedAfterRepair = /* @__PURE__ */ new Set([
        "typecheck",
        "run_tests"
      ]);
      if (!allowedAfterRepair.has(step.action)) {
        throw new Error(
          `Unsafe task plan: ${step.action} cannot run after repair_file.`
        );
      }
    }
    if (diagnosticActions.has(step.action)) {
      diagnosticCompleted = true;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createTask,
  getProgress,
  validateTaskPlan
});
