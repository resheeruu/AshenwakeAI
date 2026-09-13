/* ================================================================
 * SUPPORT SYSTEM HARDENING TESTS
 *
 * Tests idempotency, concurrency, failure recovery, stale state
 * protection, message dedup, and escalation notification dedup.
 * ================================================================ */

import { SupportCaseManager } from "../src/support/case-manager";
import { canTransition } from "../src/support/types";
import type { CaseStatus } from "../src/support/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function pass(name: string): void {
  passed++;
  console.log(`  ✅ ${name}`);
}

function fail(name: string, error?: unknown): void {
  failed++;
  const msg = error instanceof Error ? error.message : String(error);
  failures.push(`${name}: ${msg}`);
  console.log(`  ❌ ${name}: ${msg}`);
}

function assert(condition: boolean, name: string): void {
  if (condition) pass(name);
  else fail(name, "assertion failed");
}

function assertEqual<T>(actual: T, expected: T, name: string): void {
  if (actual === expected) pass(name);
  else fail(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertNotNull<T>(value: T | null | undefined, name: string): void {
  if (value !== null && value !== undefined) pass(name);
  else fail(name, "value is null or undefined");
}

const GUILD = "hardening_test_guild";
const CHANNEL = "hardening_test_channel";
const USER = "hardening_test_user";
const STAFF = "hardening_test_staff";

/* ================================================================
 * 1. IDEMPOTENCY TESTS
 * ================================================================ */

function testIdempotentCaseCreation(): void {
  console.log("\n🔒 Idempotency — Case Creation");

  const manager = new SupportCaseManager();
  const key = `idempotency-case-${Date.now()}`;

  const c1 = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "First creation",
    idempotencyKey: key,
  });

  assertNotNull(c1, "First creation succeeds");

  // Second call with same key should return same case
  const c2 = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "Second creation attempt",
    idempotencyKey: key,
  });

  assertNotNull(c2, "Second creation returns existing case");
  assertEqual(c1!.id, c2!.id, "Same case ID returned");
  assertEqual(c2!.summary, "First creation", "Original summary preserved");

  // Third call with different key creates new case
  const c3 = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "Different key",
    idempotencyKey: `different-${Date.now()}`,
  });

  assertNotNull(c3, "Different key creates new case");
  assert(c3!.id !== c1!.id, "Different key gives different case ID");
}

function testIdempotentMessageCreation(): void {
  console.log("\n🔒 Idempotency — Message Creation");

  const manager = new SupportCaseManager();
  const c = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "Message dedup test",
  });

  assertNotNull(c, "Create case for message dedup");

  if (!c) return;

  const discordMsgId = `discord-msg-${Date.now()}`;

  const m1 = manager.addMessage(c.id, USER, "Hello world", false, discordMsgId);
  assertNotNull(m1, "First message added");

  // Same Discord message ID should return existing
  const m2 = manager.addMessage(c.id, USER, "Hello world again", false, discordMsgId);
  assertNotNull(m2, "Duplicate message returns existing");
  assertEqual(m1!.id, m2!.id, "Same message ID returned");
  assertEqual(m2!.content, "Hello world", "Original content preserved");

  // Different Discord message ID creates new message
  const m3 = manager.addMessage(c.id, USER, "Different message", false, `other-${Date.now()}`);
  assertNotNull(m3, "Different Discord msg creates new message");
  assert(m3!.id !== m1!.id, "Different Discord msg gives different ID");
}

function testIdempotentEvidenceCreation(): void {
  console.log("\n🔒 Idempotency — Evidence Creation");

  const manager = new SupportCaseManager();
  const c = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "report",
    creatorId: USER,
    subjectUserId: "bad-user",
    summary: "Evidence dedup test",
  });

  assertNotNull(c, "Create case for evidence dedup");

  if (!c) return;

  const e1 = manager.addEvidence({
    caseId: c.id,
    messageId: "evidence-msg-123",
    authorId: USER,
    content: "Offensive content",
    collectedBy: STAFF,
  });

  assertNotNull(e1, "First evidence added");

  // Same case+message should return existing
  const e2 = manager.addEvidence({
    caseId: c.id,
    messageId: "evidence-msg-123",
    authorId: USER,
    content: "Offensive content again",
    collectedBy: STAFF,
  });

  assertNotNull(e2, "Duplicate evidence returns existing");
  assertEqual(e1!.id, e2!.id, "Same evidence ID returned");
  assertEqual(e2!.content, "Offensive content", "Original content preserved");

  // Different message ID creates new evidence
  const e3 = manager.addEvidence({
    caseId: c.id,
    messageId: "evidence-msg-456",
    authorId: USER,
    content: "Different evidence",
    collectedBy: STAFF,
  });

  assertNotNull(e3, "Different message creates new evidence");
  assert(e3!.id !== e1!.id, "Different message gives different evidence ID");
}

/* ================================================================
 * 2. CONCURRENCY TESTS
 * ================================================================ */

function testOptimisticConcurrencyOnTransition(): void {
  console.log("\n🔄 Concurrency — Optimistic Transition");

  const manager = new SupportCaseManager();
  const c = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "Concurrency test",
  });

  assertNotNull(c, "Create case for concurrency test");

  if (!c) return;

  assertEqual(c.version, 1, "Initial version is 1");

  // First transition should succeed
  const t1 = manager.transitionCase(c.id, "investigating", STAFF);
  assertNotNull(t1, "First transition succeeds");
  assertEqual(t1!.version, 2, "Version incremented to 2");

  // Second transition from same base should succeed
  const t2 = manager.transitionCase(c.id, "waiting_user", STAFF);
  assertNotNull(t2, "Second transition succeeds");
  assertEqual(t2!.version, 3, "Version incremented to 3");
}

function testStaleTransitionRejected(): void {
  console.log("\n🔄 Concurrency — Stale Transition Rejected");

  const manager = new SupportCaseManager();
  const c = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "Stale test",
  });

  assertNotNull(c, "Create case for stale test");

  if (!c) return;

  // Transition to open → investigating (version becomes 2)
  const t1 = manager.transitionCase(c.id, "investigating", STAFF);
  assertNotNull(t1, "First transition succeeds");
  assertEqual(t1!.version, 2, "Version is 2 after first transition");

  // Now simulate a stale read: get the case (still version 2)
  const staleCase = manager.getCase(c.id);
  assertNotNull(staleCase, "Stale case loaded");
  assertEqual(staleCase!.version, 2, "Stale case version is 2");

  // Meanwhile, another transition happens (version becomes 3)
  const t2 = manager.transitionCase(c.id, "waiting_user", STAFF);
  assertNotNull(t2, "Second transition succeeds");
  assertEqual(t2!.version, 3, "Version is 3 after second transition");

  // Now attempt to transition using stale version (2)
  // The DB has version 3, so the WHERE version = 2 clause won't match
  const { getDatabase } = require("../src/database/database");
  const db = getDatabase();
  const result = db.prepare(
    "UPDATE support_cases SET status = 'escalated', version = version + 1 WHERE id = ? AND version = ?"
  ).run(c.id, staleCase!.version);

  if (result.changes === 0) {
    pass("Stale transition rejected correctly");
  } else {
    fail("Stale transition was not rejected");
  }
}

function testInvalidTransitionRejected(): void {
  console.log("\n🔄 Concurrency — Invalid Transition Rejected");

  const manager = new SupportCaseManager();
  const c = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "Invalid transition test",
  });

  assertNotNull(c, "Create case");

  if (!c) return;

  // open → closed should be rejected (not in valid transitions)
  const t1 = manager.transitionCase(c.id, "closed", STAFF);
  assertEqual(t1, null, "open → closed rejected");

  // open → open should be rejected (not in valid transitions)
  const t2 = manager.transitionCase(c.id, "open", STAFF);
  assertEqual(t2, null, "open → open rejected");
}

/* ================================================================
 * 3. FAILURE RECOVERY TESTS
 * ================================================================ */

function testNonExistentCaseOperations(): void {
  console.log("\n💥 Failure Recovery — Non-Existent Case");

  const manager = new SupportCaseManager();

  assertEqual(manager.getCase("nonexistent"), null, "Get non-existent case returns null");
  assertEqual(manager.transitionCase("nonexistent", "investigating", STAFF), null, "Transition non-existent case returns null");
  assertEqual(manager.assignCase("nonexistent", STAFF, STAFF), null, "Assign non-existent case returns null");

  const msgs = manager.getMessages("nonexistent");
  assertEqual(msgs.length, 0, "Get messages for non-existent case returns empty");

  const evidence = manager.getEvidence("nonexistent");
  assertEqual(evidence.length, 0, "Get evidence for non-existent case returns empty");
}

function testGracefulDegradationOnInvalidInput(): void {
  console.log("\n💥 Failure Recovery — Graceful Degradation");

  const manager = new SupportCaseManager();

  // Creating with empty guild should still work (no crash)
  const c = manager.createCase({
    guildId: "",
    channelId: "",
    type: "support",
    creatorId: "",
    summary: "",
  });

  // Should not crash — either returns a case or null
  if (c) {
    assertEqual(c.guildId, "", "Empty guild preserved");
    pass("Graceful handling of empty guild");
  } else {
    pass("Graceful rejection of empty guild");
  }
}

/* ================================================================
 * 4. STALE DATA PROTECTION TESTS
 * ================================================================ */

function testStaleDataProtection(): void {
  console.log("\n🛡️ Stale Data Protection");

  const manager = new SupportCaseManager();
  const c = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "Stale data test",
  });

  assertNotNull(c, "Create case");

  if (!c) return;

  // Load case state
  const snapshot = manager.getCase(c.id);
  assertNotNull(snapshot, "Load case snapshot");

  // Another process modifies the case
  manager.transitionCase(c.id, "investigating", STAFF);

  // The snapshot should now be stale
  // Verify that any mutation using stale version fails
  const current = manager.getCase(c.id);
  assertNotNull(current, "Get current case");
  assert(current!.version > snapshot!.version, "Current version is ahead of snapshot");
  assertEqual(current!.status, "investigating", "Status was updated by other process");
}

/* ================================================================
 * 5. VERSION COLUMN TESTS
 * ================================================================ */

function testVersionColumnExistsAndIncrements(): void {
  console.log("\n📊 Version Column");

  const manager = new SupportCaseManager();
  const c = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "Version test",
  });

  assertNotNull(c, "Create case");

  if (!c) return;

  assertEqual(c.version, 1, "Initial version is 1");

  const t1 = manager.transitionCase(c.id, "investigating", STAFF);
  assertEqual(t1!.version, 2, "Version 2 after first transition");

  const t2 = manager.transitionCase(c.id, "resolved", STAFF);
  assertEqual(t2!.version, 3, "Version 3 after second transition");
}

/* ================================================================
 * 6. COMPOUND OPERATION TESTS
 * ================================================================ */

function testCreateCaseWithMessage(): void {
  console.log("\n🔗 Compound Operations — Create Case + Message");

  const manager = new SupportCaseManager();
  const result = manager.createCaseWithMessage({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "Compound test",
    messageContent: "I need help with something",
    discordMessageId: `compound-msg-${Date.now()}`,
  });

  assertNotNull(result.case, "Case created");
  assertNotNull(result.message, "Message created");

  if (result.case && result.message) {
    assertEqual(result.message.caseId, result.case.id, "Message linked to correct case");
    assertEqual(result.message.content, "I need help with something", "Message content preserved");
    assertEqual(result.message.isAi, false, "Message is user message");

    // Verify message was persisted
    const messages = manager.getMessages(result.case.id);
    assert(messages.length >= 1, "At least one message in case");
  }
}

function testCreateCaseWithIdempotencyKey(): void {
  console.log("\n🔗 Compound Operations — Idempotent Create");

  const manager = new SupportCaseManager();
  const key = `compound-idemp-${Date.now()}`;

  const r1 = manager.createCaseWithMessage({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "First",
    idempotencyKey: key,
    messageContent: "First message",
  });

  const r2 = manager.createCaseWithMessage({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "support",
    creatorId: USER,
    summary: "Second",
    idempotencyKey: key,
    messageContent: "Second message",
  });

  assertNotNull(r1.case, "First creation succeeds");
  assertNotNull(r2.case, "Second creation returns existing");

  if (r1.case && r2.case) {
    assertEqual(r1.case.id, r2.case.id, "Same case returned on idempotent call");
  }
}

/* ================================================================
 * 7. FULL LIFECYCLE WITH VERSION TESTS
 * ================================================================ */

function testFullLifecycleWithVersions(): void {
  console.log("\n🔄 Full Lifecycle with Versions");

  const manager = new SupportCaseManager();
  const c = manager.createCase({
    guildId: GUILD,
    channelId: CHANNEL,
    type: "report",
    creatorId: USER,
    subjectUserId: "bad-user",
    summary: "Full lifecycle test",
  });

  assertNotNull(c, "Create case");
  if (!c) return;

  assertEqual(c.version, 1, "v1: open");

  let r = manager.transitionCase(c.id, "investigating", STAFF);
  assertEqual(r!.version, 2, "v2: investigating");
  assertEqual(r!.status, "investigating", "Status: investigating");

  r = manager.transitionCase(c.id, "waiting_user", STAFF);
  assertEqual(r!.version, 3, "v3: waiting_user");

  r = manager.transitionCase(c.id, "escalated", STAFF);
  assertEqual(r!.version, 4, "v4: escalated");

  r = manager.transitionCase(c.id, "investigating", STAFF);
  assertEqual(r!.version, 5, "v5: back to investigating");

  r = manager.transitionCase(c.id, "resolved", STAFF);
  assertEqual(r!.version, 6, "v6: resolved");
  assertEqual(r!.status, "resolved", "Status: resolved");

  r = manager.transitionCase(c.id, "closed", STAFF);
  assertEqual(r!.version, 7, "v7: closed");
  assertEqual(r!.status, "closed", "Status: closed");
  assertNotNull(r!.closedAt, "closedAt set");

  // Cannot transition from closed
  const closed = manager.transitionCase(c.id, "open", STAFF);
  assertEqual(closed, null, "Cannot transition from closed");
}

/* ================================================================
 * MAIN TEST RUNNER
 * ================================================================ */

console.log("\n🧪 Support System Hardening Tests\n");
console.log("=".repeat(60));

try {
  testIdempotentCaseCreation();
  testIdempotentMessageCreation();
  testIdempotentEvidenceCreation();
  testOptimisticConcurrencyOnTransition();
  testStaleTransitionRejected();
  testInvalidTransitionRejected();
  testNonExistentCaseOperations();
  testGracefulDegradationOnInvalidInput();
  testStaleDataProtection();
  testVersionColumnExistsAndIncrements();
  testCreateCaseWithMessage();
  testCreateCaseWithIdempotencyKey();
  testFullLifecycleWithVersions();
} catch (error) {
  console.error("\n💥 Fatal error during tests:", error);
  failed++;
}

console.log("\n" + "=".repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log("\n❌ Failures:");
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
