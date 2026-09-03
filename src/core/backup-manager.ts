import fs from "fs";
import path from "path";
import { logger } from "../logger";
import { readJSON, writeJSON, dataPath } from "./data-store";

export interface BackupEntry {
  id: string;
  timestamp: number;
  type: "manual" | "auto";
  description: string;
  files: string[];
}

const BACKUPS_DIR = path.join(process.cwd(), "backups");
const BACKUP_INDEX = "backup-index.json";

function ensureBackupDir(): void {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function getBackupIndex(): BackupEntry[] {
  return readJSON<BackupEntry[]>(BACKUP_INDEX, []);
}

function saveBackupIndex(entries: BackupEntry[]): void {
  writeJSON(BACKUP_INDEX, entries);
}

export function createBackup(description: string, type: "manual" | "auto" = "manual"): BackupEntry {
  ensureBackupDir();
  const id = `backup-${Date.now().toString(36)}`;
  const backupDir = path.join(BACKUPS_DIR, id);
  fs.mkdirSync(backupDir, { recursive: true });

  const dataDir = path.join(process.cwd(), "data");
  const filesToBackup = ["ashenai.db", "provider-health.json", "mod-cases.json", "tickets.json", "xp-data.json", "knowledge-data.json", "game-players.json", "warnings.json"];

  const backedUp: string[] = [];
  for (const file of filesToBackup) {
    const src = path.join(dataDir, file);
    if (fs.existsSync(src)) {
      const dest = path.join(backupDir, file);
      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      } else {
        fs.copyFileSync(src, dest);
      }
      backedUp.push(file);
    }
  }

  const entry: BackupEntry = { id, timestamp: Date.now(), type, description, files: backedUp };
  const index = getBackupIndex();
  index.push(entry);
  if (index.length > 50) index.splice(0, index.length - 50);
  saveBackupIndex(index);

  logger.info(`💾 Backup created: ${id} (${backedUp.length} files)`);
  return entry;
}

export function restoreBackup(id: string): { success: boolean; message: string } {
  const backupDir = path.join(BACKUPS_DIR, id);
  if (!fs.existsSync(backupDir)) return { success: false, message: "Backup not found" };

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    const files = fs.readdirSync(backupDir);
    for (const file of files) {
      const src = path.join(backupDir, file);
      const dest = path.join(dataDir, file);
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
  const backupDir = path.join(BACKUPS_DIR, id);
  if (!fs.existsSync(backupDir)) return false;
  fs.rmSync(backupDir, { recursive: true, force: true });
  const index = getBackupIndex().filter((b) => b.id !== id);
  saveBackupIndex(index);
  return true;
}

export function autoBackup(): void {
  const index = getBackupIndex();
  const lastAuto = index.filter((b) => b.type === "auto").sort((a, b) => b.timestamp - a.timestamp)[0];
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  if (!lastAuto || lastAuto.timestamp < sixHoursAgo) {
    createBackup("Auto backup", "auto");
  }
}
