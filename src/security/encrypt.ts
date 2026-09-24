import crypto from "node:crypto";
import { logger } from "../logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_HASH_CONTEXT = "ashenai-encryption-v1";

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
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
    cachedKey = crypto.randomBytes(32);
    return cachedKey;
  }

  cachedKey = crypto.createHash("sha256").update(secret).update(KEY_HASH_CONTEXT).digest();
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString("base64");
}

export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
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

export function isEncryptionAvailable(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
