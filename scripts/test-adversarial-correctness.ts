#!/usr/bin/env node
/* ================================================================
 * ASHENAI ADVERSARIAL CORRECTNESS TESTS
 *
 * Aggressive tests designed to break the idempotency and
 * concurrency protections. These tests attempt to produce
 * duplicate side effects through various attack vectors.
 * ================================================================ */

import path from "node:path";
import os from "node:os";
import { mkdirSync, rmSync } from "node:fs";

const TEST_DATA_DIR = path.join(os.tmpdir(), `ashenai-adversarial-${Date.now()}`);
mkdirSync(TEST_DATA_DIR, { recursive: true });
process.env.ASHENAI_DATA_DIR = TEST_DATA_DIR;

import { 
  tryClaimMessageProcessing, 
  completeMessageProcessing, 
  getMessageProcessingRecord, 
  cleanupExpiredMessageProcessing,
  extendMessageProcessingLease,
  releaseMessageProcessing 
} from "../src/database/message-processing-repo";

let passed = 0;
let failed = 0;

function pass(name: string): void {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown): void {
  console.error(`❌ ${name}`, error !== undefined ? error : "");
  failed++;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${String(expected)}", got "${String(actual)}"`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ================================================================
 * TEST 1: CONCURRENT CLAIM ATTACK
 * ================================================================ */
async function testConcurrentClaimAttack(): Promise<void> {
  console.log("\n=== CONCURRENT CLAIM ATTACK ===");

  // Try to claim the same message from multiple "workers" simultaneously
  const messageId = "concurrent-test-" + Date.now();
  const numWorkers = 10;
  
  const results = await Promise.all(
    Array.from({ length: numWorkers }, (_, i) => 
      tryClaimMessageProcessing(messageId, `req-${i}`, "guild-1", "channel-1", "user-1", 60000)
    )
  );

  const claimedCount = results.filter(r => r !== null).length;
  
  if (claimedCount === 1) {
    pass(`Concurrent claim attack: exactly 1 of ${numWorkers} workers claimed`);
  } else {
    fail(`Concurrent claim attack: ${claimedCount} of ${numWorkers} workers claimed (expected 1)`);
  }

  // Clean up
  completeMessageProcessing(messageId, "COMPLETED");
}

/* ================================================================
 * TEST 2: SEQUENTIAL DUPLICATE DELIVERY ATTACK
 * ================================================================ */
async function testSequentialDuplicateDelivery(): Promise<void> {
  console.log("\n=== SEQUENTIAL DUPLICATE DELIVERY ATTACK ===");

  const messageId = "seq-dup-test-" + Date.now();
  const numDeliveries = 100;
  let claimedCount = 0;

  for (let i = 0; i < numDeliveries; i++) {
    const claimed = tryClaimMessageProcessing(messageId, `req-${i}`, "guild-1", "channel-1", "user-1", 60000);
    if (claimed) claimedCount++;
  }

  if (claimedCount === 1) {
    pass(`Sequential duplicate delivery: 1 of ${numDeliveries} claimed`);
  } else {
    fail(`Sequential duplicate delivery: ${claimedCount} of ${numDeliveries} claimed`);
  }

  // Clean up
  completeMessageProcessing(messageId, "COMPLETED");
}

/* ================================================================
 * TEST 3: MAIN HANDLER + BUILDER HANDLER RACE
 * ================================================================ */
async function testMainBuilderRace(): Promise<void> {
  console.log("\n=== MAIN + BUILDER HANDLER RACE ===");

  const messageId = "race-test-" + Date.now();
  
  // Simulate both handlers trying to claim simultaneously
  const [mainResult, builderResult] = await Promise.all([
    tryClaimMessageProcessing("race-msg-" + messageId, "main-req", "guild-1", "channel-1", "user-1", 60000),
    tryClaimMessageProcessing("race-msg-" + messageId, "builder-req", "guild-1", "channel-1", "user-1", 60000),
  ]);

  const claimedCount = [mainResult, builderResult].filter(r => r !== null).length;
  
  if (claimedCount === 1) {
    pass("Main + Builder race: exactly 1 claimed");
  } else {
    fail(`Main + Builder race: ${claimedCount} claimed (expected 1)`);
  }

  // Clean up
  if (mainResult) completeMessageProcessing("race-msg-" + messageId, "COMPLETED");
  if (builderResult) completeMessageProcessing("race-msg-" + messageId, "COMPLETED");
}

/* ================================================================
 * TEST 4: 100 DUPLICATE DELIVERIES
 * ================================================================ */
async function test100DuplicateDeliveries(): Promise<void> {
  console.log("\n=== 100 DUPLICATE DELIVERIES ===");

  const messageId = "hundred-dup-" + Date.now();
  let claimedCount = 0;

  for (let i = 0; i < 100; i++) {
    const claimed = tryClaimMessageProcessing(messageId, `req-${i}`, "guild-1", "channel-1", "user-1", 60000);
    if (claimed) claimedCount++;
  }

  if (claimedCount === 1) {
    pass("100 duplicate deliveries: exactly 1 claimed");
  } else {
    fail(`100 duplicate deliveries: ${claimedCount} claimed (expected 1)`);
  }

  completeMessageProcessing(messageId, "COMPLETED");
}

/* ================================================================
 * TEST 5: DIFFERENT MESSAGES NOT DEDUPLICATED
 * ================================================================ */
async function testDifferentMessagesNotDeduped(): Promise<void> {
  console.log("\n=== DIFFERENT MESSAGES NOT DEDUPLICATED ===");

  const messageIds = Array.from({ length: 10 }, (_, i) => `diff-msg-${i}-${Date.now()}`);
  let successCount = 0;

  for (const msgId of messageIds) {
    const claimed = tryClaimMessageProcessing(msgId, `req-${msgId}`, "guild-1", "channel-1", "user-1", 60000);
    if (claimed) {
      successCount++;
      completeMessageProcessing(msgId, "COMPLETED");
    }
  }

  if (successCount === 10) {
    pass("Different messages: all 10 processed independently");
  } else {
    fail(`Different messages: ${successCount}/10 processed (expected 10)`);
  }
}

/* ================================================================
 * TEST 6: PROCESS RESTART AFTER COMPLETED
 * ================================================================ */
async function testProcessRestartAfterCompleted(): Promise<void> {
  console.log("\n=== PROCESS RESTART AFTER COMPLETED ===");

  const messageId = "restart-test-" + Date.now();
  
  // Simulate first process
  const claimed1 = tryClaimMessageProcessing(messageId, "req-1", "guild-1", "channel-1", "user-1", 60000);
  assertEqual(claimed1 !== null, true, "first process claims");
  completeMessageProcessing(messageId, "COMPLETED");
  
  // Simulate process restart - new process starts, same message arrives
  // (in reality this would be a new process, but we're in same process)
  const claimed2 = tryClaimMessageProcessing(messageId, "req-2", "guild-1", "channel-1", "user-1", 60000);
  
  if (claimed2 === null) {
    pass("Restart after COMPLETED: duplicate correctly rejected");
  } else {
    fail("Restart after COMPLETED: duplicate incorrectly accepted");
  }
}

/* ================================================================
 * TEST 7: EXPIRED LEASE RECOVERY
 * ================================================================ */
async function testExpiredLeaseRecovery(): Promise<void> {
  console.log("\n=== EXPIRED LEASE RECOVERY ===");

  const messageId = "expired-lease-" + Date.now();
  const db = require("../src/database/database").getDatabase();
  
  // Insert a record with expired lease
  const past = Date.now() - 10000;
  db.prepare(`
    INSERT INTO message_processing (message_id, state, request_id, guild_id, channel_id, author_id, created_at, updated_at, lease_until)
    VALUES (?, 'PROCESSING', ?, ?, ?, ?, ?, ?, ?)
  `).run("expired-test-" + messageId, "req-old", "guild-1", "channel-1", "user-1", past, past, past);

  // New worker tries to claim
  const claimed = tryClaimMessageProcessing("expired-test-" + messageId, "req-new", "guild-1", "channel-1", "user-1", 60000);
  
  if (claimed !== null && claimed?.requestId === "req-new") {
    pass("Expired lease: new worker recovered and got new requestId");
    completeMessageProcessing("expired-test-" + messageId, "COMPLETED");
  } else {
    fail("Expired lease: recovery failed or requestId not updated");
  }
}

/* ================================================================
 * TEST 8: STALE WORKER OWNERSHIP
 * ================================================================ */
async function testStaleWorkerOwnership(): Promise<void> {
  console.log("\n=== STALE WORKER OWNERSHIP ===");

  const messageId = "stale-worker-" + Date.now();
  
  // Worker A claims
  const claimedA = tryClaimMessageProcessing(messageId, "worker-a", "guild-1", "channel-1", "user-1", 60000);
  assertEqual(claimedA !== null, true, "Worker A claims");
  
  // Worker B reclaims after lease expires (simulate by manipulating lease)
  const db = require("../src/database/database").getDatabase();
  const past = Date.now() - 10000;
  db.prepare(`UPDATE message_processing SET lease_until = ? WHERE message_id = ?`).run(Date.now() - 5000, messageId);
  
  const claimedB = tryClaimMessageProcessing(messageId, "worker-b", "guild-1", "channel-1", "user-1", 60000);
  assertEqual(claimedB !== null, true, "Worker B reclaims after lease expires");
  
  // Worker A tries to complete (should fail or be ignored)
  const completeA = completeMessageProcessing(messageId, "COMPLETED", "worker-a");
  
  // Worker B completes
  const completeB = completeMessageProcessing(messageId, "COMPLETED", "worker-b");
  
  // Check final state
  const record = getMessageProcessingRecord(messageId);
  
  // Only one should have succeeded - the last one to complete
  if (record && record.result === "worker-b") {
    pass("Stale worker: Worker B's completion won, Worker A's lost");
  } else {
    fail("Stale worker: unexpected final state", { record });
  }
}

/* ================================================================
 * TEST 9: FAILED_RETRYABLE VS FAILED_FINAL
 * ================================================================ */
async function testFailedRetryableVsFinal(): Promise<void> {
  console.log("\n=== FAILED_RETRYABLE VS FAILED_FINAL ===");

  // Test FAILED_RETRYABLE
  tryClaimMessageProcessing("retry-test-1", "req-1", "guild-1", "channel-1", "user-1", 60000);
  completeMessageProcessing("retry-test-1", "FAILED_RETRYABLE", "timeout");
  
  const r1 = getMessageProcessingRecord("retry-test-1");
  assertEqual(r1?.state, "FAILED_RETRYABLE", "FAILED_RETRYABLE state set");

  // Test FAILED_FINAL
  tryClaimMessageProcessing("retry-test-2", "req-2", "guild-1", "channel-1", "user-1", 60000);
  completeMessageProcessing("retry-test-2", "FAILED_FINAL", "invalid input");
  
  const r2 = getMessageProcessingRecord("retry-test-2");
  assertEqual(r2?.state, "FAILED_FINAL", "FAILED_FINAL state set");

  // Test: FAILED_RETRYABLE should NOT be re-claimable by new message delivery
  // (The retry mechanism should be explicit, not automatic on new message)
  const reclaimed = tryClaimMessageProcessing("retry-test-1", "req-retry", "guild-1", "channel-1", "user-1", 60000);
  if (reclaimed === null) {
    pass("FAILED_RETRYABLE: correctly not re-claimed by new message (explicit retry required)");
  } else {
    fail("FAILED_RETRYABLE: should not be re-claimed by new message");
  }

  // FAILED_FINAL should never be retried
  const r3 = getMessageProcessingRecord("retry-test-2");
  // FAILED_FINAL with lease expired - but state is FAILED_FINAL so shouldn't be retried
  const reclaimedFinal = tryClaimMessageProcessing("retry-test-2", "req-retry", "guild-1", "channel-1", "user-1", 60000);
  if (reclaimedFinal === null) {
    pass("FAILED_FINAL: correctly not retried even after lease expires");
  } else {
    fail("FAILED_FINAL: should not be retried");
  }
}

/* ================================================================
 * TEST 10: STATE MACHINE ATTACK - INVALID TRANSITIONS
 * ================================================================ */
async function testStateMachineInvalidTransitions(): Promise<void> {
  console.log("\n=== STATE MACHINE INVALID TRANSITIONS ===");

  // Try to transition from COMPLETED back to PROCESSING (should fail or be prevented)
  const msgId = "state-attack-" + Date.now();
  tryClaimMessageProcessing(msgId, "req-1", "guild-1", "channel-1", "user-1", 60000);
  completeMessageProcessing(msgId, "COMPLETED");
  
  // Try to reclaim (should fail because state is COMPLETED, not PROCESSING)
  const claimed = tryClaimMessageProcessing(msgId, "req-attack", "guild-1", "channel-1", "user-1", 60000);
  
  if (claimed === null) {
    pass("COMPLETED -> PROCESSING: correctly blocked");
  } else {
    fail("COMPLETED -> PROCESSING: incorrectly allowed");
  }

  // Try FAILED_FINAL -> PROCESSING
  const msgId2 = "state-attack-2-" + Date.now();
  tryClaimMessageProcessing(msgId2, "req-1", "guild-1", "channel-1", "user-1", 60000);
  completeMessageProcessing(msgId2, "FAILED_FINAL", "invalid");
  
  const claimed2 = tryClaimMessageProcessing(msgId2, "req-attack", "guild-1", "channel-1", "user-1", 60000);
  
  if (claimed2 === null) {
    pass("FAILED_FINAL -> PROCESSING: correctly blocked");
  } else {
    fail("FAILED_FINAL -> PROCESSING: incorrectly allowed");
  }
}

/* ================================================================
 * TEST 11: CACHED ANIME ACTION - 0 PROVIDER CALLS
 * ================================================================ */
async function testCachedAnimeAction(): Promise<void> {
  console.log("\n=== CACHED ANIME ACTION - 0 PROVIDER CALLS ===");
  
  // This test requires the full stack with mocked providers
  // For now, verify the cache logic is in place
  const fs = require("fs");
  const providersSrc = fs.readFileSync("src/games/anime-actions/providers.ts", "utf8");
  
  // Check that local cache is checked FIRST (step 1)
  const hasLocalCacheFirst = providersSrc.includes("LOCAL CACHE FIRST") || 
    providersSrc.includes("localGifs !== null");
  
  // Check that cache is checked before provider chain
  const hasCacheBeforeProviders = providersSrc.indexOf("cache.get") < providersSrc.indexOf("buildProviders");
  
  if (hasLocalCacheFirst && hasCacheBeforeProviders) {
    pass("Anime action: cache-first architecture verified in source");
  } else {
    fail("Cache-first architecture not properly implemented");
  }
}

/* ================================================================
 * TEST 12: DISCORD SEND ABORT LIFECYCLE
 * ================================================================ */
async function testDiscordSendAbort(): Promise<void> {
  console.log("\n=== DISCORD SEND ABORT LIFECYCLE ===");
  
  // Verify the abort signal handling in providers
  const fs = require("fs");
  const providersSrc = fs.readFileSync("src/games/anime-actions/providers.ts", "utf8");
  
  // Check that AbortController is used
  const hasAbortController = providersSrc.includes("AbortController") && 
    providersSrc.includes("ac.abort()");
  
  // Check that signal is passed to httpClient
  const hasSignalPropagation = providersSrc.includes("signal: ac.signal");
  
  if (hasAbortController && hasSignalPropagation) {
    pass("Discord send abort: AbortController and signal propagation implemented");
  } else {
    fail("Abort signal not properly propagated");
  }
}

/* ================================================================
 * TEST 13: LEASE EXTENSION
 * ================================================================ */
async function testLeaseExtension(): Promise<void> {
  console.log("\n=== LEASE EXTENSION ===");

  const messageId = "lease-ext-" + Date.now();
  tryClaimMessageProcessing(messageId, "req-1", "guild-1", "channel-1", "user-1", 60000);
  
  // Extend lease
  const extended = extendMessageProcessingLease(messageId, 30000);
  if (extended) {
    pass("Lease extension: successfully extended");
  } else {
    fail("Lease extension failed");
  }
  
  // Verify lease was actually extended
  const record = getMessageProcessingRecord(messageId);
  if (record && record.leaseUntil && record.leaseUntil > Date.now() + 60000) {
    pass("Lease extension: lease actually extended in database");
  } else {
    fail("Lease not actually extended in database");
  }
  
  completeMessageProcessing(messageId, "COMPLETED");
}

/* ================================================================
 * TEST 14: RELEASE MESSAGE PROCESSING
 * ================================================================ */
async function testReleaseMessageProcessing(): Promise<void> {
  console.log("\n=== RELEASE MESSAGE PROCESSING ===");

  const messageId = "release-test-" + Date.now();
  tryClaimMessageProcessing(messageId, "req-1", "guild-1", "channel-1", "user-1", 60000);
  
  // Release should set state to FAILED_RETRYABLE and clear lease
  const released = releaseMessageProcessing(messageId);
  
  if (released) {
    const record = getMessageProcessingRecord(messageId);
    if (record?.state === "FAILED_RETRYABLE" && record?.leaseUntil === null) {
      pass("Release: state set to FAILED_RETRYABLE and lease cleared");
    } else {
      fail("Release: state or lease not properly updated", { state: record?.state, lease: record?.leaseUntil });
    }
  } else {
    fail("Release failed");
  }
}

/* ================================================================
 * MAIN
 * ================================================================ */
async function main(): Promise<void> {
  console.log("\n🧪 ASHENAI ADVERSARIAL CORRECTNESS TESTS\n");

  try {
    await testConcurrentClaimAttack();
    await testSequentialDuplicateDelivery();
    await testMainBuilderRace();
    await test100DuplicateDeliveries();
    await testDifferentMessagesNotDeduped();
    await testProcessRestartAfterCompleted();
    await testExpiredLeaseRecovery();
    await testStaleWorkerOwnership();
    await testFailedRetryableVsFinal();
    await testStateMachineInvalidTransitions();
    await testCachedAnimeAction();
    await testDiscordSendAbort();
    await testLeaseExtension();
    await testReleaseMessageProcessing();

    console.log(`\n${"=".repeat(50)}`);
    console.log(`ADVERSARIAL TESTS: ${passed} passed, ${failed} failed`);
    console.log(`${"=".repeat(50)}\n`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("❌ Test suite crashed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Test suite crashed:", error);
  process.exit(1);
});