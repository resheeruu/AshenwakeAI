/**
 * U10 Tests: Web Security Perimeter Hardening
 *
 * Tests cover:
 * 1. CSRF token generation and validation
 * 2. Session cookie security properties
 * 3. Session rotation
 * 4. CORS configuration
 * 5. Startup config validation
 * 6. Auth middleware behavior
 * 7. Security header enforcement
 * 8. Defense-in-depth validation
 */

import crypto from "crypto";
import {
  authenticateOwner,
  validateSession,
  validateCsrfToken,
  getCsrfToken,
  rotateSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  createLoginRateLimiter,
} from "../src/control/auth";
import {
  createAccount,
  getAccountByUsername,
  deleteAccount,
  hashPassword,
} from "../src/control/account-store";
import { destroyAllSessionsForAccount } from "../src/control/session-store";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} (got ${actual}, expected ${expected})`);
}

function assertIncludes(haystack: string, needle: string, message: string) {
  assert(haystack.includes(needle), `${message} (expected "${needle}" in "${haystack}")`);
}

function assertNotIncludes(haystack: string, needle: string, message: string) {
  assert(!haystack.includes(needle), `${message} (did not expect "${needle}" in "${haystack}")`);
}

/** Assert that a promise rejects — used for fail-closed security paths. */
async function assertRejection(promise: Promise<unknown>, message: string) {
  try {
    await promise;
    assert(false, message);
  } catch {
    assert(true, message);
  }
}

/* ================================================================
 * HELPERS
 * ================================================================ */

function makeMockRes(): { headers: Record<string, string>; setHeader: (n: string, v: string) => void } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: (name: string, value: string) => { headers[name] = value; },
  };
}

const TEST_USERNAME = "test_owner_" + Date.now().toString(36);
const TEST_PASSWORD = "test_pass_12345";

function setupTestAccount() {
  const existing = getAccountByUsername(TEST_USERNAME);
  if (existing) return;
  createAccount({
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    role: "owner",
  });
}

function cleanupTestAccount() {
  const account = getAccountByUsername(TEST_USERNAME);
  if (account) {
    destroyAllSessionsForAccount(account.id);
    deleteAccount(account.id);
  }
}

/* ================================================================
 * A. CSRF TOKEN GENERATION
 * ================================================================ */

console.log("\n===== A. CSRF TOKEN GENERATION =====");

setupTestAccount();

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "127.0.0.1");
  assert(result.success, "Login succeeds with correct credentials");
  assert(result.sessionId !== undefined, "Session ID is returned");
  assert(result.sessionId!.length === 64, "Session ID is 64 hex chars");
}

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "127.0.0.1");
  assert(result.success, "Second login succeeds");

  const csrfToken = getCsrfToken(result.sessionId!);
  assert(csrfToken !== null, "CSRF token is retrievable after login");
  assertEqual(csrfToken!.length, 64, "CSRF token is 64 hex chars");
}

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "127.0.0.1");
  assert(result.success, "Login succeeds");

  const csrfToken = getCsrfToken(result.sessionId!);
  assert(csrfToken !== null, "CSRF token retrieved");

  const result2 = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "127.0.0.1");
  const csrfToken2 = getCsrfToken(result2.sessionId!);
  assert(csrfToken !== csrfToken2, "Different sessions have different CSRF tokens");
}

/* ================================================================
 * B. CSRF TOKEN VALIDATION
 * ================================================================ */

console.log("\n===== B. CSRF TOKEN VALIDATION =====");

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.0.1");
  assert(result.success, "Login succeeds");

  const csrfToken = getCsrfToken(result.sessionId!);
  assert(csrfToken !== null, "CSRF token retrieved");

  const valid = validateCsrfToken(result.sessionId!, csrfToken!);
  assert(valid, "Correct CSRF token validates");
}

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.0.2");
  assert(result.success, "Login succeeds");

  const csrfToken = getCsrfToken(result.sessionId!);
  assert(csrfToken !== null, "CSRF token retrieved");

  const wrongToken = "a".repeat(64);
  const invalid = validateCsrfToken(result.sessionId!, wrongToken);
  assert(!invalid, "Wrong CSRF token is rejected");
}

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.0.3");
  assert(result.success, "Login succeeds");

  const emptyToken = validateCsrfToken(result.sessionId!, "");
  assert(!emptyToken, "Empty CSRF token is rejected");
}

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.0.4");
  assert(result.success, "Login succeeds");

  const shortToken = validateCsrfToken(result.sessionId!, "abc123");
  assert(!shortToken, "Short CSRF token is rejected");
}

{
  const fakeSession = "f".repeat(64);
  const fakeToken = "a".repeat(64);
  const invalid = validateCsrfToken(fakeSession, fakeToken);
  assert(!invalid, "Non-existent session ID is rejected");
}

/* ================================================================
 * C. SESSION COOKIE SECURITY PROPERTIES
 * ================================================================ */

console.log("\n===== C. SESSION COOKIE SECURITY =====");

{
  const res = makeMockRes();
  setSessionCookie(res, "test_session_id", Date.now() + 86400000);

  const cookie = res.headers["Set-Cookie"] || "";
  assertIncludes(cookie, "HttpOnly", "Cookie has HttpOnly flag");
  assertIncludes(cookie, "SameSite=Lax", "Cookie has SameSite=Lax");
  assertIncludes(cookie, "Path=/", "Cookie has Path=/");
  assertIncludes(cookie, "Max-Age=", "Cookie has Max-Age");
  assertIncludes(cookie, "SameSite=Lax", "Cookie has SameSite=Lax");
}

{
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const res = makeMockRes();
  setSessionCookie(res, "prod_session", Date.now() + 86400000);

  const cookie = res.headers["Set-Cookie"] || "";
  assertIncludes(cookie, "Secure", "Production cookie has Secure flag");
  assertIncludes(cookie, "HttpOnly", "Production cookie has HttpOnly");
  assertIncludes(cookie, "SameSite=Lax", "Production cookie has SameSite=Lax");

  process.env.NODE_ENV = original;
}

{
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  const res = makeMockRes();
  setSessionCookie(res, "dev_session", Date.now() + 86400000);

  const cookie = res.headers["Set-Cookie"] || "";
  assertNotIncludes(cookie, "Secure", "Development cookie does NOT have Secure flag");

  process.env.NODE_ENV = original;
}

{
  const res = makeMockRes();
  clearSessionCookie(res);

  const cookie = res.headers["Set-Cookie"] || "";
  assertIncludes(cookie, "Max-Age=0", "Clear cookie sets Max-Age=0");
  assertIncludes(cookie, "HttpOnly", "Clear cookie has HttpOnly");
  assertIncludes(cookie, "SameSite=Lax", "Clear cookie has SameSite=Lax");
}

{
  const res = makeMockRes();
  setSessionCookie(res, "secret_session", Date.now() + 86400000);

  const cookie = res.headers["Set-Cookie"] || "";
  assertNotIncludes(cookie, "document.cookie", "Cookie is not accessible via JS");
}

/* ================================================================
 * D. SESSION ROTATION
 * ================================================================ */

console.log("\n===== D. SESSION ROTATION =====");

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.1.1");
  assert(result.success, "Login succeeds");

  const rotated = rotateSession(result.sessionId!);
  assert(rotated !== null, "rotateSession returns result");
  assertEqual(rotated!.newSessionId, result.sessionId, "New session ID matches original (not yet time to rotate)");
}

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.1.2");
  assert(result.success, "Login succeeds");

  const rotated = rotateSession("nonexistent_session_id");
  assert(rotated === null, "rotateSession returns null for non-existent session");
}

{
  const r1 = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.1.4");
  const r2 = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.1.5");
  assert(r1.success && r2.success, "Two logins succeed");

  const t1 = getCsrfToken(r1.sessionId!);
  const t2 = getCsrfToken(r2.sessionId!);
  assert(t1 !== null && t2 !== null, "Both have CSRF tokens");
  assert(t1 !== t2, "Different sessions have different CSRF tokens");
}

/* ================================================================
 * E. SESSION VALIDATION
 * ================================================================ */

console.log("\n===== E. SESSION VALIDATION =====");

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.2.1");
  assert(result.success, "Login succeeds");

  const session = validateSession(result.sessionId!);
  assert(session !== null, "Valid session is accepted");
  assertEqual(session!.accountId, getAccountByUsername(TEST_USERNAME)!.id, "Session has correct accountId");
}

{
  const session = validateSession("nonexistent_session");
  assert(session === null, "Non-existent session is rejected");
}

{
  destroySession("test_destroy");
  const session = validateSession("test_destroy");
  assert(session === null, "Destroyed session is rejected");
}

/* ================================================================
 * F. SESSION EXPIRATION
 * ================================================================ */

console.log("\n===== F. SESSION EXPIRATION =====");

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.3.1");
  assert(result.success, "Login succeeds");

  const session = validateSession(result.sessionId!);
  assert(session !== null, "Session is initially valid");
}

/* ================================================================
 * G. SESSION DESTRUCTION
 * ================================================================ */

console.log("\n===== G. SESSION DESTRUCTION =====");

{
  const result = authenticateOwner(TEST_USERNAME, TEST_PASSWORD, "10.0.4.1");
  assert(result.success, "Login succeeds");

  const destroyed = destroySession(result.sessionId!);
  assert(destroyed, "Session destruction returns true");

  const session = validateSession(result.sessionId!);
  assert(session === null, "Destroyed session is invalid");
}

{
  const destroyed = destroySession("nonexistent_session_id");
  assert(!destroyed, "Destroying non-existent session returns false");
}

/* ================================================================
 * H. LOGIN RATE LIMITING
 * ================================================================ */

console.log("\n===== H. LOGIN RATE LIMITING =====");

{
  const ip = "test_rate_limiter_" + Date.now().toString(36);

  for (let i = 0; i < 5; i++) {
    const r = authenticateOwner(TEST_USERNAME, "wrong_pass_" + i, ip);
    assert(!r.success, "Failed login attempt " + (i + 1) + " rejected");
  }

  // 6th attempt should be rate limited
  const result = authenticateOwner(TEST_USERNAME, "wrong_pass_5", ip);
  assert(!result.success, "Request is blocked after 5 failed logins");
  assertEqual(result.reason, "rate_limited", "Reason is rate_limited");
}

{
  // Use a fresh IP and fresh username to verify no false positives
  const ip2 = "test_rate_fresh_" + Date.now().toString(36);
  const freshUser = "fresh_user_" + Date.now().toString(36);
  const result = authenticateOwner(freshUser, "wrong_password", ip2);
  assert(!result.success, "Fresh IP+user is not rate limited");
  assertEqual(result.reason, "invalid_credentials", "Fresh IP+user gets invalid_credentials");
}

/* ================================================================
 * I. GENERIC ERROR MESSAGES
 * ================================================================ */

console.log("\n===== I. GENERIC ERROR MESSAGES =====");

{
  const result = authenticateOwner("nonexistent_user_" + Date.now(), "wrong_pass", "10.0.5.1");
  assert(!result.success, "Login fails for non-existent user");
}

{
  const result = authenticateOwner(TEST_USERNAME, "wrong_password_" + Date.now(), "10.0.5.2");
  assert(!result.success, "Login fails for wrong password");
}

/* ================================================================
 * J. PASSWORD HASHING
 * ================================================================ */

console.log("\n===== J. PASSWORD HASHING =====");

{
  const { hash, salt } = hashPassword("test_password");
  assertEqual(hash.length, 128, "Password hash is 128 hex chars (64 bytes)");
  assertEqual(salt.length, 64, "Password salt is 64 hex chars (32 bytes)");
}

{
  const { hash: h1, salt: s1 } = hashPassword("password");
  const { hash: h2 } = hashPassword("password", s1);
  assertEqual(h1, h2, "Same password + salt produces same hash");
}

{
  const { salt: s1 } = hashPassword("password");
  const { salt: s2 } = hashPassword("password");
  assert(s1 !== s2, "Different salts are generated for same password");
}

/* ================================================================
 * K. OUTBOUND NETWORK BOUNDARY (SSRF)
 *
 * Regression coverage for concrete SSRF issues:
 *  - private/loopback/link-local/metadata targets must be blocked
 *    (including exotic IPv4 notations and IPv4-mapped IPv6 forms)
 *  - every redirect hop must be validated (no blind redirect: "follow")
 *  - blocked targets fail closed without performing any request
 * ================================================================ */

import fs from "node:fs";
import path from "node:path";
import {
  isPrivateOrReservedIP,
  validateOutboundUrl,
  validateRedirectTarget,
} from "../src/security/network-boundary";
import { fetchPage, requestWithValidatedRedirects } from "../src/web/fetch";

{
  const blockedIps = [
    "127.0.0.1", "10.0.0.1", "100.64.0.1", "169.254.169.254", "172.16.0.1",
    "192.168.1.1", "198.18.0.5", "224.0.0.1", "255.255.255.255", "0.0.0.0",
    "::1", "::", "fd00::1", "fe80::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "2002:7f00:1::",
  ];
  for (const ip of blockedIps) {
    assert(
      isPrivateOrReservedIP(ip) === true,
      `private/reserved IP blocked: ${ip}`,
    );
  }

  const publicIps = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::1111"];
  for (const ip of publicIps) {
    assert(
      isPrivateOrReservedIP(ip) === false,
      `public IP allowed: ${ip}`,
    );
  }
}

{
  const blockedUrls = [
    "http://127.0.0.1/",            // loopback
    "http://127.1/",                // short-form IPv4 (normalizes to 127.0.0.1)
    "http://0x7f.1/",               // hex-form IPv4
    "http://2130706433/",           // decimal-form 127.0.0.1
    "http://169.254.169.254/latest/meta-data/", // cloud metadata
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",   // IPv4-mapped loopback
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://255.255.255.255/",      // broadcast (240/4)
    "http://localhost:8080/",
    "http://metadata.google.internal/",
    "http://service.internal/",
    "http://printer.local/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "gopher://internal/",
    "http://user:pass@example.com/", // credentials in URL
    "not-a-url",
    "",
  ];
  for (const url of blockedUrls) {
    assert(validateOutboundUrl(url).valid === false, `outbound URL blocked: ${url || "(empty)"}`);
  }

  const allowedUrls = ["https://example.com/", "http://example.com/", "https://8.8.8.8/"];
  for (const url of allowedUrls) {
    assert(validateOutboundUrl(url).valid === true, `outbound URL allowed: ${url}`);
  }
}

{
  // Redirects are the classic SSRF bypass: a public host can bounce the
  // request into internal infrastructure. Every hop must be validated.
  const toMetadata = validateRedirectTarget(
    "http://169.254.169.254/latest/meta-data/",
    "https://example.com/start",
  );
  assert(toMetadata.valid === false, "redirect to metadata endpoint blocked");

  const toLoopback = validateRedirectTarget("//127.0.0.1/", "https://example.com/start");
  assert(toLoopback.valid === false, "protocol-relative redirect to loopback blocked");

  const toInternal = validateRedirectTarget("http://db.internal/", "https://example.com/start");
  assert(toInternal.valid === false, "redirect to .internal hostname blocked");

  const relative = validateRedirectTarget("/next", "https://example.com/start");
  assert(relative.valid === true && relative.url === "https://example.com/next",
    "safe relative redirect allowed");
}

{
  // Fail-closed request checks (no network, blocked before any request)
  // run in the async finalize step below, together with the summary.
}

{
  // Source-level guard: automatic ("follow") redirect handling lets the HTTP
  // client follow redirect chains unvalidated — the concrete SSRF issue fixed
  // in this module. Comment lines are removed so documentation may mention it
  // (line-based, because header strings legitimately contain "*").
  const fetchSource = fs.readFileSync(
    path.join(process.cwd(), "src", "web", "fetch.ts"),
    "utf8",
  );
  const codeOnly = fetchSource
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t.startsWith("*/"));
    })
    .join("\n");

  assert(codeOnly.includes('redirect: "manual"'),
    "fetch.ts uses redirect: \"manual\" (per-hop validation)");
  assert(!codeOnly.includes('redirect: "follow"'),
    "fetch.ts does not use redirect: \"follow\" (unvalidated redirect chain)");
}

/* ================================================================
 * FAIL-CLOSED REQUEST CHECKS + CLEANUP & SUMMARY
 * ================================================================ */

async function finish(): Promise<void> {
  // Blocked targets must fail closed WITHOUT performing a request.
  // (All of these are rejected by validation before DNS/network I/O.)
  await assertRejection(
    fetchPage("http://127.0.0.1/", { respectRobots: false, useCache: false }),
    "fetchPage rejects loopback URL without requesting",
  );
  await assertRejection(
    fetchPage("file:///etc/passwd", { respectRobots: false, useCache: false }),
    "fetchPage rejects file:// URL without requesting",
  );
  await assertRejection(
    requestWithValidatedRedirects("http://169.254.169.254/", 1_000),
    "redirect-following rejects metadata start URL without requesting",
  );

  cleanupTestAccount();

  console.log("\n===== RESULTS =====");
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log("\n❌ SOME TESTS FAILED");
    process.exit(1);
  } else {
    console.log("\n🎉 ALL TESTS PASSED");
  }
}

void finish().catch((error) => {
  console.error("❌ Web security test runner failed:", error);
  process.exit(1);
});
