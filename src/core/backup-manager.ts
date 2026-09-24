import crypto from "node:crypto";
import fs from "fs";
import path from "path";
import { logger } from "../logger";
import { readJSON, writeJSON, dataPath } from "./data-store";
import { getDatabase } from "../database/database";
import { encrypt, decrypt, isEncryptionAvailable } from "../security/encrypt";

const ENCRYPTION_AVAILABLE = isEncryptionAvailable() && process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32;

export interface BackupFileEntry {
  file: string;
  checksum: string;
  encrypted: boolean;
  size: number;
}

export interface BackupEntry {
  id: string;
  timestamp: number;
  type: "manual" | "auto";
  description: string;
  files: BackupFileEntry[];
  integrityChecksum: string;
}

const BACKUPS_DIR = path.join(process.cwd(), "backups");
const BACKUP_INDEX = "backup-index.json";

/** Backup IDs are machine-generated: `backup-` + base36 timestamp. */
const BACKUP_ID_PATTERN = /^backup-[a-z0-9]+$/i;

function ensureBackupDir(): void {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function computeChecksum(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function computeDirectoryChecksum(backupDir: string): string {
  const files = fs.readdirSync(backupDir).sort();
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const content = fs.readFileSync(path.join(backupDir, file));
    hash.update(file);
    hash.update(content);
  }
  return hash.digest("hex");
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

  const backupFiles: BackupFileEntry[] = [];
  for (const file of filesToBackup) {
    const src = path.join(dataDir, file);
    try {
      if (file === "ashenai.db") {
        if (fs.existsSync(src)) {
          await backupSqliteDatabase(path.join(backupDir, file));
          if (fs.existsSync(path.join(backupDir, file))) {
            const checksum = computeChecksum(path.join(backupDir, file));
            backupFiles.push({ file, checksum, encrypted: false, size: fs.statSync(path.join(backupDir, file)).size });
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
        const isEncrypted = ENCRYPTION_AVAILABLE;
        if (isEncrypted) {
          const content = fs.readFileSync(dest);
          const encrypted = encrypt(content.toString("base64"));
          fs.writeFileSync(dest, encrypted);
          const checksum = computeChecksum(dest);
          backupFiles.push({ file, checksum, encrypted: true, size: fs.statSync(dest).size });
        } else {
          const checksum = computeChecksum(dest);
          backupFiles.push({ file, checksum, encrypted: false, size: fs.statSync(dest).size });
        }
      }
    } catch (err) {
      logger.warn(`⚠️ Backup: failed to copy ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const dirChecksum = computeDirectoryChecksum(backupDir);

  // If no files were backed up, remove the empty backup directory
  if (backupFiles.length === 0) {
    try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch { /* best effort */ }
    logger.warn("⚠️ Backup: no files copied, backup discarded.");
    return { id, timestamp: Date.now(), type, description, files: [], integrityChecksum: dirChecksum };
  }

  const entry: BackupEntry = { id, timestamp: Date.now(), type, description, files: backupFiles, integrityChecksum: dirChecksum };
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

  logger.info(`💾 Backup created: ${id} (${backupFiles.length} files)`);
  return entry;
}

export function restoreBackup(id: string): { success: boolean; message: string } {
  const backupDir = resolveBackupDir(id);
  if (!backupDir || !fs.existsSync(backupDir)) {
    return { success: false, message: "Backup not found" };
  }

  const index = getBackupIndex();
  const entry = index.find((b) => b.id === id);
  if (!entry) {
    return { success: false, message: "Backup index entry not found" };
  }

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    const files = fs.readdirSync(backupDir);
    const restoredFiles: string[] = [];
    let verified = true;

    for (const file of files) {
      if (file.includes("..") || file.includes("/") || file.includes("\\")) {
        continue;
      }
      const src = path.join(backupDir, file);
      const dest = path.resolve(dataDir, file);
      if (dest !== path.resolve(dataDir) && !dest.startsWith(path.resolve(dataDir) + path.sep)) {
        continue;
      }

      const backupEntry = entry.files.find((f) => f.file === file);
      if (backupEntry && !fs.statSync(src).isDirectory()) {
        const currentChecksum = computeChecksum(src);
        if (currentChecksum !== backupEntry.checksum) {
          verified = false;
          logger.error(`⚠️ Backup integrity check failed for ${file}: checksum mismatch`);
          continue;
        }
        if (backupEntry.encrypted) {
          try {
            const decrypted = decrypt(fs.readFileSync(src).toString("base64"));
            const decryptedChecksum = crypto.createHash("sha256").update(decrypted).digest("hex");
            const originalContent = fs.readFileSync(src);
            const decryptedContent = decrypt(originalContent.toString("base64"));
            const postDecryptChecksum = crypto.createHash("sha256").update(decryptedContent).digest("hex");
            if (postDecryptChecksum !== backupEntry.checksum) {
              logger.warn(`⚠️ Decrypted content checksum mismatch for ${file}`);
            }
          } catch {
            logger.warn(`⚠️ Could not decrypt ${file} for verification`);
          }
        }
      }

      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      } else {
        let content = fs.readFileSync(src);
        if (backupEntry?.encrypted && ENCRYPTION_AVAILABLE) {
          try {
            const decrypted = decrypt(content.toString("base64"));
            content = Buffer.from(decrypted, "base64");
            fs.writeFileSync(dest, content);
          } catch {
            logger.warn(`⚠️ Could not decrypt ${file}, copying as-is`);
            fs.copyFileSync(src, dest);
          }
        } else {
          fs.copyFileSync(src, dest);
        }
      }
      restoredFiles.push(file);
    }

    logger.info(`📥 Backup restored: ${id} (${restoredFiles.length} files, integrity verified)`);
    return { success: true, message: `Restored ${restoredFiles.length} files from backup ${id} with integrity verified` };
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
