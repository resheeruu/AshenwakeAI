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
var backup_manager_exports = {};
__export(backup_manager_exports, {
  autoBackup: () => autoBackup,
  createBackup: () => createBackup,
  deleteBackup: () => deleteBackup,
  listBackups: () => listBackups,
  resolveBackupDir: () => resolveBackupDir,
  restoreBackup: () => restoreBackup
});
module.exports = __toCommonJS(backup_manager_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_logger = require("../logger");
var import_data_store = require("./data-store");
var import_database = require("../database/database");
const BACKUPS_DIR = import_path.default.join(process.cwd(), "backups");
const BACKUP_INDEX = "backup-index.json";
const BACKUP_ID_PATTERN = /^backup-[a-z0-9]+$/i;
function ensureBackupDir() {
  import_fs.default.mkdirSync(BACKUPS_DIR, { recursive: true });
}
function resolveBackupDir(id) {
  const raw = String(id ?? "");
  if (!raw || raw.length > 128) return null;
  if (!BACKUP_ID_PATTERN.test(raw)) return null;
  if (raw.includes("..") || raw.includes("/") || raw.includes("\\")) return null;
  if (raw.includes("\0")) return null;
  const root = import_path.default.resolve(BACKUPS_DIR);
  const resolved = import_path.default.resolve(root, raw);
  if (resolved !== root && !resolved.startsWith(root + import_path.default.sep)) {
    return null;
  }
  if (import_path.default.dirname(resolved) !== root) {
    return null;
  }
  return resolved;
}
function getBackupIndex() {
  return (0, import_data_store.readJSON)(BACKUP_INDEX, []);
}
function saveBackupIndex(entries) {
  (0, import_data_store.writeJSON)(BACKUP_INDEX, entries);
}
async function backupSqliteDatabase(destPath) {
  try {
    const db = (0, import_database.getDatabase)();
    await db.backup(destPath);
    return;
  } catch (err) {
    import_logger.logger.warn(
      `\u26A0\uFE0F Backup: SQLite online backup failed, falling back to checkpoint: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  try {
    const db = (0, import_database.getDatabase)();
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
  }
  const src = import_path.default.join(process.cwd(), "data", "ashenai.db");
  if (import_fs.default.existsSync(src)) {
    import_fs.default.copyFileSync(src, destPath);
  }
}
async function createBackup(description, type = "manual") {
  ensureBackupDir();
  const id = `backup-${Date.now().toString(36)}`;
  const backupDir = resolveBackupDir(id);
  if (!backupDir) {
    throw new Error("Invalid backup ID generated");
  }
  import_fs.default.mkdirSync(backupDir, { recursive: true });
  const dataDir = import_path.default.join(process.cwd(), "data");
  const filesToBackup = ["ashenai.db", "provider-health.json", "mod-cases.json", "tickets.json", "xp-data.json", "knowledge-data.json", "game-players.json", "warnings.json"];
  const backedUp = [];
  for (const file of filesToBackup) {
    const src = import_path.default.join(dataDir, file);
    try {
      if (file === "ashenai.db") {
        if (import_fs.default.existsSync(src)) {
          await backupSqliteDatabase(import_path.default.join(backupDir, file));
          if (import_fs.default.existsSync(import_path.default.join(backupDir, file))) {
            backedUp.push(file);
          }
        }
        continue;
      }
      if (import_fs.default.existsSync(src)) {
        const dest = import_path.default.join(backupDir, file);
        if (import_fs.default.statSync(src).isDirectory()) {
          import_fs.default.cpSync(src, dest, { recursive: true });
        } else {
          import_fs.default.copyFileSync(src, dest);
        }
        backedUp.push(file);
      }
    } catch (err) {
      import_logger.logger.warn(`\u26A0\uFE0F Backup: failed to copy ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (backedUp.length === 0) {
    try {
      import_fs.default.rmSync(backupDir, { recursive: true, force: true });
    } catch {
    }
    import_logger.logger.warn("\u26A0\uFE0F Backup: no files copied, backup discarded.");
    return { id, timestamp: Date.now(), type, description, files: [] };
  }
  const entry = { id, timestamp: Date.now(), type, description, files: backedUp };
  const index = getBackupIndex();
  index.push(entry);
  if (index.length > 50) {
    const removed = index.splice(0, index.length - 50);
    for (const old of removed) {
      const oldDir = resolveBackupDir(old.id);
      if (oldDir) {
        try {
          import_fs.default.rmSync(oldDir, { recursive: true, force: true });
        } catch {
        }
      }
    }
  }
  saveBackupIndex(index);
  import_logger.logger.info(`\u{1F4BE} Backup created: ${id} (${backedUp.length} files)`);
  return entry;
}
function restoreBackup(id) {
  const backupDir = resolveBackupDir(id);
  if (!backupDir || !import_fs.default.existsSync(backupDir)) {
    return { success: false, message: "Backup not found" };
  }
  const dataDir = import_path.default.join(process.cwd(), "data");
  import_fs.default.mkdirSync(dataDir, { recursive: true });
  try {
    const files = import_fs.default.readdirSync(backupDir);
    for (const file of files) {
      if (file.includes("..") || file.includes("/") || file.includes("\\")) {
        continue;
      }
      const src = import_path.default.join(backupDir, file);
      const dest = import_path.default.resolve(dataDir, file);
      if (dest !== import_path.default.resolve(dataDir) && !dest.startsWith(import_path.default.resolve(dataDir) + import_path.default.sep)) {
        continue;
      }
      if (import_fs.default.statSync(src).isDirectory()) {
        import_fs.default.cpSync(src, dest, { recursive: true });
      } else {
        import_fs.default.copyFileSync(src, dest);
      }
    }
    import_logger.logger.info(`\u{1F4E5} Backup restored: ${id}`);
    return { success: true, message: `Restored ${files.length} files from backup ${id}` };
  } catch (error) {
    return { success: false, message: `Restore failed: ${error instanceof Error ? error.message : "unknown"}` };
  }
}
function listBackups() {
  return getBackupIndex().sort((a, b) => b.timestamp - a.timestamp);
}
function deleteBackup(id) {
  const backupDir = resolveBackupDir(id);
  if (!backupDir || !import_fs.default.existsSync(backupDir)) return false;
  import_fs.default.rmSync(backupDir, { recursive: true, force: true });
  const index = getBackupIndex().filter((b) => b.id !== id);
  saveBackupIndex(index);
  return true;
}
async function autoBackup() {
  const index = getBackupIndex();
  const lastAuto = index.filter((b) => b.type === "auto").sort((a, b) => b.timestamp - a.timestamp)[0];
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1e3;
  if (!lastAuto || lastAuto.timestamp < sixHoursAgo) {
    await createBackup("Auto backup", "auto");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  autoBackup,
  createBackup,
  deleteBackup,
  listBackups,
  resolveBackupDir,
  restoreBackup
});
