import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "../logger";

const DATA_DIR = path.join(process.cwd(), "data");
const IDENTITIES_FILE = path.join(DATA_DIR, "linked-identities.json");

export type IdentityProvider = "discord" | "google";

export interface LinkedIdentity {
  id: string;
  accountId: string;
  provider: IdentityProvider;
  providerUserId: string;
  providerEmail?: string;
  displayName?: string;
  createdAt: number;
  lastUsedAt?: number;
}

let identities: LinkedIdentity[] = [];

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadIdentities(): void {
  try {
    if (!fs.existsSync(IDENTITIES_FILE)) {
      identities = [];
      return;
    }
    const raw = fs.readFileSync(IDENTITIES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      identities = [];
      return;
    }
    identities = parsed.filter(
      (i: any) =>
        i &&
        typeof i.id === "string" &&
        typeof i.accountId === "string" &&
        typeof i.provider === "string" &&
        typeof i.providerUserId === "string" &&
        ["discord", "google"].includes(i.provider),
    );
  } catch {
    identities = [];
  }
}

function saveIdentities(): void {
  try {
    ensureDataDir();
    const tmpPath = IDENTITIES_FILE + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(identities, null, 2), "utf8");
    fs.renameSync(tmpPath, IDENTITIES_FILE);
  } catch (error) {
    logger.warn(
      `⚠️ Could not save linked identities: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

loadIdentities();

export function linkIdentity(params: {
  accountId: string;
  provider: IdentityProvider;
  providerUserId: string;
  providerEmail?: string;
  displayName?: string;
}): LinkedIdentity {
  const existing = identities.find(
    (i) =>
      i.provider === params.provider &&
      i.providerUserId === params.providerUserId,
  );

  if (existing) {
    existing.accountId = params.accountId;
    existing.providerEmail = params.providerEmail || existing.providerEmail;
    existing.displayName = params.displayName || existing.displayName;
    existing.lastUsedAt = Date.now();
    saveIdentities();
    return existing;
  }

  const identity: LinkedIdentity = {
    id: crypto.randomBytes(16).toString("hex"),
    accountId: params.accountId,
    provider: params.provider,
    providerUserId: params.providerUserId,
    providerEmail: params.providerEmail,
    displayName: params.displayName,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };

  identities.push(identity);
  saveIdentities();
  return identity;
}

export function unlinkIdentity(identityId: string): boolean {
  const idx = identities.findIndex((i) => i.id === identityId);
  if (idx === -1) return false;
  identities.splice(idx, 1);
  saveIdentities();
  return true;
}

export function findIdentityByProvider(
  provider: IdentityProvider,
  providerUserId: string,
): LinkedIdentity | undefined {
  return identities.find(
    (i) => i.provider === provider && i.providerUserId === providerUserId,
  );
}

export function getAccountIdentities(accountId: string): LinkedIdentity[] {
  return identities.filter((i) => i.accountId === accountId);
}

export function getAccountsForIdentity(
  provider: IdentityProvider,
  providerUserId: string,
): LinkedIdentity[] {
  return identities.filter(
    (i) => i.provider === provider && i.providerUserId === providerUserId,
  );
}

export function unlinkProviderFromAccount(
  accountId: string,
  provider: IdentityProvider,
): boolean {
  const idx = identities.findIndex(
    (i) => i.accountId === accountId && i.provider === provider,
  );
  if (idx === -1) return false;
  identities.splice(idx, 1);
  saveIdentities();
  return true;
}

export function hasProviderLinked(
  accountId: string,
  provider: IdentityProvider,
): boolean {
  return identities.some(
    (i) => i.accountId === accountId && i.provider === provider,
  );
}

export function reloadIdentities(): void {
  loadIdentities();
}
