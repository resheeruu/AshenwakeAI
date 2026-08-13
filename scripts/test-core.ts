import { ConversationMemory } from "../src/ai/memory";
import { config } from "../src/config/env";

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

console.log("\n🧪 AshenAI Core Offline Tests\n");

// ─────────────────────────────────────
// CONFIG
// ─────────────────────────────────────

try {
  if (config.ai.timeoutMs > 0) {
    pass("AI timeout configuration");
  } else {
    fail("AI timeout configuration");
  }

  if (config.ai.maxRetries >= 0) {
    pass("AI retry configuration");
  } else {
    fail("AI retry configuration");
  }

  if (config.ai.maxContextMessages >= 2) {
    pass("AI context configuration");
  } else {
    fail("AI context configuration");
  }
} catch (error) {
  fail("Configuration loading", error);
}

// ─────────────────────────────────────
// MEMORY
// ─────────────────────────────────────

try {
  const memory = new ConversationMemory();

  /*
   * Use unique test IDs so persistent conversations from
   * previous bot sessions cannot affect this test.
   */
  const testUser = `__core_test_user_${Date.now()}__`;
  const userA = `__core_test_a_${Date.now()}__`;
  const userB = `__core_test_b_${Date.now()}__`;

  // Clean up in case these IDs somehow already exist.
  memory.reset(testUser);
  memory.reset(userA);
  memory.reset(userB);

  // Save and retrieve
  memory.add(testUser, {
    role: "user",
    content: "Hello",
  });

  const history = memory.get(testUser);

  if (
    history.length === 1 &&
    history[0].content === "Hello"
  ) {
    pass("Memory save and retrieve");
  } else {
    fail(
      "Memory save and retrieve",
      `Expected 1 message, got ${history.length}`
    );
  }

  // Conversation history
  memory.add(testUser, {
    role: "assistant",
    content: "Hi!",
  });

  if (memory.get(testUser).length === 2) {
    pass("Memory conversation history");
  } else {
    fail("Memory conversation history");
  }

  // Reset
  memory.reset(testUser);

  if (memory.get(testUser).length === 0) {
    pass("Memory reset");
  } else {
    fail("Memory reset");
  }

  // Multiple conversation isolation
  memory.add(userA, {
    role: "user",
    content: "A",
  });

  memory.add(userB, {
    role: "user",
    content: "B",
  });

  const historyA = memory.get(userA);
  const historyB = memory.get(userB);

  if (
    historyA.length === 1 &&
    historyA[0].content === "A" &&
    historyB.length === 1 &&
    historyB[0].content === "B"
  ) {
    pass("Multiple conversation isolation");
  } else {
    fail(
      "Multiple conversation isolation",
      `A=${historyA.length}, B=${historyB.length}`
    );
  }

  // Clean up our test conversations before testing clear.
  memory.reset(testUser);
  memory.reset(userA);
  memory.reset(userB);

  /*
   * Test clear on a fresh in-memory state.
   */
  const clearUserA = `__clear_test_a_${Date.now()}__`;
  const clearUserB = `__clear_test_b_${Date.now()}__`;

  memory.add(clearUserA, {
    role: "user",
    content: "A",
  });

  memory.add(clearUserB, {
    role: "user",
    content: "B",
  });

  memory.clear();

  if (memory.stats().conversations === 0) {
    pass("Memory clear");
  } else {
    fail(
      "Memory clear",
      `Expected 0 conversations, got ${memory.stats().conversations}`
    );
  }
} catch (error) {
  fail("Memory system", error);
}

// ─────────────────────────────────────
// RESULT
// ─────────────────────────────────────

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log("🎉 ALL CORE OFFLINE TESTS PASSED");
} else {
  console.log("❌ CORE TESTS FAILED");
  process.exit(1);
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
