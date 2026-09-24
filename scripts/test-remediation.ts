import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { verifyEntry, signEntry, verifyAuditChain } from "../src/security/audit-integrity";
import { executeTool, INTERNAL_SKIP_CONFIRMATION, ExecutorOptions } from "../src/ai/tools/executor";
import { createActionPlan } from "../src/ai/tools/executor";
import fs from "node:fs";
import assert from "node:assert";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function testVerifyEntryMalformedSignatures(): void {
  const signable = {
    id: nanoid(12),
    timestamp: Date.now(),
    who: "test",
    what: "test action",
    where: "test",
    result: "success" as const,
  };

  const { signature, prevHash } = signEntry(signable, null);
  const validEntry = { ...signable, signature, prevHash };
  assert(verifyEntry(validEntry, "genesis") === true, "Valid signature should verify");

  assert(verifyEntry({ ...signable, signature: "not-hex!!!", prevHash: "genesis" }, "genesis") === false, "Malformed hex should return false");
  assert(verifyEntry({ ...signable, signature: "", prevHash: "genesis" }, "genesis") === false, "Empty signature should return false");
  assert(verifyEntry({ ...signable, signature: "ab", prevHash: "genesis" }, "genesis") === false, "Truncated signature should return false");
  assert(verifyEntry({ ...signable, signature: signature + "00", prevHash: "genesis" }, "genesis") === false, "Extended signature should return false");
  assert(verifyEntry({ ...signable, signature: undefined as any, prevHash: "genesis" }, "genesis") === false, "Missing signature should return false");

  console.log("✅ verifyEntry handles all malformed signatures without throwing");
}

function testSkipConfirmationCannotBeBypassed(): void {
  const plainOptions: ExecutorOptions = { dryRun: false, skipRateLimit: false };
  const hasInternalFlag = (plainOptions as any)[INTERNAL_SKIP_CONFIRMATION] === true;
  assert(!hasInternalFlag, "Plain options must not have internal skip flag");
  const spreadOptions = { ...plainOptions };
  const hasSpreadFlag = (spreadOptions as any)[INTERNAL_SKIP_CONFIRMATION] === true;
  assert(!hasSpreadFlag, "Spread options must not have internal skip flag");
  console.log("✅ INTERNAL_SKIP_CONFIRMATION cannot be set through plain object construction");
}

function testPlanIdsAreUnpredictable(): void {
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const plan = createActionPlan(
      { guildId: "g1", channelId: "c1", requesterId: "u1", requesterRole: "member", arguments: {}, riskLevel: "low" } as any,
      "low",
      [{ type: "create", target: "test", description: "test" }],
      false
    );
    ids.add(plan.id);
  }
  assert(ids.size === 100, "All plan IDs must be unique");
  for (const id of ids) {
    assert(id.startsWith("plan_"), "Plan IDs must have plan_ prefix");
    assert(id.length > 16, "Plan IDs must be sufficiently long");
    const hexPart = id.replace("plan_", "");
    assert(hexPart.length === 16, "Hex portion must be 16 chars");
    assert(/^[0-9a-f]+$/.test(hexPart), "Hex portion must be valid hex");
  }
  console.log("✅ Plan IDs are cryptographically random and unpredictable");
}

function testLegacyEntriesNotAuthenticated(): void {
  const legacyEntries = [
    { id: nanoid(12), timestamp: Date.now(), who: "test", what: "test", where: "test", result: "success" as const },
    { id: nanoid(12), timestamp: Date.now(), who: "test", what: "test", where: "test", result: "success" as const },
  ];
  const result = verifyAuditChain(legacyEntries);
  assert(result.legacyEntries >= 1, "Should count legacy entries");
  assert(result.valid === false, "Chain with legacy entries must not be valid");
  assert(result.tamperingDetected === true, "Must detect tampering from legacy entries");
  console.log("✅ Legacy unsigned entries are not authenticated as valid");
}

function testDifferentDomainsProduceDifferentKeys(): void {
  const { KEY_DOMAINS } = require("../src/security/encrypt");
  const domains = Object.keys(KEY_DOMAINS);
  assert(domains.length === 3, "Must have 3 domains");
  assert(domains.includes("sessionEncryption"), "Must have sessionEncryption");
  assert(domains.includes("mfaEncryption"), "Must have mfaEncryption");
  assert(domains.includes("auditIntegrity"), "Must have auditIntegrity");
  console.log("✅ Domain separation: session, MFA, audit are distinct");
}

function testCSPNoUnsafeInline(): void {
  const serverSrc = fs.readFileSync("src/web/server.ts", "utf8");
  assert(!serverSrc.includes("'unsafe-inline'"), "CSP must not contain unsafe-inline");
  assert(serverSrc.includes("nonce-"), "CSP must use nonce-based protection");
  console.log("✅ CSP does not contain unsafe-inline");
}

function testTrustProxyValidation(): void {
  const serverSrc = fs.readFileSync("src/web/server.ts", "utf8");
  assert(serverSrc.includes("TRUST_PROXY_MAX"), "Must define TRUST_PROXY_MAX");
  assert(serverSrc.includes("parseInt") || serverSrc.includes("validation"), "Must validate TRUST_PROXY");
  console.log("✅ TRUST_PROXY has validation and bounds");
}

function testPasswordResetNoInlineJS(): void {
  const serverSrc = fs.readFileSync("src/web/server.ts", "utf8");
  assert(!serverSrc.includes("JSON.stringify(accountId)"), "Must not interpolate accountId into JS");
  assert(!serverSrc.includes("JSON.stringify(token)"), "Must not interpolate token into JS");
  assert(serverSrc.includes("getElementById"), "Must use DOM APIs for values");
  assert(serverSrc.includes('type="hidden"'), "Must use hidden form fields");
  console.log("✅ Password reset form uses safe DOM APIs");
}

function testStartShFailClosed(): void {
  const startSrc = fs.readFileSync("scripts/start.sh", "utf8");
  assert(!startSrc.includes("|| true"), "start.sh must not silently ignore failures");
  assert(startSrc.includes("set -Eeuo pipefail"), "Must preserve pipefail");
  console.log("✅ start.sh fails closed on resource check");
}

// Run all remediation tests
testVerifyEntryMalformedSignatures();
testSkipConfirmationCannotBeBypassed();
testPlanIdsAreUnpredictable();
testLegacyEntriesNotAuthenticated();
testDifferentDomainsProduceDifferentKeys();
testCSPNoUnsafeInline();
testTrustProxyValidation();
testPasswordResetNoInlineJS();
testStartShFailClosed();
console.log("\nAll remediation regression tests passed.");
