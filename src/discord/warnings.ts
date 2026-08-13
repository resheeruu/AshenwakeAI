import fs from "node:fs";
import path from "node:path";

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

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWarnings(warnings: WarningRecord[]): void {
  ensureStorage();

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(warnings, null, 2),
    "utf8"
  );
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
