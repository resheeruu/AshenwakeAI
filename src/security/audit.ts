import { logger } from "../logger";
import { redact } from "./redact";
import {
  signEntry,
  verifyAuditChain,
  type SignedAuditEntry,
  type SignableAuditEntry,
} from "./audit-integrity";
import { insertAuditEntryDB, getAuditLogDB } from "../database";

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
  /** U13: HMAC-SHA256 signature over entry content */
  signature?: string;
  /** U13: Hash of previous entry's signature (chain link) */
  prevHash?: string;
}

let lastSignature: string | null = null;

export function recordAudit(entry: Omit<AuditEntry, "id" | "timestamp" | "signature" | "prevHash">): AuditEntry {
  const full: AuditEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now(),
    ...entry,
    details: entry.details ? String(redact(entry.details)) : undefined,
  };

  // U13: Sign the entry for integrity
  const { signature, prevHash } = signEntry(full as SignableAuditEntry, lastSignature);
  full.signature = signature;
  full.prevHash = prevHash;
  lastSignature = signature;

  insertAuditEntryDB(full);

  logger.info(`📋 AUDIT: [${full.result}] ${full.what} by ${full.who} in ${full.where}`);

  return full;
}

export function getAuditLog(options: {
  guildId?: string;
  who?: string;
  limit?: number;
  since?: number;
  /** U13: If true, verify chain integrity before returning */
  verifyIntegrity?: boolean;
} = {}): AuditEntry[] {
  const entries = getAuditLogDB(options);

  // U13: Non-blocking chain verification
  if (options.verifyIntegrity && entries.length > 0) {
    const chainResult = verifyAuditChain(entries);
    if (!chainResult.valid) {
      logger.warn(
        `⚠️ Audit log integrity check failed at entry index ${chainResult.brokenAt}. ` +
        `Entries may have been modified.`,
      );
    }
  }

  return entries;
}
