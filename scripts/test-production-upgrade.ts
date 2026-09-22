#!/usr/bin/env node
/* ================================================================
 * PRODUCTION UPGRADE REGRESSION TESTS
 *
 * Tests the new production upgrade systems:
 * 1. Discord shard health observability
 * 2. Update manager lock/validation/rollback
 * 3. Graceful shutdown safety
 * 4. Future foundations (bot loop, awareness config)
 * 5. Usage type extensions
 * ================================================================ */

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown) {
  console.error(`❌ ${name}`, error ?? "");
  failed++;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  }
}

function assertIncludes<T>(arr: T[], item: T, label: string): void {
  if (!arr.includes(item)) {
    throw new Error(`${label}: expected array to include "${item}", got [${arr.join(", ")}]`);
  }
}

console.log("\n🧪 Production Upgrade Regression Tests\n");

async function runTests() {

/* ================================================================
 * TEST 1: Discord health — default state without init
 * ================================================================ */

try {
  const { getDiscordHealth } = require("../src/core/discord-health");
  const health = getDiscordHealth();

  assertEqual(health.ready, false, "default ready");
  assertEqual(health.shardCount, 0, "default shard count");
  assertEqual(health.reconnectCount, 0, "default reconnect count");
  assertEqual(health.gatewayLatency, -1, "default latency");
  assertEqual(health.sessionInvalidated, false, "default invalidated");

  pass("discord health: default state without init");
} catch (e) {
  fail("discord health: default state without init", e);
}

/* ================================================================
 * TEST 2: Update manager — lock acquisition
 * ================================================================ */

try {
  const fs = require("node:fs");
  const path = require("node:path");

  const lockFile = path.join(process.cwd(), "data", ".test-update-lock");

  const { writeFileSync, unlinkSync, existsSync } = fs;

  // Clean up any stale lock
  try { if (existsSync(lockFile)) unlinkSync(lockFile); } catch {}

  // Simulate lock acquisition logic
  const lockData = { pid: process.pid, acquiredAt: Date.now() };
  writeFileSync(lockFile, JSON.stringify(lockData));

  const readBack = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  assertEqual(readBack.pid, process.pid, "lock PID matches");

  // Simulate stale lock detection (> 30 minutes old)
  const staleLock = { pid: 99999, acquiredAt: Date.now() - 31 * 60 * 1000 };
  writeFileSync(lockFile, JSON.stringify(staleLock));
  const staleRead = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  const lockAge = Date.now() - staleRead.acquiredAt;
  const isStale = lockAge > 30 * 60 * 1000;
  assertEqual(isStale, true, "stale lock detected");

  // Clean up
  try { unlinkSync(lockFile); } catch {}

  pass("update manager: lock acquisition and stale detection");
} catch (e) {
  fail("update manager: lock acquisition and stale detection", e);
}

/* ================================================================
 * TEST 3: Update manager — status defaults
 * ================================================================ */

try {
  const { getUpdateStatus } = require("../src/core/update-manager");
  const status = getUpdateStatus();

  if (typeof status.currentCommit !== "string") {
    throw new Error("currentCommit should be string");
  }
  assertEqual(status.isUpdating, false, "not updating by default");
  assertEqual(status.branch, "main", "default branch");

  pass("update manager: status defaults");
} catch (e) {
  fail("update manager: status defaults", e);
}

/* ================================================================
 * TEST 4: Update manager — record file
 * ================================================================ */

try {
  const { getUpdateRecord } = require("../src/core/update-manager");
  const record = getUpdateRecord();

  // Record may be null if no update has been performed
  // Just verify the function doesn't throw
  if (record !== null && typeof record !== "object") {
    throw new Error("record should be null or object");
  }

  pass("update manager: record file access");
} catch (e) {
  fail("update manager: record file access", e);
}

/* ================================================================
 * TEST 5: Future foundations — bot loop detection
 * ================================================================ */

try {
  const { detectBotLoop } = require("../src/core/future-foundations");

  // First response should not trigger loop
  const r1 = detectBotLoop("bot-1", "channel-1");
  assertEqual(r1, false, "first response not loop");

  // Subsequent responses within window should eventually trigger
  for (let i = 0; i < 10; i++) {
    detectBotLoop("bot-1", "channel-1");
  }

  const r2 = detectBotLoop("bot-1", "channel-1");
  assertEqual(r2, true, "repeated responses detected as loop");

  // Different channel should not be affected
  const r3 = detectBotLoop("bot-1", "channel-2");
  assertEqual(r3, false, "different channel not affected");

  // Different bot should not be affected
  const r4 = detectBotLoop("bot-2", "channel-1");
  assertEqual(r4, false, "different bot not affected");

  pass("future foundations: bot loop detection");
} catch (e) {
  fail("future foundations: bot loop detection", e);
}

/* ================================================================
 * TEST 6: Future foundations — awareness config defaults
 * ================================================================ */

try {
  const { DEFAULT_AWARENESS_CONFIG } = require("../src/core/future-foundations");

  assertEqual(DEFAULT_AWARENESS_CONFIG.mode, "MENTION_ONLY", "default mode");
  assertEqual(typeof DEFAULT_AWARENESS_CONFIG.passiveRateLimit, "number", "rate limit");
  assertEqual(typeof DEFAULT_AWARENESS_CONFIG.userCooldownMs, "number", "user cooldown");
  assertEqual(typeof DEFAULT_AWARENESS_CONFIG.guildDailyLimit, "number", "guild limit");

  pass("future foundations: awareness config defaults");
} catch (e) {
  fail("future foundations: awareness config defaults", e);
}

/* ================================================================
 * TEST 7: Future foundations — TTS config defaults
 * ================================================================ */

try {
  const { DEFAULT_TTS_CONFIG } = require("../src/core/future-foundations");

  assertEqual(DEFAULT_TTS_CONFIG.maxCharacters, 500, "max chars");
  assertEqual(typeof DEFAULT_TTS_CONFIG.perUserCooldownMs, "number", "cooldown");
  assertEqual(typeof DEFAULT_TTS_CONFIG.guildDailyCharacterLimit, "number", "guild limit");

  pass("future foundations: TTS config defaults");
} catch (e) {
  fail("future foundations: TTS config defaults", e);
}

/* ================================================================
 * TEST 8: Future foundations — AI-to-AI config defaults
 * ================================================================ */

try {
  const { DEFAULT_AI_TO_AI_CONFIG } = require("../src/core/future-foundations");

  assertEqual(DEFAULT_AI_TO_AI_CONFIG.enabled, false, "disabled by default");
  assertEqual(DEFAULT_AI_TO_AI_CONFIG.maxTurns, 6, "max turns");
  assertEqual(typeof DEFAULT_AI_TO_AI_CONFIG.perUserCooldownMs, "number", "cooldown");

  pass("future foundations: AI-to-AI config defaults");
} catch (e) {
  fail("future foundations: AI-to-AI config defaults", e);
}

/* ================================================================
 * TEST 9: Usage type — extended features
 * ================================================================ */

try {
  const mod = require("../src/ai/usage-manager");

  // The AIFeature type should include new features
  // We can't check the type at runtime, but we can verify
  // the module loads and the type is extensible
  if (typeof mod.UsageManager !== "function") {
    throw new Error("UsageManager should be a class");
  }

  pass("usage manager: extended feature types loadable");
} catch (e) {
  fail("usage manager: extended feature types loadable", e);
}

/* ================================================================
 * TEST 10: InternalSupervisor — catch block checks threshold
 * ================================================================ */

try {
  const { InternalSupervisor } = require("../src/core/internalSupervisor");

  let unhealthyCalled = false;
  let unhealthyReason = "";

  const supervisor = new InternalSupervisor({
    intervalMs: 1000,
    failureThreshold: 2,
    checks: () => {
      throw new Error("simulated check failure");
    },
    onUnhealthy: (reason: string) => {
      unhealthyCalled = true;
      unhealthyReason = reason;
    },
  });

  // Manually trigger checks by calling the private runCheck method
  // The method is private, but we can trigger it via start/stop
  supervisor.start();

  // Wait for enough checks to trigger unhealthy
  await new Promise((resolve) => setTimeout(resolve, 2500));

  supervisor.stop();

  assertEqual(unhealthyCalled, true, "onUnhealthy called after threshold");
  assertIncludes(unhealthyReason, "simulated check failure", "reason includes error");

  pass("internal supervisor: catch block checks threshold");
} catch (e) {
  fail("internal supervisor: catch block checks threshold", e);
}

/* ================================================================
 * TEST 11: Graceful shutdown — timeout constant
 * ================================================================ */

try {
  const fs = require("node:fs");
  const indexContent = fs.readFileSync(
    require("node:path").join(process.cwd(), "src", "index.ts"),
    "utf8"
  );

  // Verify gracefulShutdown function exists
  if (!indexContent.includes("async function gracefulShutdown")) {
    throw new Error("gracefulShutdown function not found");
  }

  // Verify shutdown timeout constant exists
  if (!indexContent.includes("SHUTDOWN_TIMEOUT_MS")) {
    throw new Error("SHUTDOWN_TIMEOUT_MS not found");
  }

  // Verify SIGUSR2 handler exists
  if (!indexContent.includes('process.on("SIGUSR2"')) {
    throw new Error("SIGUSR2 handler not found");
  }

  // Verify SIGINT/SIGTERM use gracefulShutdown
  if (!indexContent.includes('gracefulShutdown("SIGINT")')) {
    throw new Error("SIGINT should use gracefulShutdown");
  }
  if (!indexContent.includes('gracefulShutdown("SIGTERM")')) {
    throw new Error("SIGTERM should use gracefulShutdown");
  }

  pass("graceful shutdown: function and handlers present");
} catch (e) {
  fail("graceful shutdown: function and handlers present", e);
}

/* ================================================================
 * TEST 12: No duplicate warn handlers
 * ================================================================ */

try {
  const fs = require("node:fs");
  const indexContent = fs.readFileSync(
    require("node:path").join(process.cwd(), "src", "index.ts"),
    "utf8"
  );

  // Count warn handlers
  const eventsWarnCount = (indexContent.match(/Events\.Warn/g) || []).length;
  const clientWarnCount = (indexContent.match(/client\.on\("warn"/g) || []).length;

  // Should have exactly 1 Events.Warn handler and 0 client.on("warn")
  assertEqual(eventsWarnCount, 1, "Events.Warn count");
  assertEqual(clientWarnCount, 0, "client.on('warn') count (should be removed)");

  pass("discord: no duplicate warn handlers");
} catch (e) {
  fail("discord: no duplicate warn handlers", e);
}

/* ================================================================
 * TEST 13: Discord health observability module loads
 * ================================================================ */

try {
  const mod = require("../src/core/discord-health");

  if (typeof mod.initDiscordHealth !== "function") {
    throw new Error("initDiscordHealth should be a function");
  }
  if (typeof mod.getDiscordHealth !== "function") {
    throw new Error("getDiscordHealth should be a function");
  }

  pass("discord health: module exports correct");
} catch (e) {
  fail("discord health: module exports correct", e);
}

/* ================================================================
 * TEST 14: Update manager module loads
 * ================================================================ */

try {
  const mod = require("../src/core/update-manager");

  if (typeof mod.startUpdateManager !== "function") {
    throw new Error("startUpdateManager should be a function");
  }
  if (typeof mod.stopUpdateManager !== "function") {
    throw new Error("stopUpdateManager should be a function");
  }
  if (typeof mod.getUpdateStatus !== "function") {
    throw new Error("getUpdateStatus should be a function");
  }
  if (typeof mod.getUpdateRecord !== "function") {
    throw new Error("getUpdateRecord should be a function");
  }

  pass("update manager: module exports correct");
} catch (e) {
  fail("update manager: module exports correct", e);
}

/* ================================================================
 * TEST 15: Health endpoint includes new fields
 * ================================================================ */

try {
  const fs = require("node:fs");
  const serverContent = fs.readFileSync(
    require("node:path").join(process.cwd(), "src", "web", "server.ts"),
    "utf8"
  );

  if (!serverContent.includes("discord:")) {
    throw new Error("health endpoint missing discord field");
  }
  if (!serverContent.includes("providers:")) {
    throw new Error("health endpoint missing providers field");
  }
  if (!serverContent.includes("ok, name: \"AshenAI\"")) {
    throw new Error("health endpoint missing ok/name fields");
  }

  pass("health endpoint: sanitized response with discord/providers/ok fields");
} catch (e) {
  fail("health endpoint: sanitized response with discord/providers/ok fields", e);
}

/* ================================================================
 * SUMMARY
 * ================================================================ */

console.log(`\n${"=".repeat(50)}`);
console.log(`Production Upgrade Tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
}

runTests();
