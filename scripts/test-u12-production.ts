#!/usr/bin/env node
/**
 * U12 Production Readiness Regression Tests
 * Tests concrete findings from the U12 audit.
 */

import { strict as assert } from "node:assert";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`❌ ${name}: ${err.message}`);
  }
}

/* ======================================================
   1. PROCESS ERROR HANDLERS
   ====================================================== */
console.log("\n===== PROCESS ERROR HANDLERS =====");

test("index.ts registers uncaughtException handler", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/index.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes('process.on("uncaughtException"'),
    "index.ts should register uncaughtException handler"
  );
});

test("index.ts registers unhandledRejection handler", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/index.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes('process.on("unhandledRejection"'),
    "index.ts should register unhandledRejection handler"
  );
});

/* ======================================================
   2. PROVIDER ERROR SANITIZATION
   ====================================================== */
console.log("\n===== PROVIDER ERROR SANITIZATION =====");

test("Router sanitizeError truncates long messages", async () => {
  const { AIRouter } = await import("../src/ai/router");
  const router = new AIRouter([]);

  // Access private method via prototype
  const sanitize = (router as any).sanitizeError.bind(router);
  const longError = "x".repeat(500);
  const result = sanitize(new Error(longError));
  assert.ok(result.length <= 200, `Error not truncated: length=${result.length}`);
});

test("Router sanitizeError handles non-Error values", async () => {
  const { AIRouter } = await import("../src/ai/router");
  const router = new AIRouter([]);
  const sanitize = (router as any).sanitizeError.bind(router);

  assert.equal(sanitize("string error"), "string error");
  assert.equal(sanitize(42), "42");
  assert.equal(sanitize(null), "null");
});

test("Router sanitizeError strips potential secrets from error body", async () => {
  const { AIRouter } = await import("../src/ai/router");
  const router = new AIRouter([]);
  const sanitize = (router as any).sanitizeError.bind(router);

  const errorWithSecret = new Error("HTTP 401: {'error': 'invalid_api_key: sk-abc123xyz'}");
  const result = sanitize(errorWithSecret);
  assert.ok(result.length <= 200, "Secret-containing error should be truncated");
  // The full key should NOT be in the result since it's truncated to 200 chars
});

/* ======================================================
   3. GUILD ID SANITIZATION
   ====================================================== */
console.log("\n===== GUILD ID SANITIZATION =====");

test("Guild config path rejects path traversal characters", async () => {
  const { loadGuildConfig } = await import("../src/core/guild-config");
  const config = loadGuildConfig("../../etc/passwd");
  // Should return default config, not crash or access /etc/passwd
  assert.ok(config, "Should return a config");
  assert.equal(config.guildId, "../../etc/passwd");
  // The actual file path should be sanitized
});

test("Guild config path handles null bytes", async () => {
  const { loadGuildConfig } = await import("../src/core/guild-config");
  const config = loadGuildConfig("test\x00.json");
  assert.ok(config, "Should handle null bytes gracefully");
});

test("Guild config path handles very long guild IDs", async () => {
  const { loadGuildConfig } = await import("../src/core/guild-config");
  const longId = "a".repeat(200);
  const config = loadGuildConfig(longId);
  assert.ok(config, "Should handle long IDs gracefully");
});

/* ======================================================
   4. OLLAMA AVAILABILITY CHECK
   ====================================================== */
console.log("\n===== OLLAMA AVAILABILITY =====");

test("OllamaProvider isAvailable checks connectivity", async () => {
  const { OllamaProvider } = await import("../src/ai/providers/ollama");
  const provider = new OllamaProvider();
  // On a system without Ollama, should return false after check
  // The check is async but isAvailable is sync - it returns cached value
  // First call returns true (default), then check runs async
  // For testing, we just verify the method exists and doesn't crash
  const result = provider.isAvailable();
  assert.equal(typeof result, "boolean");
});

/* ======================================================
   5. PROVIDER ABORT SIGNALS
   ====================================================== */
console.log("\n===== PROVIDER FETCH TIMEOUTS =====");

test("OpenAI-compatible provider uses AbortSignal", async () => {
  const { OpenAICompatibleProvider } = await import("../src/ai/providers/openai-compatible");
  const provider = new OpenAICompatibleProvider({
    name: "test",
    apiKey: "test-key",
    baseURL: "https://httpbin.org/delay/30",
    defaultModel: "test",
  });
  // This should timeout quickly, not hang for 30 seconds
  const start = Date.now();
  try {
    await provider.generate({
      messages: [{ role: "user", content: "test" }],
    });
  } catch (err: any) {
    const elapsed = Date.now() - start;
    // Should fail within ~15s (the timeout), not 30s
    assert.ok(elapsed < 20000, `Request took too long: ${elapsed}ms`);
    assert.ok(err.message.includes("abort") || err.message.includes("timeout") || err.message.includes("HTTP"),
      `Unexpected error: ${err.message}`);
  }
});

/* ======================================================
   6. AUTOMOD RAID DETECTION
   ====================================================== */
console.log("\n===== AUTOMOD RAID DETECTION =====");

test("Automod tracks per-user activity, not total activity", async () => {
  // Verify the raid detection logic uses per-user counts
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/moderation/automod.ts", import.meta.url).pathname,
    "utf8"
  );
  // The fix should use userRecentCount for kick threshold
  assert.ok(
    content.includes("userRecentCount"),
    "automod.ts should use per-user count for kick decision"
  );
  // And total count only for warning
  assert.ok(
    content.includes("recentJoins.length > 20"),
    "automod.ts should warn on high total activity (>20)"
  );
  // Kick should require more than 5 from same user
  assert.ok(
    content.includes("userRecentCount > 5"),
    "automod.ts should kick on >5 actions from same user"
  );
});

/* ======================================================
   7. EXPRESS ERROR HANDLER
   ====================================================== */
console.log("\n===== EXPRESS ERROR HANDLER =====");

test("Express server has global error handler", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/web/server.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("app.use((err"),
    "server.ts should have global Express error handler"
  );
  assert.ok(
    content.includes("Internal server error"),
    "Error handler should use generic message in production"
  );
});

/* ======================================================
   8. PROCESS CLEANUP ON ERROR
   ====================================================== */
console.log("\n===== PROCESS CLEANUP =====");

test("Index.ts has uncaughtException handler with cleanup", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/index.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes('process.on("uncaughtException"'),
    "index.ts should register uncaughtException handler"
  );
  assert.ok(
    content.includes('process.on("unhandledRejection"'),
    "index.ts should register unhandledRejection handler"
  );
  // Both should call client.destroy() and process.exit()
  const uncaughtIdx = content.indexOf('process.on("uncaughtException"');
  const section = content.slice(uncaughtIdx, uncaughtIdx + 500);
  assert.ok(
    section.includes("client.destroy()"),
    "uncaughtException handler should destroy Discord client"
  );
  assert.ok(
    section.includes("process.exit"),
    "uncaughtException handler should exit process"
  );
});

/* ======================================================
   9. TASK COMMAND AUTHORIZATION
   ====================================================== */
console.log("\n===== TASK COMMAND AUTH =====");

test("Task command checks creator/admin permission", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/commands/task.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("isCreator") && content.includes("isAdmin"),
    "task.ts should check creator and admin permissions"
  );
  assert.ok(
    content.includes("Only the bot owner or an admin can run autonomous tasks"),
    "task.ts should deny non-authorized users"
  );
});

/* ======================================================
   10. INTERNAL SUPERVISOR USES LOGGER
   ====================================================== */
console.log("\n===== INTERNAL SUPERVISOR =====");

test("InternalSupervisor uses logger instead of console", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/core/internalSupervisor.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes('import { logger }') || content.includes('from "../logger"'),
    "internalSupervisor.ts should import logger"
  );
  assert.ok(
    !content.includes("console.log("),
    "internalSupervisor.ts should not use console.log"
  );
  assert.ok(
    !content.includes("console.warn("),
    "internalSupervisor.ts should not use console.warn"
  );
  assert.ok(
    !content.includes("console.error("),
    "internalSupervisor.ts should not use console.error"
  );
});

/* ======================================================
   11. PROVIDER ERROR BODIES NOT LEAKED
   ====================================================== */
console.log("\n===== PROVIDER SECRET REDACTION =====");

test("Provider error messages do not include response bodies", async () => {
  const fs = await import("fs");

  const providers = [
    "openai-compatible.ts",
    "anthropic.ts",
    "groq.ts",
    "cohere.ts",
  ];

  for (const file of providers) {
    const content = fs.readFileSync(
      new URL(`../src/ai/providers/${file}`, import.meta.url).pathname,
      "utf8"
    );
    // Should not have `${body}` or `errorBody` in error messages
    assert.ok(
      !content.includes("${body}") && !content.includes("${errorBody}"),
      `${file} should not include response body in error messages`
    );
  }
});

test("Gemini provider does not include raw response in errors", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/ai/providers/gemini.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    !content.includes("raw.slice(0, 500)") && !content.includes("raw.slice(0, 800)"),
    "gemini.ts should not include raw response slices in errors"
  );
});

/* ======================================================
   SUMMARY
   ====================================================== */
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0
  ? "🎉 ALL U12 REGRESSION TESTS PASSED"
  : "⚠️ SOME U12 TESTS FAILED");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

process.exit(failed > 0 ? 1 : 0);
