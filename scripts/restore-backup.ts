/**
 * Operator restore path (fixes the broken/undocumented restore flow).
 * Usage: npx tsx scripts/restore-backup.ts [backupId]
 *   With no id: lists available backups.
 *   With an id: restores that backup and prints the result.
 */
import { listBackups, restoreBackup, getBackupIndex } from "../src/core/backup-manager";

function printBackups(): void {
  const backups = listBackups();
  if (backups.length === 0) {
    console.log("No backups available.");
    return;
  }
  console.log(`Available backups (${backups.length}):`);
  for (const b of backups) {
    console.log(`  ${b.id}  ${new Date(b.timestamp).toISOString()}  ${b.type}  ${b.files.length} files`);
  }
}

function restore(id: string): void {
  const index = getBackupIndex();
  if (!index.some((b) => b.id === id)) {
    console.error(`Unknown backup id: ${id}`);
    process.exitCode = 2;
    return;
  }
  const result = restoreBackup(id);
  console.log(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
  if (!result.success) process.exitCode = 1;
}

const id = process.argv[2];
if (!id) {
  printBackups();
} else {
  restore(id);
}
