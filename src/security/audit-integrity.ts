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
  if (!secret || secret.length < 16) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      console.error(
        "[FATAL] SESSION_SECRET is required in production (minimum 16 characters). " +
        "Audit log integrity cannot be guaranteed without a strong secret."
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

  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) {
    integrityKey = crypto
      .createHmac("sha256", secret)
      .update(INTEGRITY_CONTEXT)
      .digest();
  } else {
    // Fallback: use a random key generated at startup.
    // This provides per-process tamper detection but does NOT
    // survive restarts (entries signed before restart cannot be verified).
    console.warn(
      "[WARN] Audit integrity using ephemeral fallback key — signatures are valid only for this process lifetime."
    );
    integrityKey = crypto.randomBytes(32);
  }

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
export function verifyAuditChain(
  entries: Array<SignableAuditEntry & Partial<Pick<SignedAuditEntry, "signature" | "prevHash">>>,
): { valid: boolean; brokenAt?: number } {
  if (entries.length === 0) return { valid: true };

  let lastSignature: string | null = null;
  let firstSignedIndex = -1;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Skip pre-U13 entries (no signature field)
    if (!entry.signature || !entry.prevHash) {
      continue;
    }

    // Track first signed entry for chain start
    if (firstSignedIndex === -1) {
      firstSignedIndex = i;
      // First signed entry: prevHash should be "genesis"
      if (entry.prevHash !== "genesis") {
        // Allow entries that were signed with a non-genesis prevHash
        // if they are the first signed entry — just check signature
        const signed = entry as SignedAuditEntry;
        const { signature: _sig, prevHash: _prev, ...signable } = signed;
        const expectedSig = computeSignature(signable);
        if (!crypto.timingSafeEqual(
          Buffer.from(signed.signature, "hex"),
          Buffer.from(expectedSig, "hex"),
        )) {
          return { valid: false, brokenAt: i };
        }
        lastSignature = signed.signature;
        continue;
      }
    }

    // Verify chain link
    const signed = entry as SignedAuditEntry;
    if (lastSignature !== null) {
      const expectedPrevHash = crypto
        .createHash("sha256")
        .update(lastSignature)
        .digest("hex");

      if (!verifyEntry(signed, expectedPrevHash)) {
        return { valid: false, brokenAt: i };
      }
    } else {
      // First signed entry — just verify signature
      const { signature: _sig, prevHash: _prev, ...signable } = signed;
      const expectedSig = computeSignature(signable);
      if (!crypto.timingSafeEqual(
        Buffer.from(signed.signature, "hex"),
        Buffer.from(expectedSig, "hex"),
      )) {
        return { valid: false, brokenAt: i };
      }
    }

    lastSignature = signed.signature;
  }

  return { valid: true };
}

/**
 * Returns the genesis hash constant used for the first signed entry.
 */
export function getGenesisHash(): string {
  return "genesis";
}
