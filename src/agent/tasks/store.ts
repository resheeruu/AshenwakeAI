/**
 * Task Store — Backward-compatible re-export from SQLite store.
 *
 * The original JSON-based store has been replaced with SQLite for:
 * - Atomic writes (no partial corruption)
 * - Concurrent access safety (WAL mode)
 * - Checkpoint/resume across restarts
 * - Query support (filter by status, guild, etc.)
 */

export {
  loadTasks,
  saveTasks,
  getTask,
  upsertTask,
  deleteTask,
  getTasksByStatus,
  cleanupOldTasks,
} from "./sqlite-store";
