import fs from "fs";
import path from "path";
import { logger } from "../../logger";
import { redact } from "../../security/redact";
import type {
  ToolContext,
  ToolResultStatus,
  DenialReason,
  ToolAuditEntry,
} from "./types";

/* ================================================================
 * TOOL AUDIT LOG
 *
 * Records safe metadata for every AI tool action.
 * Does NOT record: passwords, tokens, API keys, .env values,
 * private credentials, raw AI secrets, or full user messages.
 * ================================================================ */

const DATA_DIR = path.join(process.cwd(), "data");
const AUDIT_FILE = path.join(DATA_DIR, "tool-audit.json");
const MAX_ENTRIES = 5000;

let auditLog: ToolAuditEntry[] = [];

function loadAudit(): void {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return;
    const raw = fs.readFileSync(AUDIT_FILE, "utf8");
    auditLog = JSON.parse(raw) as ToolAuditEntry[];
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
    logger.warn(
      `Could not save tool audit log: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

loadAudit();

export function recordToolAudit(
  context: ToolContext,
  result: ToolResultStatus,
  denialReason: DenialReason | undefined,
  startTime: number,
  dryRun: boolean,
): ToolAuditEntry {
  const entry: ToolAuditEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now(),
    guildId: context.guildId,
    channelId: context.channelId,
    requesterId: context.requesterId,
    requesterName: String(redact(context.requesterName)),
    toolName: context.arguments._toolName as string || "unknown",
    riskLevel: "low",
    result,
    denialReason,
    durationMs: Date.now() - startTime,
    dryRun,
  };

  auditLog.push(entry);
  saveAudit();

  return entry;
}

export function getToolAuditLog(options: {
  guildId?: string;
  requesterId?: string;
  toolName?: string;
  limit?: number;
  since?: number;
} = {}): ToolAuditEntry[] {
  let entries = auditLog;

  if (options.guildId) {
    entries = entries.filter((e) => e.guildId === options.guildId);
  }
  if (options.requesterId) {
    entries = entries.filter((e) => e.requesterId === options.requesterId);
  }
  if (options.toolName) {
    entries = entries.filter((e) => e.toolName === options.toolName);
  }
  if (options.since) {
    const since = options.since;
    entries = entries.filter((e) => e.timestamp >= since);
  }

  const limit = options.limit || 100;
  return entries.slice(-limit);
}
