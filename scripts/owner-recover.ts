#!/usr/bin/env node
/**
 * AshenAI Owner Account Recovery CLI
 *
 * Server-side only recovery tool for when the owner is locked out.
 * This script must be run directly on the host/server — it is NOT
 * accessible via HTTP, Discord, or any remote interface.
 *
 * Usage:
 *   npx tsx scripts/owner-recover.ts
 *   npm run auth:owner-recover
 *
 * What it does:
 *   1. Finds the configured owner account
 *   2. Allows setting a new password (interactive terminal input)
 *   3. Optionally resets MFA if owner has lost access
 *   4. Preserves owner role and OAuth identities
 *   5. Destroys all existing sessions
 *   6. Invalidates outstanding password-reset tokens
 *   7. Creates an audit event (no secrets logged)
 */

import crypto from "crypto";
import readline from "readline";
import path from "path";
import fs from "fs";

// ---- Direct imports to avoid pulling in the full server ----
const DATA_DIR = path.join(process.cwd(), "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const RESET_TOKENS_FILE = path.join(DATA_DIR, "password-reset-tokens.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit-log.json");
const IDENTITIES_FILE = path.join(DATA_DIR, "linked-identities.json");

const ITERATIONS = 100_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

// ============================================================
// UTILITIES
// ============================================================

function loadJsonArray(filePath: string): any[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJsonArray(filePath: string, data: any[]): void {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || crypto.randomBytes(32).toString("hex");
  const hash = crypto.pbkdf2Sync(password, useSalt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return { hash, salt: useSalt };
}

function promptPassword(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    let password = "";
    const onData = (chunk: Buffer) => {
      const str = chunk.toString();
      for (const ch of str) {
        if (ch === "\n" || ch === "\r") {
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(password);
          return;
        }
        if (ch === "\u007F" || ch === "\b") {
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (ch === "\u0003") {
          // Ctrl+C
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          stdin.removeListener("data", onData);
          process.stdout.write("\nAborted.\n");
          process.exit(1);
        } else {
          password += ch;
          process.stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

function promptConfirm(rl: readline.Interface, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase() === "yes" || answer.trim().toLowerCase() === "y");
    });
  });
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("");
  console.log("=".repeat(60));
  console.log("  AshenAI Owner Account Recovery");
  console.log("  This tool requires direct host/server access.");
  console.log("=".repeat(60));
  console.log("");

  // ---- Load accounts ----
  const accounts: any[] = loadJsonArray(ACCOUNTS_FILE);
  const ownerAccounts = accounts.filter(
    (a) => a && a.role === "owner" && typeof a.id === "string",
  );

  if (ownerAccounts.length === 0) {
    console.log("❌ No owner account found in data/accounts.json");
    console.log("   If this is a fresh install, set ASHENAI_OWNER_USERNAME,");
    console.log("   ASHENAI_OWNER_PASSWORD_HASH, and ASHENAI_OWNER_PASSWORD_SALT");
    console.log("   in your .env file, then start AshenAI to create the owner.");
    process.exit(1);
  }

  console.log("Found owner account(s):");
  for (const a of ownerAccounts) {
    console.log(`  - ${a.username} (id: ${a.id}, enabled: ${a.enabled})`);
  }
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // ---- Select account if multiple owners ----
  let targetAccount = ownerAccounts[0];
  if (ownerAccounts.length > 1) {
    const idx = parseInt(
      await new Promise<string>((resolve) => {
        rl.question(`Select owner account [0-${ownerAccounts.length - 1}] (default 0): `, resolve);
      }),
      10,
    );
    if (!isNaN(idx) && idx >= 0 && idx < ownerAccounts.length) {
      targetAccount = ownerAccounts[idx];
    }
  }

  console.log(`\nSelected: ${targetAccount.username} (${targetAccount.id})`);
  console.log("");

  // ---- Confirm recovery ----
  const confirmed = await promptConfirm(
    rl,
    "⚠️  This will reset the owner account password and destroy all sessions.\n" +
    "    OAuth identities will be preserved. MFA state may be reset.\n\n" +
    "    Type YES to confirm: ",
  );

  if (!confirmed) {
    console.log("Recovery cancelled.");
    process.exit(0);
  }

  // ---- Get new password ----
  console.log("");
  const newPassword = await promptPassword(rl, "Enter new password (min 8 chars): ");

  if (!newPassword || newPassword.length < 8) {
    console.log("❌ Password must be at least 8 characters. Recovery aborted.");
    process.exit(1);
  }

  const confirmPassword = await promptPassword(rl, "Confirm new password: ");
  if (newPassword !== confirmPassword) {
    console.log("❌ Passwords do not match. Recovery aborted.");
    process.exit(1);
  }

  // ---- Handle MFA ----
  let resetMfa = false;
  if (targetAccount.mfaEnabled) {
    console.log("");
    console.log("This account has MFA enabled.");
    const resetMfaChoice = await promptConfirm(
      rl,
      "Do you need to reset MFA? (you lost access to authenticator/recovery codes)\n" +
      "Type YES to reset MFA, or NO to keep current MFA settings: ",
    );
    resetMfa = resetMfaChoice;
  }

  // ---- Apply changes ----
  console.log("\nApplying recovery...");

  // 1. Change password
  const { hash, salt } = hashPassword(newPassword);
  targetAccount.passwordHash = hash;
  targetAccount.passwordSalt = salt;
  targetAccount.updatedAt = Date.now();

  // 2. Handle MFA reset
  if (resetMfa) {
    targetAccount.mfaEnabled = false;
    targetAccount.mfaSecret = undefined;
    targetAccount.recoveryCodesHash = undefined;
    console.log("  ✓ MFA reset (secret and recovery codes cleared)");
  }

  // 3. Save accounts
  saveJsonArray(ACCOUNTS_FILE, accounts);
  console.log("  ✓ Password changed");

  // 4. Destroy all sessions for this account
  const sessions: any[] = loadJsonArray(SESSIONS_FILE);
  const beforeCount = sessions.length;
  const afterSessions = sessions.filter((s: any) => s.accountId !== targetAccount.id);
  saveJsonArray(SESSIONS_FILE, afterSessions);
  const destroyed = beforeCount - afterSessions.length;
  console.log(`  ✓ Destroyed ${destroyed} session(s)`);

  // 5. Invalidate all password-reset tokens for this account
  const tokens: any[] = loadJsonArray(RESET_TOKENS_FILE);
  const beforeTokens = tokens.length;
  const afterTokens = tokens.filter((t: any) => t.accountId !== targetAccount.id);
  saveJsonArray(RESET_TOKENS_FILE, afterTokens);
  const tokensInvalidated = beforeTokens - afterTokens.length;
  console.log(`  ✓ Invalidated ${tokensInvalidated} reset token(s)`);

  // 6. Preserve OAuth identities (no changes needed)
  const identities: any[] = loadJsonArray(IDENTITIES_FILE);
  const accountIds = identities.filter((i: any) => i.accountId === targetAccount.id);
  if (accountIds.length > 0) {
    console.log(`  ✓ Preserved ${accountIds.length} linked OAuth identity(ies)`);
  }

  // 7. Create audit event
  const auditEntry = {
    who: targetAccount.username,
    what: "OWNER_ACCOUNT_RECOVERY",
    where: "owner-recover-cli",
    result: "success" as const,
    details: `Password reset via server-side CLI. MFA reset: ${resetMfa}. Sessions destroyed: ${destroyed}.`,
  };

  const auditLog: any[] = loadJsonArray(AUDIT_FILE);
  const prevHash = auditLog.length > 0 ? auditLog[auditLog.length - 1].signature || "" : "";
  const entry = {
    id: crypto.randomBytes(16).toString("hex"),
    timestamp: Date.now(),
    ...auditEntry,
    signature: crypto.createHash("sha256")
      .update(JSON.stringify({ ...auditEntry, prevHash }))
      .digest("hex"),
    prevHash,
  };
  auditLog.push(entry);
  saveJsonArray(AUDIT_FILE, auditLog);
  console.log("  ✓ Audit event created: OWNER_ACCOUNT_RECOVERY");

  console.log("\n" + "=".repeat(60));
  console.log("  Recovery complete.");
  console.log("  You can now log in with the new password.");
  console.log("  All previous sessions have been terminated.");
  if (resetMfa) {
    console.log("  MFA has been reset. You can re-enable it after login.");
  }
  console.log("=".repeat(60));

  rl.close();
}

main().catch((err) => {
  console.error("Recovery failed:", err);
  process.exit(1);
});
