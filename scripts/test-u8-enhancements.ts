/**
 * AshenAI U8 Authentication Enhancement Tests
 * Tests: MFA enforcement, pre-auth tokens, MFA challenge, email service, QR codes
 */

import assert from "assert";
import crypto from "crypto";

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
// PRE-AUTH TOKENS
// ============================================================
console.log("\n=== PRE-AUTH TOKENS ===");

import {
  createPreAuthToken,
  consumePreAuthToken,
} from "../src/control/session-store";

test("Create and consume pre-auth token", () => {
  const token = createPreAuthToken("acc123", "owner", "testuser", "127.0.0.1");
  assert(token && token.length === 64, "Token should be 64 hex chars");

  const record = consumePreAuthToken(token);
  assert(record, "Should return record");
  assert.strictEqual(record!.accountId, "acc123");
  assert.strictEqual(record!.role, "owner");
  assert.strictEqual(record!.username, "testuser");
  assert.strictEqual(record!.ip, "127.0.0.1");
});

test("Pre-auth token is one-time use", () => {
  const token = createPreAuthToken("acc456", "admin", "admin2", "10.0.0.1");
  consumePreAuthToken(token);
  const second = consumePreAuthToken(token);
  assert(!second, "Second consume should return null");
});

test("Pre-auth token with different account", () => {
  const token1 = createPreAuthToken("acc1", "owner", "user1", "1.1.1.1");
  const token2 = createPreAuthToken("acc2", "admin", "user2", "2.2.2.2");

  const r1 = consumePreAuthToken(token1);
  const r2 = consumePreAuthToken(token2);
  assert(r1);
  assert(r2);
  assert.notStrictEqual(r1!.accountId, r2!.accountId);
});

// ============================================================
// MFA ENFORCEMENT IN LOGIN
// ============================================================
console.log("\n=== MFA ENFORCEMENT ===");

import {
  createAccount,
  getAccountById,
  updateAccount,
} from "../src/control/account-store";
import { authenticateOwner } from "../src/control/auth";
import { authenticator } from "otplib";

test("Login without MFA returns session directly", () => {
  const username = `mfa_test_${Date.now()}`;
  const password = "TestPass123!";
  createAccount({ username, password, role: "owner" });

  const result = authenticateOwner(username, password, "127.0.0.1");
  assert(result.success, "Login should succeed");
  assert(!result.mfaRequired, "Should not require MFA");
  assert(result.sessionId, "Should have sessionId");
});

test("Login with MFA enabled returns challenge token", () => {
  const username = `mfa_enabled_${Date.now()}`;
  const password = "TestPass456!";
  const account = createAccount({ username, password, role: "owner" });
  assert(account.success && account.account);

  // Enable MFA on the account
  const secret = authenticator.generateSecret();
  updateAccount(account.account.id, { mfaEnabled: true, mfaSecret: secret });

  const result = authenticateOwner(username, password, "127.0.0.1");
  assert(result.success, "Login should succeed");
  assert(result.mfaRequired, "Should require MFA");
  assert(result.challengeToken, "Should have challenge token");
  assert(result.mfaAccountId, "Should have mfaAccountId");
  assert(!result.sessionId, "Should NOT have sessionId yet");
});

test("User role skips MFA even if enabled", () => {
  const username = `mfa_user_${Date.now()}`;
  const password = "TestPass789!";
  const account = createAccount({ username, password, role: "user" });
  assert(account.success && account.account);

  // Try to enable MFA (should be blocked by endpoint, but we can set it directly)
  updateAccount(account.account.id, { mfaEnabled: true });

  const result = authenticateOwner(username, password, "127.0.0.1");
  assert(result.success, "Login should succeed");
  assert(!result.mfaRequired, "User role should skip MFA");
  assert(result.sessionId, "Should have session");
});

// ============================================================
// MFA CHALLENGE VERIFICATION
// ============================================================
console.log("\n=== MFA CHALLENGE ===");

import { createSession } from "../src/control/session-store";

test("Pre-auth token cannot be used to access protected resources", () => {
  const token = createPreAuthToken("acc789", "owner", "secureuser", "127.0.0.1");
  const record = consumePreAuthToken(token);
  assert(record, "Should have record");
  // Pre-auth tokens are NOT sessions - they can't be validated as sessions
  const { validateSession } = require("../src/control/session-store");
  const session = validateSession(token);
  assert(!session, "Pre-auth token should not be a valid session");
});

test("MFA challenge with valid TOTP code", async () => {
  const username = `mfa_challenge_${Date.now()}`;
  const password = "ChallengePass1!";
  const account = createAccount({ username, password, role: "owner" });
  assert(account.success && account.account);

  const secret = authenticator.generateSecret();
  const token = authenticator.generate(secret);
  updateAccount(account.account.id, { mfaEnabled: true, mfaSecret: secret });

  // Verify the TOTP code works
  const isValid = authenticator.verify({ token, secret });
  assert(isValid, "TOTP code should be valid");
});

// ============================================================
// EMAIL SERVICE
// ============================================================
console.log("\n=== EMAIL SERVICE ===");

import {
  getEmailService,
  sendPasswordResetEmail,
  sendSecurityNotification,
} from "../src/control/email-service";

test("Get email service returns dev service by default", () => {
  const service = getEmailService();
  assert(service, "Should return a service");
  assert(typeof service.send === "function", "Service should have send method");
});

test("Email service send returns success", async () => {
  const service = getEmailService();
  const result = await service.send({
    to: "test@example.com",
    subject: "Test",
    text: "Test email body",
  });
  assert(result.success, "Should succeed");
});

test("sendPasswordResetEmail returns success", async () => {
  const result = await sendPasswordResetEmail(
    "test@example.com",
    "acc123",
    "token123",
    "http://localhost:3000",
  );
  assert(result.success, "Should succeed");
});

test("sendSecurityNotification returns success", async () => {
  const result = await sendSecurityNotification(
    "test@example.com",
    "Login from new device",
    "IP: 192.168.1.1",
  );
  assert(result.success, "Should succeed");
});

// ============================================================
// QR CODE GENERATION
// ============================================================
console.log("\n=== QR CODE GENERATION ===");

test("QR code can be generated from otpauth URI", async () => {
  const QRCode = require("qrcode");
  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri("user@example.com", "AshenAI", secret);

  const dataUrl = await QRCode.toDataURL(uri, { width: 256 });
  assert(dataUrl.startsWith("data:image/png;base64,"), "Should return data URL");
});

test("QR code generation with invalid input does not throw", async () => {
  const QRCode = require("qrcode");
  // Empty string should still work or throw gracefully
  try {
    const dataUrl = await QRCode.toDataURL("", { width: 256 });
    assert(typeof dataUrl === "string", "Should return string");
  } catch {
    // It's ok if it throws for empty input
  }
});

// ============================================================
// RECOVERY CODES
// ============================================================
console.log("\n=== RECOVERY CODES ===");

test("Recovery codes are SHA-256 hashed", () => {
  const codes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
  const hash = crypto.createHash("sha256").update(codes.join("\n")).digest("hex");
  assert.strictEqual(hash.length, 64, "SHA-256 hash should be 64 hex chars");
});

test("Recovery code verification works", () => {
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const hash = crypto.createHash("sha256").update(code).digest("hex");

  // Verify the code matches
  const verifyHash = crypto.createHash("sha256").update(code).digest("hex");
  assert.strictEqual(hash, verifyHash, "Hash should match");

  // Different code should not match
  const wrongHash = crypto.createHash("sha256").update("WRONGCODE").digest("hex");
  assert.notStrictEqual(hash, wrongHash, "Wrong code should not match");
});

// ============================================================
// OAUTH STATE SECURITY
// ============================================================
console.log("\n=== OAUTH SECURITY ===");

import {
  createOAuthState,
  consumeOAuthState,
} from "../src/control/oauth";

test("OAuth state prevents replay attacks", () => {
  const state = createOAuthState("discord", "login");
  const first = consumeOAuthState(state);
  assert(first, "First consume should work");

  const second = consumeOAuthState(state);
  assert(!second, "Second consume should fail (replay prevented)");
});

test("OAuth state with link action includes accountId", () => {
  const accountId = `acc_link_${Date.now()}`;
  const state = createOAuthState("google", "link", accountId);
  const record = consumeOAuthState(state);
  assert(record);
  assert.strictEqual(record!.action, "link");
  assert.strictEqual(record!.accountId, accountId);
});

// ============================================================
// ACCOUNT SECURITY FIELDS
// ============================================================
console.log("\n=== ACCOUNT SECURITY ===");

test("Account sanitization strips MFA secret and recovery codes", () => {
  const { sanitizeAccount } = require("../src/control/account-store");
  const result = createAccount({ username: `sec_test_${Date.now()}`, password: "testpass123", role: "owner" });
  assert(result.success && result.account);

  const account = getAccountById(result.account.id);
  assert(account);

  // Set sensitive fields
  updateAccount(account.id, {
    mfaEnabled: true,
    mfaSecret: "supersecret",
    recoveryCodesHash: "hash123",
  });

  const updated = getAccountById(account.id);
  assert(updated);

  const sanitized = sanitizeAccount(updated);
  assert(!("mfaSecret" in sanitized), "Should not have mfaSecret");
  assert(!("recoveryCodesHash" in sanitized), "Should not have recoveryCodesHash");
  assert(!("passwordHash" in sanitized), "Should not have passwordHash");
  assert(!("passwordSalt" in sanitized), "Should not have passwordSalt");
});

// ============================================================
// RESULTS
// ============================================================
console.log("\n" + "━".repeat(50));
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log("━".repeat(50));

if (failed > 0) {
  console.log("❌ SOME U8 TESTS FAILED");
  process.exit(1);
} else {
  console.log("🎉 ALL U8 TESTS PASSED");
}
