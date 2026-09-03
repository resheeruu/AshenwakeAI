import { nanoid } from "nanoid";
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
let signatureLoaded = false;

/**
 * Load the last audit signature from the database to maintain chain continuity across restarts.
 */
function ensureSignatureLoaded(): void {
  if (signatureLoaded) return;
  signatureLoaded = true;

  try {
    // Get the most recent audit entry's signature to continue the chain
    const recentEntries = getAuditLogDB({ limit: 1 });
    if (recentEntries.length > 0 && recentEntries[0].signature) {
      lastSignature = recentEntries[0].signature;
      logger.debug("🔐 Audit chain loaded from database");
    }
  } catch {
    // If we can't load, start a new chain (chain will break at this point)
    logger.warn("⚠️ Could not load audit chain from database — starting new chain");
  }
}

export function recordAudit(entry: Omit<AuditEntry, "id" | "timestamp" | "signature" | "prevHash">): AuditEntry {
  ensureSignatureLoaded();

  const full: AuditEntry = {
    id: nanoid(12),
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
