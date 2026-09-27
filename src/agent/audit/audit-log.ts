import fs from "fs";
import path from "path";
import { getDataDir, getDataPath } from "../../config/data-dir";

export type AuditLevel =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "security";

export interface AuditEntry {
  timestamp: string;
  level: AuditLevel;
  event: string;
  details?: string;
}

const LOG_FILE = getDataPath("agent-logs", "agent-audit.jsonl");

function ensureLogDirectory(): void {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

export function audit(
  level: AuditLevel,
  event: string,
  details?: string,
): AuditEntry {
  ensureLogDirectory();

  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(details ? { details } : {}),
  };

  fs.appendFileSync(
    LOG_FILE,
    `${JSON.stringify(entry)}\n`,
    "utf8",
  );

  return entry;
}

export function getAuditLogPath(): string {
  return LOG_FILE;
}

export function readRecentAuditEntries(
  limit = 100,
): AuditEntry[] {
  ensureLogDirectory();

  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  const lines = fs
    .readFileSync(LOG_FILE, "utf8")
    .split("\n")
    .filter(Boolean);

  return lines
    .slice(-Math.max(1, limit))
    .map((line) => {
      try {
        return JSON.parse(line) as AuditEntry;
      } catch {
        return {
          timestamp: new Date().toISOString(),
          level: "error",
          event: "invalid_audit_entry",
          details: line,
        };
      }
    });
}
