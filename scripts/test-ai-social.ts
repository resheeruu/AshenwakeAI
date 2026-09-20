/* ================================================================
 * AI SOCIAL TEST SUITE
 *
 * Tests the decision engine, cooldown system, and integration
 * for the AI Social feature.
 * ================================================================ */

import { makeSocialDecision, buildSocialContext, type SocialDecisionInput } from "../src/ai/social/decision";
import { SocialCooldown } from "../src/ai/social/cooldown";

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

console.log("\n🧪 AI Social Test Suite\n");

// ─────────────────────────────────────
// HELPER: Build a base SocialDecisionInput
// ─────────────────────────────────────

function baseInput(overrides: Partial<SocialDecisionInput> = {}): SocialDecisionInput {
  return {
    content: "What do you all think about this?",
    authorId: "user123",
    channelId: "ch456",
    guildId: "guild789",
    isMention: false,
    isReplyToBot: false,
    isDM: false,
    recentMessageCount: 10,
    hasSocialScope: true,
    channelConfig: {
      enabled: true,
      cooldownMs: 30000,
      responseProbability: 0.5,
      debateEnabled: true,
      contextWindow: 20,
      minActivityThreshold: 3,
    },
    isOnCooldown: false,
    isGlobalCooldownActive: false,
    isHourlyLimitReached: false,
    isUserOnCooldown: false,
    isDuplicate: false,
    ...overrides,
  };
}

// ─────────────────────────────────────
// DECISION ENGINE TESTS
// ─────────────────────────────────────

console.log("--- Decision Engine ---");

// 1. DMs should always skip
try {
  const result = makeSocialDecision(baseInput({ isDM: true }));
  if (result.action === "skip" && result.reason === "DM") {
    pass("DM messages skip");
  } else {
    fail("DM messages skip", result);
  }
} catch (e) {
  fail("DM messages skip", e);
}

// 2. No social scope should skip
try {
  const result = makeSocialDecision(baseInput({ hasSocialScope: false }));
  if (result.action === "skip" && result.reason === "no_social_scope") {
    pass("No social scope skips");
  } else {
    fail("No social scope skips", result);
  }
} catch (e) {
  fail("No social scope skips", e);
}

// 3. Channel disabled should skip
try {
  const result = makeSocialDecision(baseInput({
    channelConfig: { enabled: false, cooldownMs: 30000, responseProbability: 0.5, debateEnabled: true, contextWindow: 20, minActivityThreshold: 3 },
  }));
  if (result.action === "skip" && result.reason === "channel_disabled") {
    pass("Disabled channel skips");
  } else {
    fail("Disabled channel skips", result);
  }
} catch (e) {
  fail("Disabled channel skips", e);
}

// 4. Channel cooldown should skip
try {
  const result = makeSocialDecision(baseInput({ isOnCooldown: true }));
  if (result.action === "skip" && result.reason === "channel_cooldown") {
    pass("Channel cooldown skips");
  } else {
    fail("Channel cooldown skips", result);
  }
} catch (e) {
  fail("Channel cooldown skips", e);
}

// 5. Global cooldown should skip
try {
  const result = makeSocialDecision(baseInput({ isGlobalCooldownActive: true }));
  if (result.action === "skip" && result.reason === "global_cooldown") {
    pass("Global cooldown skips");
  } else {
    fail("Global cooldown skips", result);
  }
} catch (e) {
  fail("Global cooldown skips", e);
}

// 6. Hourly limit should skip
try {
  const result = makeSocialDecision(baseInput({ isHourlyLimitReached: true }));
  if (result.action === "skip" && result.reason === "hourly_limit") {
    pass("Hourly limit skips");
  } else {
    fail("Hourly limit skips", result);
  }
} catch (e) {
  fail("Hourly limit skips", e);
}

// 7. User cooldown should skip
try {
  const result = makeSocialDecision(baseInput({ isUserOnCooldown: true }));
  if (result.action === "skip" && result.reason === "user_cooldown") {
    pass("User cooldown skips");
  } else {
    fail("User cooldown skips", result);
  }
} catch (e) {
  fail("User cooldown skips", e);
}

// 8. Duplicate response should skip
try {
  const result = makeSocialDecision(baseInput({ isDuplicate: true }));
  if (result.action === "skip" && result.reason === "duplicate_response") {
    pass("Duplicate response skips");
  } else {
    fail("Duplicate response skips", result);
  }
} catch (e) {
  fail("Duplicate response skips", e);
}

// 9. Direct mention should always respond
try {
  const result = makeSocialDecision(baseInput({ isMention: true }));
  if (result.action === "respond" && result.reason === "direct_mention") {
    pass("Direct mention responds");
  } else {
    fail("Direct mention responds", result);
  }
} catch (e) {
  fail("Direct mention responds", e);
}

// 10. Reply to bot should respond
try {
  const result = makeSocialDecision(baseInput({ isReplyToBot: true }));
  if (result.action === "respond" && result.reason === "reply_to_bot") {
    pass("Reply to bot responds");
  } else {
    fail("Reply to bot responds", result);
  }
} catch (e) {
  fail("Reply to bot responds", e);
}

// 11. Short message should skip
try {
  const result = makeSocialDecision(baseInput({ content: "ok" }));
  if (result.action === "skip" && result.reason === "message_too_short") {
    pass("Short message skips");
  } else {
    fail("Short message skips", result);
  }
} catch (e) {
  fail("Short message skips", e);
}

// 12. Casual banter should skip
try {
  const result = makeSocialDecision(baseInput({ content: "lol that was hilarious" }));
  if (result.action === "skip" && result.reason === "casual_banter") {
    pass("Casual banter skips");
  } else {
    fail("Casual banter skips", result);
  }
} catch (e) {
  fail("Casual banter skips", e);
}

// 13. Below activity threshold should skip
try {
  const result = makeSocialDecision(baseInput({ recentMessageCount: 1 }));
  if (result.action === "skip" && result.reason === "below_activity_threshold") {
    pass("Below activity threshold skips");
  } else {
    fail("Below activity threshold skips", result);
  }
} catch (e) {
  fail("Below activity threshold skips", e);
}

// 14. Debate disabled should skip debate messages
try {
  const result = makeSocialDecision(baseInput({
    content: "I disagree, that's not correct at all",
    channelConfig: { enabled: true, cooldownMs: 30000, responseProbability: 0.5, debateEnabled: false, contextWindow: 20, minActivityThreshold: 3 },
  }));
  if (result.action === "skip" && result.reason === "debate_disabled") {
    pass("Debate disabled skips");
  } else {
    fail("Debate disabled skips", result);
  }
} catch (e) {
  fail("Debate disabled skips", e);
}

// 15. No mention/reply, not DM, with social scope should use probability
try {
  // With probability 1.0, should always respond
  const result = makeSocialDecision(baseInput({
    content: "How do I set up my server?",
    channelConfig: { enabled: true, cooldownMs: 30000, responseProbability: 1.0, debateEnabled: true, contextWindow: 20, minActivityThreshold: 3 },
  }));
  if (result.action === "respond") {
    pass("Probability 1.0 responds");
  } else {
    fail("Probability 1.0 responds", result);
  }
} catch (e) {
  fail("Probability 1.0 responds", e);
}

// ─────────────────────────────────────
// COOLDOWN TESTS
// ─────────────────────────────────────

console.log("\n--- Cooldown System ---");

const cooldown = new SocialCooldown();

// 16. Channel cooldown
try {
  cooldown.recordResponse("ch1", "guild1", "user1", "Hello!");
  const onCooldown = cooldown.isChannelOnCooldown("ch1", 30000);
  const notOnCooldown = cooldown.isChannelOnCooldown("ch2", 30000);
  if (onCooldown && !notOnCooldown) {
    pass("Channel cooldown tracking");
  } else {
    fail("Channel cooldown tracking", { onCooldown, notOnCooldown });
  }
} catch (e) {
  fail("Channel cooldown tracking", e);
}

// 17. Global cooldown
try {
  cooldown.recordResponse("ch1", "guild1", "user1", "Hello!");
  const onCooldown = cooldown.isGlobalOnCooldown("guild1", 30000);
  const notOnCooldown = cooldown.isGlobalOnCooldown("guild2", 30000);
  if (onCooldown && !notOnCooldown) {
    pass("Global cooldown tracking");
  } else {
    fail("Global cooldown tracking", { onCooldown, notOnCooldown });
  }
} catch (e) {
  fail("Global cooldown tracking", e);
}

// 18. User cooldown
try {
  cooldown.recordResponse("ch1", "guild1", "user1", "Hello!");
  const onCooldown = cooldown.isUserOnCooldown("user1", 5000);
  const notOnCooldown = cooldown.isUserOnCooldown("user2", 5000);
  if (onCooldown && !notOnCooldown) {
    pass("User cooldown tracking");
  } else {
    fail("User cooldown tracking", { onCooldown, notOnCooldown });
  }
} catch (e) {
  fail("User cooldown tracking", e);
}

// 19. Hourly limit
try {
  const freshCooldown = new SocialCooldown();
  // Record 10 responses
  for (let i = 0; i < 10; i++) {
    freshCooldown.recordResponse(`ch${i}`, "guild1", "user1", `Message ${i}`);
  }
  const reached = freshCooldown.isHourlyLimitReached("guild1", 10);
  const notReached = freshCooldown.isHourlyLimitReached("guild2", 10);
  if (reached && !notReached) {
    pass("Hourly limit tracking");
  } else {
    fail("Hourly limit tracking", { reached, notReached });
  }
} catch (e) {
  fail("Hourly limit tracking", e);
}

// 20. Duplicate detection
try {
  const freshCooldown = new SocialCooldown();
  freshCooldown.recordResponse("ch1", "guild1", "user1", "This is a test message");
  const isDuplicate = freshCooldown.isDuplicateResponse("guild1", "This is a test message");
  const notDuplicate = freshCooldown.isDuplicateResponse("guild1", "This is a completely different message");
  if (isDuplicate && !notDuplicate) {
    pass("Duplicate detection");
  } else {
    fail("Duplicate detection", { isDuplicate, notDuplicate });
  }
} catch (e) {
  fail("Duplicate detection", e);
}

// 21. Cooldown cleanup
try {
  const testCooldown = new SocialCooldown();
  testCooldown.recordResponse("ch1", "guild1", "user1", "Hello");
  // Cleanup should not crash
  testCooldown.destroy();
  pass("Cooldown cleanup");
} catch (e) {
  fail("Cooldown cleanup", e);
}

// ─────────────────────────────────────
// SOCIAL CONTEXT TESTS
// ─────────────────────────────────────

console.log("\n--- Social Context ---");

// 22. Build context for respond decision
try {
  const context = buildSocialContext(
    { action: "respond", reason: "relevant_question", contextWindow: 20 },
    [
      { author: "User1", content: "Hello everyone", timestamp: Date.now() },
      { author: "User2", content: "Hi there!", timestamp: Date.now() },
    ]
  );
  if (context.includes("SOCIAL CONTEXT") && context.includes("User1") && context.includes("Hello everyone")) {
    pass("Social context includes messages");
  } else {
    fail("Social context includes messages", context);
  }
} catch (e) {
  fail("Social context includes messages", e);
}

// 23. Skip decision returns empty context
try {
  const context = buildSocialContext(
    { action: "skip", reason: "DM" },
    []
  );
  if (context === "") {
    pass("Skip decision returns empty context");
  } else {
    fail("Skip decision returns empty context", context);
  }
} catch (e) {
  fail("Skip decision returns empty context", e);
}

// 24. Debate context includes debate prompt
try {
  const context = buildSocialContext(
    { action: "respond", reason: "debate_participation", contextWindow: 20 },
    []
  );
  if (context.includes("discussion") || context.includes("debate") || context.includes("viewpoint")) {
    pass("Debate context includes debate prompt");
  } else {
    fail("Debate context includes debate prompt", context);
  }
} catch (e) {
  fail("Debate context includes debate prompt", e);
}

// ─────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────

console.log(`\n--- Results ---`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
