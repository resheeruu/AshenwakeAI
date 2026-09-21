import crypto from "node:crypto";
import { getDatabase, safeDbOperation } from "../../../database/database";
import { logger } from "../../../logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getCredentialKey(): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.ASHENAI_CREDENTIAL_KEY;
  if (!secret || secret.length < 16) {
    logger.warn("⚠️ No SESSION_SECRET set; using derived key for credential encryption");
    return crypto.createHash("sha256").update("ashenai-default-credential-key-v1").digest();
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptCredential(plaintext: string): string {
  const key = getCredentialKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString("base64");
}

export function decryptCredential(encryptedBase64: string): string {
  const key = getCredentialKey();
  const buf = Buffer.from(encryptedBase64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function storeCredential(providerId: string, key: string, value: string): void {
  const db = getDatabase();
  const encrypted = encryptCredential(value);
  safeDbOperation(() => {
    db.prepare(`
      INSERT INTO provider_credentials (provider_id, credential_key, credential_value, updated_at)
      VALUES (?, ?, ?, unixepoch() * 1000)
      ON CONFLICT(provider_id, credential_key)
      DO UPDATE SET credential_value = excluded.credential_value, updated_at = excluded.updated_at
    `).run(providerId, key, encrypted);
  }, undefined, `storeCredential:${providerId}`);
}

export function getCredential(providerId: string, key: string): string | undefined {
  const db = getDatabase();
  const row = safeDbOperation(() => {
    return db.prepare(
      "SELECT credential_value FROM provider_credentials WHERE provider_id = ? AND credential_key = ?"
    ).get(providerId, key) as { credential_value: string } | undefined;
  }, undefined, `getCredential:${providerId}`);
  if (!row) return undefined;
  try {
    return decryptCredential(row.credential_value);
  } catch {
    logger.warn(`⚠️ Failed to decrypt credential ${key} for provider ${providerId}`);
    return undefined;
  }
}

export function deleteCredential(providerId: string, key: string): void {
  const db = getDatabase();
  safeDbOperation(() => {
    db.prepare("DELETE FROM provider_credentials WHERE provider_id = ? AND credential_key = ?").run(providerId, key);
  }, undefined, `deleteCredential:${providerId}`);
}

export function deleteAllCredentials(providerId: string): void {
  const db = getDatabase();
  safeDbOperation(() => {
    db.prepare("DELETE FROM provider_credentials WHERE provider_id = ?").run(providerId);
  }, undefined, `deleteAllCredentials:${providerId}`);
}

export function hasCredential(providerId: string, key: string): boolean {
  const db = getDatabase();
  const row = safeDbOperation(() => {
    return db.prepare(
      "SELECT 1 FROM provider_credentials WHERE provider_id = ? AND credential_key = ?"
    ).get(providerId, key);
  }, undefined, `hasCredential:${providerId}`);
  return !!row;
}
