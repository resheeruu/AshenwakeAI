import crypto from "node:crypto";
import { logger } from "../logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Minimum key length: 32 bytes (256 bits) for cryptographic key material.
// Human passwords below 32 chars must be stretched via PBKDF2.
const MIN_SECRET_LENGTH = 32;

// Domain separation labels for HKDF key derivation.
const KEY_DOMAINS = {
  sessionEncryption: "ashenai-session-encryption-v1",
  mfaEncryption: "ashenai-mfa-encryption-v1",
  auditIntegrity: "ashenai-audit-integrity-v1",
} as const;

let cachedKeys: Record<keyof typeof KEY_DOMAINS, Buffer | null> = {
  sessionEncryption: null,
  mfaEncryption: null,
  auditIntegrity: null,
};

/**
 * Derive a domain-separated cryptographic key from SESSION_SECRET.
 * Uses HKDF-SHA256 (RFC 5869) to ensure independent keys for each purpose.
 * Falls back to PBKDF2 for shorter secrets (non-production only).
 */
function getEncryptionKey(domain: keyof typeof KEY_DOMAINS): Buffer {
  if (cachedKeys[domain]) return cachedKeys[domain];

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      logger.error(
        "[FATAL] SESSION_SECRET is required for encryption in production. Set it in your environment."
      );
      throw new Error(
        "SESSION_SECRET is required for encryption. Set it in your .env file."
      );
    }
    logger.warn(
      "[WARN] SESSION_SECRET not set — using ephemeral encryption key. Data encrypted with this key is not persistent across restarts."
    );
    cachedKeys[domain] = crypto.randomBytes(32);
    return cachedKeys[domain];
  }

  // Validate secret strength: at least 32 bytes for direct use,
  // or stretched via PBKDF2 for shorter secrets (non-production only).
  if (secret.length < MIN_SECRET_LENGTH) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      logger.error(
        "[FATAL] SESSION_SECRET must be at least 32 characters for encryption. A short password is insufficient cryptographic key material."
      );
      throw new Error(
        "SESSION_SECRET must be at least 32 characters. Use a high-entropy secret."
      );
    }
    // Non-production: stretch shorter secret via PBKDF2
    logger.warn(
      "[WARN] SESSION_SECRET is shorter than 32 chars. Using PBKDF2 stretching (non-production only)."
    );
    const stretched = crypto.pbkdf2Sync(secret, "ashenai-key-stretch", 100_000, 32, "sha512");
    cachedKeys[domain] = crypto.createHash("sha256").update(stretched).update(KEY_DOMAINS[domain]).digest();
    return cachedKeys[domain];
  }

  // HKDF-SHA256 key derivation (RFC 5869) for domain-separated keys.
  // Salt is derived from the secret itself to avoid requiring a separate salt.
  const salt = crypto.createHash("sha256").update(secret).digest();
  const info = Buffer.from(KEY_DOMAINS[domain], "utf8");
  const derived = crypto.createHmac("sha256", salt)
    .update(info)
    .digest();
  // Second HMAC extraction step for HKDF "expand" phase
  const okm = crypto.createHmac("sha256", derived)
    .update(Buffer.concat([info, Buffer.alloc(32)]))
    .digest();

  cachedKeys[domain] = okm;
  return cachedKeys[domain];
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey("sessionEncryption");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString("base64");
}

export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey("sessionEncryption");
  const buf = Buffer.from(encryptedBase64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptSessionData(data: Record<string, unknown>): string {
  const plaintext = JSON.stringify(data);
  return encrypt(plaintext);
}

export function decryptSessionData(encryptedBase64: string): Record<string, unknown> {
  const plaintext = decrypt(encryptedBase64);
  return JSON.parse(plaintext);
}

export function encryptMFA(secret: string): string {
  const key = getEncryptionKey("mfaEncryption");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString("base64");
}

export function decryptMFA(encryptedBase64: string): string {
  const key = getEncryptionKey("mfaEncryption");
  const buf = Buffer.from(encryptedBase64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function getAuditIntegrityKey(): Buffer {
  return getEncryptionKey("auditIntegrity");
}

export function isEncryptionAvailable(): boolean {
  try {
    getEncryptionKey("sessionEncryption");
    return true;
  } catch {
    return false;
  }
}

export { KEY_DOMAINS, MIN_SECRET_LENGTH };
export type EncryptionDomain = keyof typeof KEY_DOMAINS;
