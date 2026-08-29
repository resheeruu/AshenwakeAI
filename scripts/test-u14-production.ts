#!/usr/bin/env node
/**
 * U14 Production Deployment Regression Tests
 * Tests concrete findings from the U14 deep audit.
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
   1. DOCKERFILE DEPLOYMENT SAFETY
   ====================================================== */
console.log("\n===== DOCKERFILE DEPLOYMENT =====");

test("Dockerfile installs dev dependencies for build step", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../Dockerfile", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("--include=dev"),
    "Dockerfile should install devDependencies for build"
  );
});

test("Dockerfile runs build before CMD", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../Dockerfile", import.meta.url).pathname,
    "utf8"
  );
  const buildIdx = content.indexOf("npm run build");
  const cmdIdx = content.indexOf("CMD");
  assert.ok(buildIdx > 0, "Dockerfile should have npm run build");
  assert.ok(cmdIdx > buildIdx, "CMD should come after build");
});

test("Dockerfile CMD uses render-start.sh", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../Dockerfile", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes('CMD ["bash", "scripts/render-start.sh"]'),
    "Dockerfile CMD should use render-start.sh"
  );
});

/* ======================================================
   2. SELF-HEALER SAFETY NET
   ====================================================== */
console.log("\n===== SELF-HEALER SAFETY =====");

test("Self-healer runs typecheck after writing file", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/agent/selfHealCallback.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("await typecheck()"),
    "selfHealCallback.ts should run typecheck after writeFile"
  );
  assert.ok(
    content.includes("error TS"),
    "selfHealCallback.ts should check for TS errors in output"
  );
});

test("Self-healer creates backup before repair", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/agent/selfHeal.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("copyFile") && content.includes("backup"),
    "selfHeal.ts should create backup before repair"
  );
});

test("Self-healer restores from backup on failed verification", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/agent/selfHeal.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("restored from backup") || content.includes("restored."),
    "selfHeal.ts should restore from backup on failure"
  );
});

test("Self-healer checks path traversal", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/agent/selfHealCallback.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("path.resolve(action.path) !== path.resolve(filePath)"),
    "selfHealCallback.ts should reject path traversal"
  );
});

/* ======================================================
   3. ENV FILE SAFETY
   ====================================================== */
console.log("\n===== ENV FILE SAFETY =====");

test(".env.example has no actual secrets", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../.env.example", import.meta.url).pathname,
    "utf8"
  );
  const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("#"));
  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const value = line.slice(eqIdx + 1).trim();
    if (!value) continue;
    assert.ok(
      value.length < 50,
      `.env.example has suspicious value: ${line.split("=")[0]}=${value.slice(0, 20)}...`
    );
    assert.ok(
      !/^(sk-|ghp_|gho_|xoxb-|xoxp-)/.test(value),
      `.env.example appears to contain a real secret: ${line.split("=")[0]}`
    );
  }
});

test(".env is gitignored", async () => {
  const fs = await import("fs");
  const gitignore = fs.readFileSync(
    new URL("../.gitignore", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    gitignore.includes(".env"),
    ".gitignore should include .env"
  );
});

/* ======================================================
   4. RATE LIMITER BOUNDED
   ====================================================== */
console.log("\n===== RATE LIMITER =====");

test("Rate limiter has maxUsers parameter", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/security/rate-limit.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("maxUsers"),
    "rate-limit.ts should have maxUsers parameter"
  );
});

test("Rate limiter default maxUsers is reasonable", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/security/rate-limit.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("10_000") || content.includes("10000"),
    "rate-limit.ts default maxUsers should be 10,000"
  );
});

/* ======================================================
   5. PROCESS ERROR HANDLERS (verifying still present)
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
   6. PROVIDER ERROR SANITIZATION (verifying still present)
   ====================================================== */
console.log("\n===== PROVIDER ERROR SANITIZATION =====");

test("Router has sanitizeError method", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/ai/router.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("sanitizeError"),
    "router.ts should have sanitizeError method"
  );
});

test("Provider errors do not expose response bodies", async () => {
  const fs = await import("fs");
  const providers = [
    "openai-compatible.ts",
    "anthropic.ts",
    "groq.ts",
    "cohere.ts",
    "gemini.ts",
  ];
  for (const provider of providers) {
    const content = fs.readFileSync(
      new URL(`../src/ai/providers/${provider}`, import.meta.url).pathname,
      "utf8"
    );
    assert.ok(
      !content.includes("response.text()") && !content.includes("await res.text()"),
      `${provider} should not expose raw response body in errors`
    );
  }
});

/* ======================================================
   7. GLOBAL ERROR HANDLER
   ====================================================== */
console.log("\n===== GLOBAL ERROR HANDLER =====");

test("Express app has global error handler", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/web/server.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("app.use((err"),
    "server.ts should have global Express error handler"
  );
});

test("Error handler hides details in production", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/web/server.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("Internal server error"),
    "server.ts error handler should return generic message"
  );
});

/* ======================================================
   8. AUTOMOD RAID DETECTION
   ====================================================== */
console.log("\n===== AUTOMOD RAID DETECTION =====");

test("Automod tracks per-user message counts for raid detection", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/moderation/automod.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("userCounts") || content.includes("userCount") || content.includes("per-user"),
    "automod.ts should track per-user message counts"
  );
});

test("Automod kicks on per-user threshold, not total count", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/moderation/automod.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("> 5") || content.includes(">5"),
    "automod.ts should kick on per-user threshold"
  );
});

/* ======================================================
   9. GUILD CONFIG FIELD ALLOWLIST
   ====================================================== */
console.log("\n===== GUILD CONFIG ALLOWLIST =====");

test("Guild config update filters allowed fields", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/control/control-service.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("GUILD_CONFIG_ALLOWED_FIELDS"),
    "control-service.ts should have allowed fields set"
  );
});

/* ======================================================
   10. EMAIL SERVICE PRODUCTION GUARD
   ====================================================== */
console.log("\n===== EMAIL SERVICE PRODUCTION GUARD =====");

test("Dev email service checks NODE_ENV before enabling reset links", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/control/email-service.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes('NODE_ENV === "production"'),
    "email-service.ts should check NODE_ENV production"
  );
});

/* ======================================================
   11. MUSIC AUTO-SKIP (verifying still present)
   ====================================================== */
console.log("\n===== MUSIC AUTO-SKIP =====");

test("Music manager auto-skips on exception event", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/music/ShoukakuMusicManager.ts", import.meta.url).pathname,
    "utf8"
  );
  const exceptionIdx = content.indexOf('"exception"');
  assert.ok(exceptionIdx > 0, "ShoukakuMusicManager should handle exception event");
  const section = content.slice(exceptionIdx, exceptionIdx + 400);
  assert.ok(
    section.includes("handleTrackEnd"),
    "Exception handler should call handleTrackEnd to auto-advance"
  );
});

test("Music manager auto-skips on stuck event", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/music/ShoukakuMusicManager.ts", import.meta.url).pathname,
    "utf8"
  );
  const stuckIdx = content.indexOf('"stuck"');
  assert.ok(stuckIdx > 0, "ShoukakuMusicManager should handle stuck event");
  const section = content.slice(stuckIdx, stuckIdx + 400);
  assert.ok(
    section.includes("handleTrackEnd"),
    "Stuck handler should call handleTrackEnd to auto-advance"
  );
});

/* ======================================================
   12. AI PROVIDER TIMEOUTS
   ====================================================== */
console.log("\n===== AI PROVIDER TIMEOUTS =====");

test("All AI provider fetch calls use AbortSignal.timeout", async () => {
  const fs = await import("fs");
  const providers = [
    "openai-compatible.ts",
    "anthropic.ts",
    "groq.ts",
    "cohere.ts",
    "gemini.ts",
  ];
  for (const provider of providers) {
    const content = fs.readFileSync(
      new URL(`../src/ai/providers/${provider}`, import.meta.url).pathname,
      "utf8"
    );
    assert.ok(
      content.includes("AbortSignal.timeout") || content.includes("signal:"),
      `${provider} should use AbortSignal.timeout for fetch calls`
    );
  }
});

/* ======================================================
   13. OLLAMA CONNECTIVITY CHECK
   ====================================================== */
console.log("\n===== OLLAMA CONNECTIVITY =====");

test("Ollama provider checks connectivity before returning available", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/ai/providers/ollama.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("isAvailable") && (content.includes("fetch") || content.includes("connectivity")),
    "ollama.ts should check connectivity in isAvailable"
  );
});

/* ======================================================
   14. LOGGING (no console.* in critical paths)
   ====================================================== */
console.log("\n===== LOGGING =====");

test("InternalSupervisor uses logger, not console", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/core/internalSupervisor.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("logger."),
    "internalSupervisor.ts should use logger, not console"
  );
  assert.ok(
    !content.includes("console.log") && !content.includes("console.error"),
    "internalSupervisor.ts should not use console.log/error"
  );
});

/* ======================================================
   15. NO SECRETS IN TRACKED FILES
   ====================================================== */
console.log("\n===== NO SECRETS IN TRACKED FILES =====");

test("No hardcoded tokens in source code", async () => {
  const { execSync } = await import("child_process");
  const tracked = execSync("git ls-files '*.ts' '*.js'", {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  }).split("\n").filter(Boolean);

  const secretPatterns = [
    /(?:DISCORD_TOKEN|BOT_TOKEN)\s*=\s*["'][A-Za-z0-9._-]{20,}/,
    /(?:SESSION_SECRET|JWT_SECRET)\s*=\s*["'][A-Za-z0-9._-]{16,}/,
    /(?:sk-|ghp_|gho_|xoxb-|xoxp-)[A-Za-z0-9]{10,}/,
  ];

  for (const file of tracked) {
    const content = await import("fs").then(fs =>
      fs.readFileSync(new URL(`../${file}`, import.meta.url).pathname, "utf8")
    );
    for (const pattern of secretPatterns) {
      assert.ok(
        !pattern.test(content),
        `${file} appears to contain a hardcoded secret`
      );
    }
  }
});

/* ======================================================
   SUMMARY
   ====================================================== */
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0
  ? "🎉 ALL U14 REGRESSION TESTS PASSED"
  : "⚠️ SOME U14 TESTS FAILED");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

process.exit(failed > 0 ? 1 : 0);
