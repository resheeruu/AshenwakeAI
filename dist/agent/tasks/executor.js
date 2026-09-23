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
var executor_exports = {};
__export(executor_exports, {
  TaskExecutor: () => TaskExecutor
});
module.exports = __toCommonJS(executor_exports);
var import_store = require("./store");
var import_permissions = require("./permissions");
var import_logger = require("../../logger");
const MAX_STEP_ATTEMPTS = 10;
const MAX_TASK_EXECUTION_MS = 30 * 6e4;
class TaskExecutor {
  actions = /* @__PURE__ */ new Map();
  /** Track currently running task IDs to prevent concurrent execution */
  runningTasks = /* @__PURE__ */ new Set();
  registerAction(name, action) {
    if (!name.trim()) {
      throw new Error(
        "Task action name cannot be empty."
      );
    }
    this.actions.set(name, action);
  }
  hasAction(name) {
    return this.actions.has(name);
  }
  async run(task) {
    if (task.status === "completed" || task.status === "cancelled") {
      return task;
    }
    if (this.runningTasks.has(task.id)) {
      import_logger.logger.warn(`Task ${task.id} is already running \u2014 skipping duplicate execution`);
      return task;
    }
    this.runningTasks.add(task.id);
    try {
      return await this.doRun(task);
    } finally {
      this.runningTasks.delete(task.id);
    }
  }
  async doRun(task) {
    task.status = "running";
    task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await (0, import_store.upsertTask)(task);
    const taskStart = Date.now();
    for (let index = task.currentStep; index < task.steps.length; index++) {
      if (task.status !== "running") {
        break;
      }
      if (Date.now() - taskStart > MAX_TASK_EXECUTION_MS) {
        task.status = "failed";
        task.error = "Task exceeded maximum execution time";
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await (0, import_store.upsertTask)(task);
        import_logger.logger.warn(`Task ${task.id} exceeded execution time limit`);
        return task;
      }
      const step = task.steps[index];
      task.currentStep = index;
      if (!(0, import_permissions.isActionAllowed)(step.action)) {
        step.status = "failed";
        step.error = `Permission denied for action "${step.action}".`;
        task.status = "failed";
        task.error = step.error;
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await (0, import_store.upsertTask)(task);
        return task;
      }
      const action = this.actions.get(step.action);
      if (!action) {
        step.status = "failed";
        step.error = `Action "${step.action}" is not registered.`;
        task.status = "failed";
        task.error = step.error;
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await (0, import_store.upsertTask)(task);
        return task;
      }
      const success = await this.runStep(
        task,
        step,
        action
      );
      if (!success) {
        task.status = "failed";
        task.error = step.error ?? `Task step failed: ${step.title}`;
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await (0, import_store.upsertTask)(task);
        return task;
      }
    }
    if (task.status === "running") {
      task.status = "completed";
      task.completedAt = (/* @__PURE__ */ new Date()).toISOString();
      task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await (0, import_store.upsertTask)(task);
    }
    return task;
  }
  async runStep(task, step, action) {
    if (typeof step.maxAttempts !== "number" || step.maxAttempts < 1) {
      step.maxAttempts = 2;
    }
    const maxAttempts = Math.min(step.maxAttempts, MAX_STEP_ATTEMPTS);
    while (step.attempts < maxAttempts) {
      step.attempts++;
      step.status = "running";
      step.startedAt = (/* @__PURE__ */ new Date()).toISOString();
      step.error = void 0;
      task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await (0, import_store.upsertTask)(task);
      try {
        const result = await action({
          task,
          step
        });
        step.result = result;
        step.status = "completed";
        step.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await (0, import_store.upsertTask)(task);
        return true;
      } catch (error) {
        step.error = error instanceof Error ? error.message : String(error);
        step.status = "failed";
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await (0, import_store.upsertTask)(task);
      }
    }
    return false;
  }
  async resume(taskId) {
    const task = await (0, import_store.getTask)(taskId);
    if (!task) {
      throw new Error(
        `Task not found: ${taskId}`
      );
    }
    if (task.status !== "paused" && task.status !== "pending") {
      return task;
    }
    if (this.runningTasks.has(task.id)) {
      import_logger.logger.warn(`Task ${taskId} is already running \u2014 cannot resume`);
      return task;
    }
    task.status = "running";
    task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await (0, import_store.upsertTask)(task);
    return this.run(task);
  }
  async pause(taskId) {
    const task = await (0, import_store.getTask)(taskId);
    if (!task) {
      throw new Error(
        `Task not found: ${taskId}`
      );
    }
    if (task.status === "running") {
      task.status = "paused";
      task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await (0, import_store.upsertTask)(task);
    }
    return task;
  }
  async cancel(taskId) {
    const task = await (0, import_store.getTask)(taskId);
    if (!task) {
      throw new Error(
        `Task not found: ${taskId}`
      );
    }
    const cancellableStatuses = /* @__PURE__ */ new Set(["pending", "running", "paused"]);
    if (!cancellableStatuses.has(task.status)) {
      return task;
    }
    task.status = "cancelled";
    task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.runningTasks.delete(task.id);
    await (0, import_store.upsertTask)(task);
    return task;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TaskExecutor
});
