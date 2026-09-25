import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";

export interface WarningRecord {
  id: string;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "warnings.json");

function ensureStorage(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
  }
}

function readWarnings(): WarningRecord[] {
  ensureStorage();

  let raw: string;
  try {
    raw = fs.readFileSync(DATA_FILE, "utf8");
  } catch (error) {
    // Read failure (permissions/IO): fail the operation loudly instead of
    // returning an empty store that a subsequent write would persist.
    throw new Error(
      `Failed to read ${path.basename(DATA_FILE)}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }

  if (!Array.isArray(parsed)) {
    // Corrupt content: quarantine the file so the only copy is preserved,
    // then start from an empty store. Never overwrite it in place.
    const quarantine = `${DATA_FILE}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(DATA_FILE, quarantine);
      logger.error(
        `${path.basename(DATA_FILE)} is corrupt — moved to ${path.basename(quarantine)} and starting from an empty warning store`
      );
    } catch (renameError) {
      logger.error(
        `${path.basename(DATA_FILE)} is corrupt and could not be quarantined: ${renameError instanceof Error ? renameError.message : String(renameError)}`
      );
    }
    return [];
  }

  return parsed as WarningRecord[];
}

function writeWarnings(warnings: WarningRecord[]): void {
  ensureStorage();

  // Atomic write: a crash mid-write must never truncate the store.
  const tmp = `${DATA_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(warnings, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

export function addWarning(
  guildId: string,
  userId: string,
  moderatorId: string,
  reason: string
): WarningRecord {
  const warnings = readWarnings();

  const warning: WarningRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    guildId,
    userId,
    moderatorId,
    reason,
    createdAt: new Date().toISOString(),
  };

  warnings.push(warning);
  writeWarnings(warnings);

  return warning;
}

export function getWarnings(
  guildId: string,
  userId: string
): WarningRecord[] {
  return readWarnings().filter(
    (warning) =>
      warning.guildId === guildId &&
      warning.userId === userId
  );
}
