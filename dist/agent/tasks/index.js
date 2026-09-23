"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var tasks_exports = {};
__export(tasks_exports, {
  AutonomousTaskEngine: () => AutonomousTaskEngine,
  initializeTaskEngine: () => import_integration.initializeTaskEngine,
  planTask: () => import_aiPlanner.planTask,
  taskEngine: () => taskEngine
});
module.exports = __toCommonJS(tasks_exports);
var import_store = require("./store");
var import_planner = require("./planner");
var import_executor = require("./executor");
__reExport(tasks_exports, require("./types"), module.exports);
__reExport(tasks_exports, require("./planner"), module.exports);
__reExport(tasks_exports, require("./store"), module.exports);
__reExport(tasks_exports, require("./executor"), module.exports);
var import_integration = require("./integration");
var import_aiPlanner = require("./aiPlanner");
class AutonomousTaskEngine {
  executor = new import_executor.TaskExecutor();
  registerAction(name, action) {
    this.executor.registerAction(
      name,
      action
    );
  }
  async create(goal, steps) {
    const task = (0, import_planner.createTask)(goal, steps);
    await (0, import_store.upsertTask)(task);
    return task;
  }
  async planAndRun(router, goal, systemUsage) {
    const { planTask: planTask2 } = await import("./aiPlanner");
    const planned = await planTask2(router, goal, systemUsage);
    await (0, import_store.upsertTask)(planned);
    return this.executor.run(planned);
  }
  async run(taskId) {
    const task = await (0, import_store.getTask)(taskId);
    if (!task) {
      throw new Error(
        `Task not found: ${taskId}`
      );
    }
    return this.executor.run(task);
  }
  async runTask(task) {
    return this.executor.run(task);
  }
  async resume(taskId) {
    return this.executor.resume(
      taskId
    );
  }
  async pause(taskId) {
    return this.executor.pause(
      taskId
    );
  }
  async cancel(taskId) {
    return this.executor.cancel(
      taskId
    );
  }
  async get(taskId) {
    return (0, import_store.getTask)(taskId);
  }
  async list() {
    return (0, import_store.loadTasks)();
  }
  async progress(taskId) {
    const task = await (0, import_store.getTask)(taskId);
    if (!task) {
      throw new Error(
        `Task not found: ${taskId}`
      );
    }
    return (0, import_planner.getProgress)(task);
  }
}
const taskEngine = new AutonomousTaskEngine();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AutonomousTaskEngine,
  initializeTaskEngine,
  planTask,
  taskEngine,
  ...require("./types"),
  ...require("./planner"),
  ...require("./store"),
  ...require("./executor")
});
