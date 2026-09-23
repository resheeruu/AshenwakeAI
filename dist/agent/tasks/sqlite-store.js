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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var sqlite_store_exports = {};
__export(sqlite_store_exports, {
  cleanupOldTasks: () => cleanupOldTasks,
  deleteTask: () => deleteTask,
  getTask: () => getTask,
  getTasksByStatus: () => getTasksByStatus,
  loadTasks: () => loadTasks,
  saveTasks: () => saveTasks,
  upsertTask: () => upsertTask
});
module.exports = __toCommonJS(sqlite_store_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_database = require("../../database");
var import_logger = require("../../logger");
const TASK_FILE = import_path.default.join(process.cwd(), "data", "agent-tasks.json");
const STALE_TASK_THRESHOLD_MS = 5 * 6e4;
const MAX_RETRY_COUNT = 10;
let tableEnsured = false;
let migratedFromJson = false;
function ensureTable() {
  if (tableEnsured) return;
  const db = (0, import_database.getDatabase)();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      task_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_updated ON agent_tasks(updated_at);
  `);
  tableEnsured = true;
}
function migrateFromJson() {
  if (migratedFromJson) return;
  if (!import_fs.default.existsSync(TASK_FILE)) {
    migratedFromJson = true;
    return;
  }
  try {
    const raw = import_fs.default.readFileSync(TASK_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      migratedFromJson = true;
      return;
    }
    ensureTable();
    const db = (0, import_database.getDatabase)();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO agent_tasks (id, goal, status, task_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const task of parsed) {
        if (!task?.id) continue;
        const createdAt = task.createdAt ? new Date(task.createdAt).getTime() : Date.now();
        const updatedAt = task.updatedAt ? new Date(task.updatedAt).getTime() : Date.now();
        insert.run(
          task.id,
          task.goal || "",
          task.status || "pending",
          JSON.stringify(task),
          createdAt,
          updatedAt
        );
      }
    })();
    import_logger.logger.info(`Migrated ${parsed.length} tasks from JSON to SQLite`);
    import_fs.default.renameSync(TASK_FILE, `${TASK_FILE}.bak`);
    migratedFromJson = true;
  } catch (error) {
    import_logger.logger.warn(`Failed to migrate tasks from JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function recoverStaleTasks() {
  ensureTable();
  const db = (0, import_database.getDatabase)();
  const cutoff = Date.now() - STALE_TASK_THRESHOLD_MS;
  const staleRunning = db.prepare(
    `SELECT id, task_json FROM agent_tasks WHERE status = 'running' AND updated_at < ?`
  ).all(cutoff);
  if (staleRunning.length === 0) return;
  const update = db.prepare(
    `UPDATE agent_tasks SET status = 'pending', updated_at = ? WHERE id = ?`
  );
  db.transaction(() => {
    for (const row of staleRunning) {
      try {
        const task = JSON.parse(row.task_json);
        task.status = "pending";
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        update.run(Date.now(), row.id);
        db.prepare(`UPDATE agent_tasks SET task_json = ? WHERE id = ?`).run(JSON.stringify(task), row.id);
        import_logger.logger.info(`Recovered stale task: ${row.id} ("${task.goal?.slice(0, 50)}")`);
      } catch {
        db.prepare(
          `UPDATE agent_tasks SET status = 'failed', updated_at = ? WHERE id = ?`
        ).run(Date.now(), row.id);
      }
    }
  })();
  import_logger.logger.info(`Recovered ${staleRunning.length} stale task(s)`);
}
const VALID_TRANSITIONS = {
  pending: ["running", "cancelled"],
  running: ["paused", "completed", "failed", "cancelled"],
  paused: ["running", "cancelled"],
  completed: [],
  failed: ["pending"],
  // Allow retry from failed
  cancelled: []
};
function isValidTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
async function loadTasks() {
  migrateFromJson();
  ensureTable();
  recoverStaleTasks();
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare(
      `SELECT task_json FROM agent_tasks ORDER BY created_at DESC`
    ).all();
    return rows.map((r) => {
      try {
        return JSON.parse(r.task_json);
      } catch {
        return null;
      }
    }).filter((t) => t !== null);
  }, [], "task-store-load");
}
async function saveTasks(tasks) {
  ensureTable();
  const db = (0, import_database.getDatabase)();
  const upsert = db.prepare(`
    INSERT INTO agent_tasks (id, goal, status, task_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      goal = excluded.goal,
      status = excluded.status,
      task_json = excluded.task_json,
      updated_at = excluded.updated_at
  `);
  db.transaction(() => {
    for (const task of tasks) {
      const createdAt = task.createdAt ? new Date(task.createdAt).getTime() : Date.now();
      upsert.run(
        task.id,
        task.goal || "",
        task.status || "pending",
        JSON.stringify(task),
        createdAt,
        Date.now()
      );
    }
  })();
}
async function getTask(taskId) {
  ensureTable();
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const row = db.prepare(
      `SELECT task_json FROM agent_tasks WHERE id = ?`
    ).get(taskId);
    if (!row) return void 0;
    try {
      return JSON.parse(row.task_json);
    } catch {
      return void 0;
    }
  }, void 0, "task-store-get");
}
async function upsertTask(task) {
  ensureTable();
  const db = (0, import_database.getDatabase)();
  const createdAt = task.createdAt ? new Date(task.createdAt).getTime() : Date.now();
  db.prepare(`
    INSERT INTO agent_tasks (id, goal, status, task_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      goal = excluded.goal,
      status = excluded.status,
      task_json = excluded.task_json,
      updated_at = excluded.updated_at
  `).run(
    task.id,
    task.goal || "",
    task.status || "pending",
    JSON.stringify(task),
    createdAt,
    Date.now()
  );
}
async function deleteTask(taskId) {
  ensureTable();
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const result = db.prepare(
      `DELETE FROM agent_tasks WHERE id = ?`
    ).run(taskId);
    return result.changes > 0;
  }, false, "task-store-delete");
}
async function getTasksByStatus(status) {
  ensureTable();
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const rows = db.prepare(
      `SELECT task_json FROM agent_tasks WHERE status = ? ORDER BY created_at DESC`
    ).all(status);
    return rows.map((r) => {
      try {
        return JSON.parse(r.task_json);
      } catch {
        return null;
      }
    }).filter((t) => t !== null);
  }, [], "task-store-by-status");
}
async function cleanupOldTasks(maxAgeMs = 7 * 24 * 36e5) {
  ensureTable();
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const cutoff = Date.now() - maxAgeMs;
    const result = db.prepare(
      `DELETE FROM agent_tasks WHERE status IN ('completed', 'failed', 'cancelled') AND updated_at < ?`
    ).run(cutoff);
    return result.changes;
  }, 0, "task-store-cleanup");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanupOldTasks,
  deleteTask,
  getTask,
  getTasksByStatus,
  loadTasks,
  saveTasks,
  upsertTask
});
