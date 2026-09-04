import { providers } from "../src/ai/providers";
import { AIRouter } from "../src/ai/router";
import { ConversationMemory } from "../src/ai/memory";
import { createAskCommand } from "../src/commands/ask";
import { createResetCommand } from "../src/commands/reset";
import { createHelpCommand } from "../src/commands/help";
import { createStatusCommand } from "../src/commands/status";
import { createPromptCommand } from "../src/commands/prompt";
import { UsageManager } from "../src/ai/usage-manager";
import {
  insertAIUsageDB,
  getAIUsageSummaryDB,
  getAIUsageBySourceDB,
} from "../src/database/ai-usage-repo";
import { commandBuilders } from "../src/commands/definitions";

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

console.log("\n🧪 AshenAI Offline Command Tests\n");

// ─────────────────────────────────────
// COMMAND FACTORIES
// ─────────────────────────────────────

try {
  const memory = new ConversationMemory();
  const router = new AIRouter(providers);
  const usageManager = new UsageManager();

  const ask = createAskCommand(router, memory, usageManager);
  const reset = createResetCommand(memory);
  const help = createHelpCommand();
  const status = createStatusCommand(router, memory);
  const prompt = createPromptCommand();
  if (ask && ask.data.name === "ask" && typeof ask.execute === "function") {
    pass("/ask command factory");
  } else {
    fail("/ask command factory");
  }

  if (
    reset &&
    reset.data.name === "reset" &&
    typeof reset.execute === "function"
  ) {
    pass("/reset command factory");
  } else {
    fail("/reset command factory");
  }

  if (
    help &&
    help.data.name === "help" &&
    typeof help.execute === "function"
  ) {
    pass("/help command factory");
  } else {
    fail("/help command factory");
  }

  if (
    status &&
    status.data.name === "status" &&
    typeof status.execute === "function"
  ) {
    pass("/status command factory");
  } else {
    fail("/status command factory");
  }

  if (
    prompt &&
    prompt.data.name === "prompt" &&
    typeof prompt.execute === "function"
  ) {
    pass("/prompt command factory");
  } else {
    fail("/prompt command factory");
  }

  // ─────────────────────────────────────
  // /config MUST NOT BE REGISTERED
  // ─────────────────────────────────────

  // Verify /config is NOT in the static commandBuilders array
  const staticCommandNames = commandBuilders.map((b) => b.name);
  if (!staticCommandNames.includes("config")) {
    pass("/config NOT in static commandBuilders");
  } else {
    fail("/config NOT in static commandBuilders");
  }

  if (!staticCommandNames.includes("usage")) {
    pass("/usage NOT in static commandBuilders");
  } else {
    fail("/usage NOT in static commandBuilders");
  }

  if (!staticCommandNames.includes("diagnose")) {
    pass("/diagnose NOT in static commandBuilders");
  } else {
    fail("/diagnose NOT in static commandBuilders");
  }

  // ─────────────────────────────────────
  // COMMAND NAMES
  // ─────────────────────────────────────

  const commandNames = [
    ask.data.name,
    reset.data.name,
    help.data.name,
    status.data.name,
    prompt.data.name,
  ];

  const expectedNames = [
    "ask",
    "reset",
    "help",
    "status",
    "prompt",
  ];

  if (
    expectedNames.every((name) =>
      commandNames.includes(name)
    )
  ) {
    pass("All required command names present");
  } else {
    fail(
      "All required command names present",
      commandNames
    );
  }

  if (!commandNames.includes("config")) {
    pass("/config NOT in runtime command list");
  } else {
    fail("/config NOT in runtime command list");
  }

  if (!commandNames.includes("usage")) {
    pass("/usage NOT in runtime command list");
  } else {
    fail("/usage NOT in runtime command list");
  }

  if (!commandNames.includes("diagnose")) {
    pass("/diagnose NOT in runtime command list");
  } else {
    fail("/diagnose NOT in runtime command list");
  }

  if (new Set(commandNames).size === commandNames.length) {
    pass("No duplicate command names");
  } else {
    fail("No duplicate command names");
  }

  // ─────────────────────────────────────
  // ASK COMMAND OPTIONS
  // ─────────────────────────────────────

  const askJson = ask.data.toJSON();

  const questionOption = askJson.options?.find(
    (option: any) => option.name === "question"
  );

  if (
    questionOption &&
    questionOption.type === 3 &&
    questionOption.required === true
  ) {
    pass("/ask question option");
  } else {
    fail("/ask question option");
  }

  // ─────────────────────────────────────
  // PROMPT COMMAND OPTIONS
  // ─────────────────────────────────────

  const promptJson = prompt.data.toJSON();

  const promptOption = promptJson.options?.find(
    (option: any) => option.name === "prompt"
  );

  if (
    promptOption &&
    promptOption.type === 3 &&
    promptOption.required === true
  ) {
    pass("/prompt prompt option (required string)");
  } else {
    fail("/prompt prompt option (required string)");
  }

  const promptMaxLength = promptOption?.max_length;
  if (promptMaxLength && promptMaxLength <= 2000) {
    pass("/prompt prompt max_length within Discord limits");
  } else {
    fail("/prompt prompt max_length within Discord limits");
  }

  const promptDesc = promptJson.description?.toLowerCase() || "";
  if (promptDesc.includes("builder") || promptDesc.includes("server")) {
    pass("/prompt description mentions builder/server");
  } else {
    fail("/prompt description mentions builder/server");
  }

  // ─────────────────────────────────────
  // AI USAGE RECORDING
  // ─────────────────────────────────────

  const testUserId = "test-usage-" + crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // Record a successful AI usage
  insertAIUsageDB({
    requestId: "test-req-1-" + Date.now(),
    userId: testUserId,
    guildId: "test-guild",
    channelId: "test-channel",
    source: "ask",
    provider: "test-provider",
    model: "test-model",
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    success: true,
    latencyMs: 500,
    createdAt: now,
  });

  // Record a chat usage
  insertAIUsageDB({
    requestId: "test-req-2-" + Date.now(),
    userId: testUserId,
    guildId: "test-guild",
    channelId: "test-channel",
    source: "chat",
    provider: "test-provider",
    model: "test-model",
    inputTokens: 200,
    outputTokens: 100,
    totalTokens: 300,
    success: true,
    latencyMs: 800,
    createdAt: now,
  });

  // Record a failed usage (should NOT count in summary)
  insertAIUsageDB({
    requestId: "test-req-fail-" + Date.now(),
    userId: testUserId,
    guildId: "test-guild",
    channelId: "test-channel",
    source: "ask",
    provider: "test-provider",
    model: "test-model",
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    success: false,
    latencyMs: 100,
    createdAt: now,
  });

  // Duplicate request ID should be ignored (idempotent)
  const dupeId = "test-req-dupe-" + Date.now();
  insertAIUsageDB({
    requestId: dupeId,
    userId: testUserId,
    guildId: "test-guild",
    channelId: "test-channel",
    source: "ask",
    provider: "test-provider",
    model: "test-model",
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    success: true,
    latencyMs: 500,
    createdAt: now,
  });

  // Duplicate request ID — same requestId, different token counts (should be ignored)
  insertAIUsageDB({
    requestId: dupeId,
    userId: testUserId,
    guildId: "test-guild",
    channelId: "test-channel",
    source: "ask",
    provider: "test-provider",
    model: "test-model",
    inputTokens: 999,
    outputTokens: 999,
    totalTokens: 999,
    success: true,
    latencyMs: 999,
    createdAt: now,
  });

  // Query today's usage (should be 3 successful: req-1, req-2, dupe; failed is excluded, dupe-of-dupe is ignored)
  const summary = getAIUsageSummaryDB(testUserId, now - 5);
  if (summary.requests === 3) {
    pass("AI usage: 3 successful requests recorded (failed excluded, dupe-of-dupe ignored)");
  } else {
    fail(`AI usage: expected 3 requests, got ${summary.requests}`);
  }

  if (summary.totalTokens === 600) {
    pass("AI usage: correct total tokens (150 + 300 + 150 = 600)");
  } else {
    fail(`AI usage: expected 600 total tokens, got ${summary.totalTokens}`);
  }

  if (summary.inputTokens === 400) {
    pass("AI usage: correct input tokens (100 + 200 + 100 = 400)");
  } else {
    fail(`AI usage: expected 400 input tokens, got ${summary.inputTokens}`);
  }

  if (summary.outputTokens === 200) {
    pass("AI usage: correct output tokens (50 + 100 + 50 = 200)");
  } else {
    fail(`AI usage: expected 200 output tokens, got ${summary.outputTokens}`);
  }

  // Source breakdown
  const bySource = getAIUsageBySourceDB(testUserId, now - 5);
  if (bySource["ask"] === 2 && bySource["chat"] === 1) {
    pass("AI usage: correct source breakdown (ask=2, chat=1)");
  } else {
    fail("AI usage: correct source breakdown", bySource);
  }

  // Privacy: different user gets 0
  const otherUserSummary = getAIUsageSummaryDB("other-user-" + Date.now(), now - 60);
  if (otherUserSummary.requests === 0) {
    pass("AI usage: user isolation (other user sees 0)");
  } else {
    fail(`AI usage: expected 0 for other user, got ${otherUserSummary.requests}`);
  }

  // ─────────────────────────────────────
  // MEMORY USED BY COMMANDS
  // ─────────────────────────────────────

  memory.add("command-test-user", {
    role: "user",
    content: "test",
  });

  if (
    memory.get("command-test-user").length === 1
  ) {
    pass("Command memory integration");
  } else {
    fail("Command memory integration");
  }

  memory.reset("command-test-user");

  if (
    memory.get("command-test-user").length === 0
  ) {
    pass("Command memory reset integration");
  } else {
    fail("Command memory reset integration");
  }

} catch (error) {
  fail("Command test execution", error);
}

// ─────────────────────────────────────
// RESULT
// ─────────────────────────────────────

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log("🎉 ALL COMMAND TESTS PASSED");
} else {
  console.log("❌ COMMAND TESTS FAILED");
  process.exit(1);
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
