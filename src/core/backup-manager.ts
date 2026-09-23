import fs from "fs";
import path from "path";
import { logger } from "../logger";
import { readJSON, writeJSON, dataPath } from "./data-store";
import { getDatabase } from "../database/database";

export interface BackupEntry {
  id: string;
  timestamp: number;
  type: "manual" | "auto";
  description: string;
  files: string[];
}

const BACKUPS_DIR = path.join(process.cwd(), "backups");
const BACKUP_INDEX = "backup-index.json";

/** Backup IDs are machine-generated: `backup-` + base36 timestamp. */
const BACKUP_ID_PATTERN = /^backup-[a-z0-9]+$/i;

function ensureBackupDir(): void {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

/**
 * Resolve a backup ID to a directory path, or null if the ID is unsafe.
 * Rejects "..", path separators, absolute paths, and anything that would
 * escape BACKUPS_DIR after resolution.
 */
export function resolveBackupDir(id: string): string | null {
  const raw = String(id ?? "");
  if (!raw || raw.length > 128) return null;
  if (!BACKUP_ID_PATTERN.test(raw)) return null;
  if (raw.includes("..") || raw.includes("/") || raw.includes("\\")) return null;
  if (raw.includes("\0")) return null;

  const root = path.resolve(BACKUPS_DIR);
  const resolved = path.resolve(root, raw);

  // Containment check
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  // Must be a direct child of BACKUPS_DIR
  if (path.dirname(resolved) !== root) {
    return null;
  }
  return resolved;
}

function getBackupIndex(): BackupEntry[] {
  return readJSON<BackupEntry[]>(BACKUP_INDEX, []);
}

function saveBackupIndex(entries: BackupEntry[]): void {
  writeJSON(BACKUP_INDEX, entries);
}

/**
 * Copy the SQLite database using better-sqlite3's online backup API
 * (consistent snapshot) instead of a raw file copy while the app may
 * still be writing. Falls back to checkpoint+copy if backup fails.
 */
async function backupSqliteDatabase(destPath: string): Promise<void> {
  try {
    const db = getDatabase();
    await db.backup(destPath);
    return;
  } catch (err) {
    logger.warn(
      `⚠️ Backup: SQLite online backup failed, falling back to checkpoint: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const db = getDatabase();
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // best effort
  }
  const src = path.join(process.cwd(), "data", "ashenai.db");
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, destPath);
  }
}

export async function createBackup(
  description: string,
  type: "manual" | "auto" = "manual",
): Promise<BackupEntry> {
  ensureBackupDir();
  const id = `backup-${Date.now().toString(36)}`;
  const backupDir = resolveBackupDir(id);
  if (!backupDir) {
    throw new Error("Invalid backup ID generated");
  }
  fs.mkdirSync(backupDir, { recursive: true });

  const dataDir = path.join(process.cwd(), "data");
  const filesToBackup = ["ashenai.db", "provider-health.json", "mod-cases.json", "tickets.json", "xp-data.json", "knowledge-data.json", "game-players.json", "warnings.json"];

  const backedUp: string[] = [];
  for (const file of filesToBackup) {
    const src = path.join(dataDir, file);
    try {
      if (file === "ashenai.db") {
        if (fs.existsSync(src)) {
          await backupSqliteDatabase(path.join(backupDir, file));
          if (fs.existsSync(path.join(backupDir, file))) {
            backedUp.push(file);
          }
        }
        continue;
      }
      if (fs.existsSync(src)) {
        const dest = path.join(backupDir, file);
        if (fs.statSync(src).isDirectory()) {
          fs.cpSync(src, dest, { recursive: true });
        } else {
          fs.copyFileSync(src, dest);
        }
        backedUp.push(file);
      }
    } catch (err) {
      logger.warn(`⚠️ Backup: failed to copy ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // If no files were backed up, remove the empty backup directory
  if (backedUp.length === 0) {
    try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch { /* best effort */ }
    logger.warn("⚠️ Backup: no files copied, backup discarded.");
    return { id, timestamp: Date.now(), type, description, files: [] };
  }

  const entry: BackupEntry = { id, timestamp: Date.now(), type, description, files: backedUp };
  const index = getBackupIndex();
  index.push(entry);

  // Prune old backups: keep max 50, and clean up orphaned directories
  if (index.length > 50) {
    const removed = index.splice(0, index.length - 50);
    for (const old of removed) {
      const oldDir = resolveBackupDir(old.id);
      if (oldDir) {
        try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
  }

  saveBackupIndex(index);

  logger.info(`💾 Backup created: ${id} (${backedUp.length} files)`);
  return entry;
}

export function restoreBackup(id: string): { success: boolean; message: string } {
  const backupDir = resolveBackupDir(id);
  if (!backupDir || !fs.existsSync(backupDir)) {
    return { success: false, message: "Backup not found" };
  }

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    const files = fs.readdirSync(backupDir);
    for (const file of files) {
      // Each restored file must stay inside data/
      if (file.includes("..") || file.includes("/") || file.includes("\\")) {
        continue;
      }
      const src = path.join(backupDir, file);
      const dest = path.resolve(dataDir, file);
      if (dest !== path.resolve(dataDir) && !dest.startsWith(path.resolve(dataDir) + path.sep)) {
        continue;
      }
      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      } else {
        fs.copyFileSync(src, dest);
      }
    }
    logger.info(`📥 Backup restored: ${id}`);
    return { success: true, message: `Restored ${files.length} files from backup ${id}` };
  } catch (error) {
    return { success: false, message: `Restore failed: ${error instanceof Error ? error.message : "unknown"}` };
  }
}

export function listBackups(): BackupEntry[] {
  return getBackupIndex().sort((a, b) => b.timestamp - a.timestamp);
}

export function deleteBackup(id: string): boolean {
  const backupDir = resolveBackupDir(id);
  if (!backupDir || !fs.existsSync(backupDir)) return false;
  fs.rmSync(backupDir, { recursive: true, force: true });
  const index = getBackupIndex().filter((b) => b.id !== id);
  saveBackupIndex(index);
  return true;
}

export async function autoBackup(): Promise<void> {
  const index = getBackupIndex();
  const lastAuto = index.filter((b) => b.type === "auto").sort((a, b) => b.timestamp - a.timestamp)[0];
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  if (!lastAuto || lastAuto.timestamp < sixHoursAgo) {
    await createBackup("Auto backup", "auto");
  }
}
