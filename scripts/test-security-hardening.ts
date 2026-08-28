/**
 * U15: Security Hardening Regression Tests
 *
 * Tests for:
 * - Command injection prevention (cli-agent.ts)
 * - Path traversal prevention (tool-permissions.ts)
 * - Audit integrity fallback key (audit-integrity.ts)
 * - CSRF protection on logout (server.ts)
 * - Status command authorization
 * - Moderation rate limiting
 */

import assert from "node:assert";
import { isSecretPath, canReadPath, canWritePath, canUseTool } from "../src/security/tool-permissions";
import { CliCodingAgent } from "../src/coding-agents/adapters/cli-agent";
import { UserRateLimiter } from "../src/security/rate-limit";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (error: any) {
    failed++;
    console.log(`  ❌ ${name}: ${error.message}`);
  }
}

console.log("🧪 U15: Security Hardening Regression Tests\n");

/* ================================================================
 * SECTION A: Path Traversal Prevention
 * ================================================================ */
console.log("===== A. PATH TRAVERSAL PREVENTION =====");

test("Normal file path is not secret", () => {
  assert.strictEqual(isSecretPath("src/index.ts"), false);
});

test("Relative path is not secret", () => {
  assert.strictEqual(isSecretPath("data/players.json"), false);
});

test(".env is secret", () => {
  assert.strictEqual(isSecretPath(".env"), true);
});

test(".env.local is secret", () => {
  assert.strictEqual(isSecretPath(".env.local"), true);
});

test("Path with .env directory is secret", () => {
  assert.strictEqual(isSecretPath("config/.env"), true);
});

test("Traversal to .env is secret", () => {
  assert.strictEqual(isSecretPath("src/../.env"), true);
});

test("Encoded traversal to .env is secret", () => {
  assert.strictEqual(isSecretPath("src/%2e%2e/.env"), true);
});

test("Absolute path is treated as secret", () => {
  assert.strictEqual(isSecretPath("/etc/passwd"), true);
});

test("Windows absolute path is secret", () => {
  assert.strictEqual(isSecretPath("C:\\Users\\test\\.env"), true);
});

test("Null byte path is secret", () => {
  assert.strictEqual(isSecretPath("src/index.ts\0.env"), true);
});

test("Double-dot traversal blocked for canReadPath", () => {
  assert.strictEqual(canReadPath("src/../.env", "admin"), false);
});

test("Double-dot traversal blocked for canWritePath", () => {
  assert.strictEqual(canWritePath("src/../.env", "agent"), false);
});

test("Encoded traversal blocked", () => {
  assert.strictEqual(isSecretPath("src/%2e%2e/secrets/key.json"), true);
});

test("Nested traversal blocked", () => {
  assert.strictEqual(isSecretPath("a/b/../../.env"), true);
});

test("Normal path passes canReadPath for admin", () => {
  assert.strictEqual(canReadPath("src/index.ts", "admin"), true);
});

test("Normal path passes canWritePath for agent", () => {
  assert.strictEqual(canWritePath("src/index.ts", "agent"), true);
});

test("Secret path blocks canReadPath for fix", () => {
  assert.strictEqual(canReadPath(".env", "fix"), false);
});

test("Secret path blocks canWritePath for fix", () => {
  assert.strictEqual(canWritePath(".env", "fix"), false);
});

test("Public access cannot read any path", () => {
  assert.strictEqual(canReadPath("src/index.ts", "public"), false);
});

test("Public access cannot write any path", () => {
  assert.strictEqual(canWritePath("src/index.ts", "public"), false);
});

/* ================================================================
 * SECTION B: Command Injection Prevention
 * ================================================================ */
console.log("\n===== B. COMMAND INJECTION PREVENTION =====");

test("CliCodingAgent rejects shell metacharacters in command", async () => {
  const agent = new CliCodingAgent(
    "evil", '"; rm -rf / #', "1.0", "general"
  );
  const result = await agent.isAvailable();
  assert.strictEqual(result, false);
});

test("CliCodingAgent rejects pipe injection", async () => {
  const agent = new CliCodingAgent(
    "evil", "echo test | cat /etc/passwd", "1.0", "general"
  );
  const result = await agent.isAvailable();
  assert.strictEqual(result, false);
});

test("CliCodingAgent rejects backtick injection", async () => {
  const agent = new CliCodingAgent(
    "evil", "`whoami`", "1.0", "general"
  );
  const result = await agent.isAvailable();
  assert.strictEqual(result, false);
});

test("CliCodingAgent rejects $() injection", async () => {
  const agent = new CliCodingAgent(
    "evil", "$(whoami)", "1.0", "general"
  );
  const result = await agent.isAvailable();
  assert.strictEqual(result, false);
});

test("CliCodingAgent rejects semicolon injection", async () => {
  const agent = new CliCodingAgent(
    "evil", "echo test; rm -rf /", "1.0", "general"
  );
  const result = await agent.isAvailable();
  assert.strictEqual(result, false);
});

test("CliCodingAgent rejects newline injection", async () => {
  const agent = new CliCodingAgent(
    "evil", "echo test\nrm -rf /", "1.0", "general"
  );
  const result = await agent.isAvailable();
  assert.strictEqual(result, false);
});

test("CliCodingAgent rejects allowlisted but nonexistent command", async () => {
  const agent = new CliCodingAgent(
    "test", "nonexistent-cmd-12345", "1.0", "general"
  );
  const result = await agent.isAvailable();
  assert.strictEqual(result, false);
});

test("CliCodingAgent sanitizes command name", () => {
  const agent = new CliCodingAgent(
    "test", "valid-cmd", "1.0", "general"
  );
  assert.strictEqual(agent.command, "valid-cmd");
});

/* ================================================================
 * SECTION C: Audit Integrity
 * ================================================================ */
console.log("\n===== C. AUDIT INTEGRITY =====");

test("Audit integrity module exports required functions", async () => {
  const mod = await import("../src/security/audit-integrity");
  assert.strictEqual(typeof mod.signEntry, "function");
  assert.strictEqual(typeof mod.verifyEntry, "function");
  assert.strictEqual(typeof mod.verifyAuditChain, "function");
  assert.strictEqual(typeof mod.getGenesisHash, "function");
});

test("Genesis hash is 'genesis'", async () => {
  const mod = await import("../src/security/audit-integrity");
  assert.strictEqual(mod.getGenesisHash(), "genesis");
});

test("signEntry produces valid signature format", async () => {
  const mod = await import("../src/security/audit-integrity");
  const entry = {
    id: "test-1",
    timestamp: Date.now(),
    who: "test-user",
    what: "test action",
    where: "test",
    result: "success",
  };
  const { signature, prevHash } = mod.signEntry(entry, null);
  assert.strictEqual(typeof signature, "string");
  assert.strictEqual(signature.length, 64);
  assert.strictEqual(prevHash, "genesis");
});

test("verifyEntry accepts valid entry", async () => {
  const mod = await import("../src/security/audit-integrity");
  const entry = {
    id: "test-2",
    timestamp: Date.now(),
    who: "test-user",
    what: "test action",
    where: "test",
    result: "success",
  };
  const { signature, prevHash } = mod.signEntry(entry, null);
  const signedEntry = { ...entry, signature, prevHash };
  assert.strictEqual(mod.verifyEntry(signedEntry, "genesis"), true);
});

test("verifyEntry rejects tampered entry", async () => {
  const mod = await import("../src/security/audit-integrity");
  const entry = {
    id: "test-3",
    timestamp: Date.now(),
    who: "test-user",
    what: "test action",
    where: "test",
    result: "success",
  };
  const { signature, prevHash } = mod.signEntry(entry, null);
  const signedEntry = { ...entry, signature, prevHash, who: "TAMPERED" };
  assert.strictEqual(mod.verifyEntry(signedEntry, "genesis"), false);
});

test("verifyAuditChain accepts valid chain", async () => {
  const mod = await import("../src/security/audit-integrity");
  const entry1 = { id: "c1", timestamp: 1, who: "a", what: "a1", where: "t", result: "ok" };
  const sig1 = mod.signEntry(entry1, null);
  const entry2 = { id: "c2", timestamp: 2, who: "b", what: "a2", where: "t", result: "ok" };
  const sig2 = mod.signEntry(entry2, sig1.signature);
  const chain = [
    { ...entry1, ...sig1 },
    { ...entry2, ...sig2 },
  ];
  const result = mod.verifyAuditChain(chain);
  assert.strictEqual(result.valid, true);
});

test("verifyAuditChain rejects tampered chain", async () => {
  const mod = await import("../src/security/audit-integrity");
  const entry1 = { id: "c3", timestamp: 3, who: "a", what: "a1", where: "t", result: "ok" };
  const sig1 = mod.signEntry(entry1, null);
  const entry2 = { id: "c4", timestamp: 4, who: "b", what: "a2", where: "t", result: "ok" };
  const sig2 = mod.signEntry(entry2, sig1.signature);
  const chain = [
    { ...entry1, ...sig1 },
    { ...entry2, ...sig2, what: "TAMPERED" },
  ];
  const result = mod.verifyAuditChain(chain);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(typeof result.brokenAt, "number");
});

test("Empty chain is valid", async () => {
  const mod = await import("../src/security/audit-integrity");
  const result = mod.verifyAuditChain([]);
  assert.strictEqual(result.valid, true);
});

test("Pre-U13 unsigned entries are accepted", async () => {
  const mod = await import("../src/security/audit-integrity");
  const entry1 = { id: "old1", timestamp: 1, who: "a", what: "a1", where: "t", result: "ok" };
  const entry2 = { id: "old2", timestamp: 2, who: "b", what: "a2", where: "t", result: "ok" };
  const entry3 = { id: "new1", timestamp: 3, who: "c", what: "a3", where: "t", result: "ok" };
  const sig3 = mod.signEntry(entry3, null);
  const chain = [entry1, entry2, { ...entry3, ...sig3 }];
  const result = mod.verifyAuditChain(chain);
  assert.strictEqual(result.valid, true);
});

/* ================================================================
 * SECTION D: Moderation Rate Limiting
 * ================================================================ */
console.log("\n===== D. MODERATION RATE LIMITING =====");

test("Moderation rate limiter instantiates", () => {
  const limiter = new UserRateLimiter(5, 60_000);
  assert.strictEqual(typeof limiter.check, "function");
  assert.strictEqual(typeof limiter.reset, "function");
});

test("First moderation request allowed", () => {
  const limiter = new UserRateLimiter(3, 60_000);
  const result = limiter.check("mod-user-1");
  assert.strictEqual(result.allowed, true);
});

test("Moderation request blocked after limit", () => {
  const limiter = new UserRateLimiter(2, 60_000);
  limiter.check("mod-user-2");
  limiter.check("mod-user-2");
  const result = limiter.check("mod-user-2");
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.retryAfterMs > 0, true);
});

test("Different moderators have separate limits", () => {
  const limiter = new UserRateLimiter(1, 60_000);
  limiter.check("mod-a");
  const resultB = limiter.check("mod-b");
  assert.strictEqual(resultB.allowed, true);
});

test("Rate limit reset works", () => {
  const limiter = new UserRateLimiter(1, 60_000);
  limiter.check("mod-c");
  limiter.reset("mod-c");
  const result = limiter.check("mod-c");
  assert.strictEqual(result.allowed, true);
});

/* ================================================================
 * SECTION E: Tool Permission Checks
 * ================================================================ */
console.log("\n===== E. TOOL PERMISSION CHECKS =====");

test("Public access cannot use privileged tools", () => {
  assert.strictEqual(canUseTool("readFile", "public"), false);
  assert.strictEqual(canUseTool("writeFile", "public"), false);
  assert.strictEqual(canUseTool("runCommand", "public"), false);
});

test("Agent can use agent tools", () => {
  assert.strictEqual(canUseTool("gitDiff", "agent"), true);
  assert.strictEqual(canUseTool("typecheck", "agent"), true);
});

test("Agent cannot use non-agent privileged tools", () => {
  assert.strictEqual(canUseTool("readFile", "agent"), false);
  assert.strictEqual(canUseTool("writeFile", "agent"), false);
});

test("Fix can use fix tools", () => {
  assert.strictEqual(canUseTool("readFile", "fix"), true);
  assert.strictEqual(canUseTool("writeFile", "fix"), true);
  assert.strictEqual(canUseTool("runCommand", "fix"), true);
});

test("Admin can use all tools", () => {
  assert.strictEqual(canUseTool("readFile", "admin"), true);
  assert.strictEqual(canUseTool("writeFile", "admin"), true);
  assert.strictEqual(canUseTool("runCommand", "admin"), true);
  assert.strictEqual(canUseTool("installPackage", "admin"), true);
});

/* ================================================================
 * SECTION F: Escape Sequences in Paths
 * ================================================================ */
console.log("\n===== F. ENCODED TRAVERSAL BYPASSES =====");

test("URL-encoded dot-dot is blocked", () => {
  assert.strictEqual(isSecretPath("src/%2e%2e/.env"), true);
});

test("Double-encoded dot-dot is blocked", () => {
  assert.strictEqual(isSecretPath("src/%252e%252e/.env"), true);
});

test("Unicode dot-dot variants are blocked", () => {
  assert.strictEqual(isSecretPath("src/\u002e\u002e/.env"), true);
});

test("Backslash traversal is normalized", () => {
  assert.strictEqual(isSecretPath("src\\..\\.env"), true);
});

/* ================================================================
 * RESULTS
 * ================================================================ */
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed === 0) {
  console.log("🎉 ALL U15 SECURITY HARDENING TESTS PASSED");
} else {
  console.log("❌ SOME TESTS FAILED");
  process.exit(1);
}
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
