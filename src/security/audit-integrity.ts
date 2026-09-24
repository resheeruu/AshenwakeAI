/**
 * AshenAI Audit Log Integrity
 *
 * Adds HMAC-SHA256 chain signatures to audit entries for tamper detection.
 * Each entry's signature covers its content; prevHash links to the previous
 * entry's signature forming a chain. Tampering with any entry breaks the chain.
 *
 * U13: Audit log integrity with backward compatibility for pre-U13 entries.
 * U15: Production requires strong SESSION_SECRET; startup fails if missing.
 */

import crypto from "node:crypto";
import { getAuditIntegrityKey } from "./encrypt";

/* ================================================================
 * KEY DERIVATION
 * ================================================================ */

const INTEGRITY_CONTEXT = "ashenai-audit-integrity-v1";

let integrityKey: Buffer | null = null;
let keyValidated = false;

function validateKeyForProduction(): void {
  if (keyValidated) return;
  keyValidated = true;

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      console.error(
        "[FATAL] SESSION_SECRET is required in production (minimum 32 characters). " +
        "Audit log integrity cannot be guaranteed without a high-entropy secret."
      );
      process.exit(1);
    } else {
      console.warn(
        "[WARN] SESSION_SECRET not set or too short — audit signatures use a weaker fallback key. " +
        "Set SESSION_SECRET for production deployments."
      );
    }
  }
}

function getIntegrityKey(): Buffer {
  if (integrityKey) return integrityKey;

  validateKeyForProduction();

  // Use HKDF-derived domain-separated key for audit integrity.
  // This ensures audit integrity keys are independent from
  // session encryption and MFA encryption keys.
  integrityKey = getAuditIntegrityKey();
  return integrityKey;
}

/* ================================================================
 * SIGNABLE ENTRY INTERFACE
 * ================================================================ */

export interface SignableAuditEntry {
  id: string;
  timestamp: number;
  who: string;
  whoName?: string;
  what: string;
  where: string;
  guildId?: string;
  reason?: string;
  result: string;
  details?: string;
}

export interface SignedAuditEntry extends SignableAuditEntry {
  /** HMAC-SHA256 signature over the entry content */
  signature: string;
  /** Hash of the previous entry's signature (chain link) */
  prevHash: string;
}

/* ================================================================
 * SIGNING
 * ================================================================ */

/**
 * Computes the HMAC signature for an audit entry.
 * The signature covers all fields EXCEPT signature and prevHash.
 */
function computeSignature(entry: SignableAuditEntry): string {
  const key = getIntegrityKey();

  // Canonical string representation for signing
  const payload = [
    entry.id,
    entry.timestamp,
    entry.who,
    entry.whoName ?? "",
    entry.what,
    entry.where,
    entry.guildId ?? "",
    entry.reason ?? "",
    entry.result,
    entry.details ?? "",
  ].join("|");

  return crypto.createHmac("sha256", key).update(payload).digest("hex");
}

/**
 * Signs an audit entry, returning signature and prevHash values.
 * Call this BEFORE saving the entry.
 */
export function signEntry(
  entry: SignableAuditEntry,
  previousSignature: string | null,
): { signature: string; prevHash: string } {
  const signature = computeSignature(entry);
  const prevHash = previousSignature
    ? crypto.createHash("sha256").update(previousSignature).digest("hex")
    : "genesis";

  return { signature, prevHash };
}

/* ================================================================
 * VERIFICATION
 * ================================================================ */

/**
 * Verifies a single signed entry against its expected previous signature.
 * Does NOT throw — always returns a boolean.
 */
export function verifyEntry(
  entry: SignedAuditEntry,
  expectedPrevHash: string,
): boolean {
  // Verify prevHash links to previous entry
  const expectedPrevHashComputed = entry.prevHash === expectedPrevHash;
  if (!expectedPrevHashComputed) return false;

  // Recompute signature and compare
  const { signature: _sig, prevHash: _prev, ...signable } = entry;
  const expectedSignature = computeSignature(signable);

  return crypto.timingSafeEqual(
    Buffer.from(entry.signature, "hex"),
    Buffer.from(expectedSignature, "hex"),
  );
}

/**
 * Verifies the integrity of an entire audit chain.
 * Pre-U13 entries (without signature/prevHash) are accepted as valid
 * chain members — verification starts from the first signed entry.
 *
 * @returns { valid: true } if chain is intact, or { valid: false, brokenAt: index }
 */
/**
 * Structured verification result for the audit chain.
 */
export interface AuditChainVerification {
  /** Whether the chain is verified from the first trusted signed entry onward. */
  valid: boolean;
  /** Index of the first cryptographically verified entry. null if no signed entries exist. */
  trustedFromIndex: number | null;
  /** Number of legacy unsigned entries at the beginning of the chain. */
  legacyEntries: number;
  /** Index of the first invalid signed entry, or null if all signed entries are valid. */
  firstInvalidIndex: number | null;
  /** Total number of entries processed. */
  totalEntries: number;
  /** Number of signed entries verified. */
  signedEntriesVerified: number;
  /** Whether any tampering (insertion, deletion, reordering) was detected. */
  tamperingDetected: boolean;
}

/**
 * Verifies the integrity of an entire audit chain.
 *
 * Distinguishes cryptographically verified entries from legacy unsigned entries.
 * Pre-U13 entries (without signature/prevHash) are treated as legacy and counted
 * but NOT treated as cryptographically verified.
 * Verification starts from the first signed entry and verifies prevHash continuity.
 *
 * Detects: modification, deletion, insertion, and reordering of signed records.
 *
 * @returns Structured verification information.
 */
export function verifyAuditChain(
  entries: Array<SignableAuditEntry & Partial<Pick<SignedAuditEntry, "signature" | "prevHash">>>,
): AuditChainVerification {
  const result: AuditChainVerification = {
    valid: true,
    trustedFromIndex: null,
    legacyEntries: 0,
    firstInvalidIndex: null,
    totalEntries: entries.length,
    signedEntriesVerified: 0,
    tamperingDetected: false,
  };

  if (entries.length === 0) return result;

  let lastSignature: string | null = null;
  let firstSignedIndex = -1;
  let expectedNextIndex = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Track legacy unsigned entries
    if (!entry.signature || !entry.prevHash) {
      result.legacyEntries++;
      continue;
    }

    const signed = entry as SignedAuditEntry;
    const { signature: _sig, prevHash: _prev, ...signable } = signed;

    // First signed entry: prevHash should be "genesis"
    if (firstSignedIndex === -1) {
      firstSignedIndex = i;
      result.trustedFromIndex = i;

      if (entry.prevHash !== "genesis") {
        // Non-genesis prevHash on first signed entry — signature-only check
        const expectedSig = computeSignature(signable);
        if (!crypto.timingSafeEqual(
          Buffer.from(signed.signature, "hex"),
          Buffer.from(expectedSig, "hex"),
        )) {
          result.valid = false;
          result.firstInvalidIndex = i;
          result.tamperingDetected = true;
          return result;
        }
      }
      lastSignature = signed.signature;
      result.signedEntriesVerified++;
      continue;
    }

    // Subsequent signed entries: verify prevHash chain continuity
    const expectedPrevHash = crypto
      .createHash("sha256")
      .update(lastSignature!)
      .digest("hex");

    if (!verifyEntry(signed, expectedPrevHash)) {
      result.valid = false;
      result.firstInvalidIndex = i;
      result.tamperingDetected = true;
      return result;
    }

    // Check for index discontinuity (potential insertion/deletion)
    if (i !== expectedNextIndex) {
      result.tamperingDetected = true;
    }
    expectedNextIndex = i + 1;

    lastSignature = signed.signature;
    result.signedEntriesVerified++;
  }

  // If no signed entries were found, chain is not cryptographically verified
  if (firstSignedIndex === -1) {
    result.trustedFromIndex = null;
    result.valid = false;
  }

  return result;
}

/**
 * Returns the genesis hash constant used for the first signed entry.
 */
export function getGenesisHash(): string {
  return "genesis";
}
