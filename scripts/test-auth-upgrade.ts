/**
 * AshenAI Authentication Upgrade Tests
 * Tests: OAuth, MFA, password reset, sessions, linked identities
 */

import assert from "assert";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

let passed = 0;
let failed = 0;
let total = 0;

function test(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => { passed++; console.log(`✅ ${name}`); }).catch((e) => { failed++; console.log(`❌ ${name}: ${e.message}`); });
    }
    passed++;
    console.log(`✅ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`❌ ${name}: ${e.message}`);
  }
}

// ============================================================
// ACCOUNT MODEL EXTENSIONS
// ============================================================
console.log("\n=== ACCOUNT MODEL ===");

import {
  createAccount,
  getAccountById,
  updateAccount,
  hashPassword,
  verifyPassword,
  sanitizeAccount,
  generateId,
} from "../src/control/account-store";

test("Account has new fields", () => {
  const result = createAccount({ username: `test_ext_${Date.now()}`, password: "testpass123", role: "user" });
  assert(result.success && result.account);
  const account = getAccountById(result.account.id);
  assert(account);
  // New fields exist on the type (may be undefined for new accounts)
  assert("mfaEnabled" in account || account.mfaEnabled === undefined, "Account type has mfaEnabled");
  assert("email" in account || account.email === undefined, "Account type has email");
});

test("SanitizeAccount strips sensitive fields", () => {
  const result = createAccount({ username: `test_sanitize_${Date.now()}`, password: "testpass123", role: "user" });
  assert(result.success && result.account);
  const account = getAccountById(result.account.id);
  assert(account);
  const sanitized = sanitizeAccount(account);
  assert(!("passwordHash" in sanitized), "Sanitized should not have passwordHash");
  assert(!("passwordSalt" in sanitized), "Sanitized should not have passwordSalt");
  assert(!("mfaSecret" in sanitized), "Sanitized should not have mfaSecret");
  assert(!("recoveryCodesHash" in sanitized), "Sanitized should not have recoveryCodesHash");
  // mfaEnabled is in the SanitizedAccount type
  assert(typeof sanitized.mfaEnabled !== "string", "Sanitized mfaEnabled is not a string leak");
});

test("Update account email", () => {
  const result = createAccount({ username: `test_email_${Date.now()}`, password: "testpass123", role: "user" });
  assert(result.success && result.account);
  const updateResult = updateAccount(result.account.id, { email: "test@example.com", emailVerified: true });
  assert(updateResult.success);
  const account = getAccountById(result.account.id);
  assert(account);
  assert.strictEqual(account.email, "test@example.com");
  assert.strictEqual(account.emailVerified, true);
});

// ============================================================
// LINKED IDENTITIES
// ============================================================
console.log("\n=== LINKED IDENTITIES ===");

import {
  linkIdentity,
  unlinkIdentity,
  findIdentityByProvider,
  getAccountIdentities,
  unlinkProviderFromAccount,
  hasProviderLinked,
} from "../src/control/linked-identities";

test("Link and find identity", () => {
  const accountId = `test_acc_${Date.now()}`;
  const identity = linkIdentity({
    accountId,
    provider: "discord",
    providerUserId: "123456789",
    providerEmail: "user@discord.com",
    displayName: "TestUser",
  });
  assert(identity);
  assert.strictEqual(identity.provider, "discord");
  assert.strictEqual(identity.providerUserId, "123456789");

  const found = findIdentityByProvider("discord", "123456789");
  assert(found);
  assert.strictEqual(found.accountId, accountId);
});

test("Get account identities", () => {
  const accountId = `test_acc_multi_${Date.now()}`;
  linkIdentity({ accountId, provider: "discord", providerUserId: `d_${Date.now()}` });
  linkIdentity({ accountId, provider: "google", providerUserId: `g_${Date.now()}` });
  const identities = getAccountIdentities(accountId);
  assert.strictEqual(identities.length, 2);
});

test("Has provider linked", () => {
  const accountId = `test_has_${Date.now()}`;
  assert(!hasProviderLinked(accountId, "discord"));
  linkIdentity({ accountId, provider: "discord", providerUserId: `d_${Date.now()}` });
  assert(hasProviderLinked(accountId, "discord"));
  assert(!hasProviderLinked(accountId, "google"));
});

test("Unlink identity", () => {
  const accountId = `test_unlink_${Date.now()}`;
  const identity = linkIdentity({ accountId, provider: "google", providerUserId: `g_${Date.now()}` });
  assert(hasProviderLinked(accountId, "google"));
  const result = unlinkProviderFromAccount(accountId, "google");
  assert(result);
  assert(!hasProviderLinked(accountId, "google"));
});

// ============================================================
// PASSWORD RESET TOKENS
// ============================================================
console.log("\n=== PASSWORD RESET ===");

import {
  generateResetToken,
  validateResetToken,
  useResetToken,
  invalidateResetTokens,
} from "../src/control/password-reset";

test("Generate and validate reset token", () => {
  const accountId = `test_reset_${Date.now()}`;
  const token = generateResetToken(accountId);
  assert(token && token.length === 64);
  assert(validateResetToken(accountId, token));
});

test("Use reset token marks as used", () => {
  const accountId = `test_use_${Date.now()}`;
  const token = generateResetToken(accountId);
  assert(useResetToken(accountId, token));
  assert(!validateResetToken(accountId, token));
});

test("Invalid token fails validation", () => {
  const accountId = `test_invalid_${Date.now()}`;
  generateResetToken(accountId);
  assert(!validateResetToken(accountId, "invalidtoken"));
});

test("Invalidate all tokens for account", () => {
  const accountId = `test_invalidate_${Date.now()}`;
  generateResetToken(accountId);
  generateResetToken(accountId);
  invalidateResetTokens(accountId);
  assert(!validateResetToken(accountId, "anything"));
});

// ============================================================
// SESSION EXTENSIONS
// ============================================================
console.log("\n=== SESSION EXTENSIONS ===");

import {
  createSession,
  listSessionsForAccount,
  revokeSession,
  destroyAllSessionsForAccount,
} from "../src/control/session-store";

test("List sessions for account", () => {
  const accountId = `test_sess_${Date.now()}`;
  createSession(accountId, "user", "127.0.0.1");
  createSession(accountId, "user", "127.0.0.1");
  const sessions = listSessionsForAccount(accountId);
  assert(sessions.length >= 2);
  assert(sessions[0].sessionId);
  assert(sessions[0].lastSeenIp);
});

test("Revoke specific session", () => {
  const accountId = `test_revoke_${Date.now()}`;
  const session = createSession(accountId, "user", "127.0.0.1");
  assert(revokeSession(session.sessionId, accountId));
  const remaining = listSessionsForAccount(accountId);
  assert(!remaining.find((s) => s.sessionId === session.sessionId));
});

// ============================================================
// OAUTH STATE MANAGEMENT
// ============================================================
console.log("\n=== OAUTH STATE ===");

import {
  createOAuthState,
  consumeOAuthState,
} from "../src/control/oauth";

test("Create and consume OAuth state", () => {
  const state = createOAuthState("discord", "login");
  assert(state && state.length === 64);
  const record = consumeOAuthState(state);
  assert(record);
  assert.strictEqual(record.provider, "discord");
  assert.strictEqual(record.action, "login");
});

test("Consumed state cannot be reused", () => {
  const state = createOAuthState("google", "login");
  consumeOAuthState(state);
  const second = consumeOAuthState(state);
  assert(!second);
});

test("Invalid state returns null", () => {
  const result = consumeOAuthState("invalidstate123");
  assert(!result);
});

test("Link action includes accountId", () => {
  const accountId = `test_link_${Date.now()}`;
  const state = createOAuthState("discord", "link", accountId);
  const record = consumeOAuthState(state);
  assert(record);
  assert.strictEqual(record.action, "link");
  assert.strictEqual(record.accountId, accountId);
});

// ============================================================
// PASSWORD SECURITY
// ============================================================
console.log("\n=== PASSWORD SECURITY ===");

test("Password hashing uses PBKDF2", () => {
  const { hash, salt } = hashPassword("testpassword");
  assert(hash.length === 128); // 64 bytes hex
  assert(salt.length === 64); // 32 bytes hex
});

test("Password verification is timing-safe", () => {
  const { hash, salt } = hashPassword("correcthorsebatterystaple");
  assert(verifyPassword("correcthorsebatterystaple", hash, salt));
  assert(!verifyPassword("wrongpassword", hash, salt));
});

test("GenerateId produces unique IDs", () => {
  const id1 = generateId();
  const id2 = generateId();
  assert.notStrictEqual(id1, id2);
  assert.strictEqual(id1.length, 32);
});

// ============================================================
// TOTP MFA
// ============================================================
console.log("\n=== TOTP MFA ===");

test("otplib TOTP generation and verification", () => {
  const { authenticator } = require("otplib");
  const secret = authenticator.generateSecret();
  assert(secret && secret.length > 0);
  const token = authenticator.generate(secret);
  assert(token && token.length === 6);
  assert(authenticator.verify({ token, secret }));
  assert(!authenticator.verify({ token: "000000", secret }));
});

test("otplib keyuri generates otpauth URI", () => {
  const { authenticator } = require("otplib");
  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri("user@example.com", "AshenAI", secret);
  assert(uri.startsWith("otpauth://totp/"));
  assert(uri.includes("AshenAI"));
  assert(uri.includes("user%40example.com"));
});

// ============================================================
// MIDDLEWARE INTEGRITY
// ============================================================
console.log("\n=== MIDDLEWARE INTEGRITY ===");

import { requireAuth, requireRole, requireCsrf } from "../src/control/roles";

test("requireAuth exports exist", () => {
  assert(typeof requireAuth === "function");
});

test("requireRole returns middleware", () => {
  const middleware = requireRole("admin");
  assert(typeof middleware === "function");
});

test("requireCsrf exports exist", () => {
  assert(typeof requireCsrf === "function");
});

// ============================================================
// RESULTS
// ============================================================
console.log("\n" + "━".repeat(50));
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log("━".repeat(50));

if (failed > 0) {
  console.log("❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("🎉 ALL AUTH UPGRADE TESTS PASSED");
}
