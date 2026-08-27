import fs from "fs";
import path from "path";
import { logger } from "../logger";
import { redact } from "./redact";

export interface AuditEntry {
  id: string;
  timestamp: number;
  who: string;
  whoName?: string;
  what: string;
  where: string;
  guildId?: string;
  reason?: string;
  result: "success" | "failure" | "denied" | "error";
  details?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const AUDIT_FILE = path.join(DATA_DIR, "audit-log.json");
const MAX_ENTRIES = 5000;

let auditLog: AuditEntry[] = [];

function loadAudit(): void {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return;
    const raw = fs.readFileSync(AUDIT_FILE, "utf8");
    auditLog = JSON.parse(raw) as AuditEntry[];
  } catch {
    auditLog = [];
  }
}

function saveAudit(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (auditLog.length > MAX_ENTRIES) {
      auditLog = auditLog.slice(-MAX_ENTRIES);
    }
    const tmpPath = AUDIT_FILE + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(auditLog, null, 2), "utf8");
    fs.renameSync(tmpPath, AUDIT_FILE);
  } catch (error) {
    logger.warn(`⚠️ Could not save audit log: ${error instanceof Error ? error.message : String(error)}`);
  }
}

loadAudit();

export function recordAudit(entry: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
  const full: AuditEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now(),
    ...entry,
    details: entry.details ? String(redact(entry.details)) : undefined,
  };

  auditLog.push(full);
  saveAudit();

  logger.info(`📋 AUDIT: [${full.result}] ${full.what} by ${full.who} in ${full.where}`);

  return full;
}

export function getAuditLog(options: {
  guildId?: string;
  who?: string;
  limit?: number;
  since?: number;
} = {}): AuditEntry[] {
  let entries = auditLog;

  if (options.guildId) {
    entries = entries.filter((e) => e.guildId === options.guildId);
  }

  if (options.who) {
    entries = entries.filter((e) => e.who === options.who);
  }

  if (options.since) {
    const since = options.since;
    entries = entries.filter((e) => e.timestamp >= since);
  }

  const limit = options.limit || 100;
  return entries.slice(-limit);
}
