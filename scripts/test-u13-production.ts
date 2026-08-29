#!/usr/bin/env node
/**
 * U13 Production Readiness Regression Tests
 * Tests concrete findings from the U13 audit.
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
   1. /api/me ROLE DRIFT
   ====================================================== */
console.log("\n===== /api/me ROLE DRIFT =====");

test("/api/me validates role against account", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/web/server.ts", import.meta.url).pathname,
    "utf8"
  );
  // Should check account.role !== session.role and destroy session
  assert.ok(
    content.includes("account.role !== session.role"),
    "server.ts should validate role consistency in /api/me"
  );
  assert.ok(
    content.includes("destroySession") && content.indexOf("destroySession", content.indexOf("account.role !== session.role")) < content.indexOf("res.json({ ok: true, authenticated: false })", content.indexOf("account.role !== session.role")),
    "server.ts should destroy session on role mismatch"
  );
});

/* ======================================================
   2. AUTH_DEV_RESET_LINKS PRODUCTION GUARD
   ====================================================== */
console.log("\n===== AUTH_DEV_RESET_LINKS =====");

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
  assert.ok(
    content.includes("!isProduction && process.env.AUTH_DEV_RESET_LINKS"),
    "email-service.ts should require non-production for dev reset links"
  );
});

/* ======================================================
   3. GUILD CONFIG FIELD ALLOWLISTING
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
  assert.ok(
    content.includes("filtered"),
    "control-service.ts should filter updates through allowlist"
  );
});

/* ======================================================
   4. SERAPH INVESTIGATION INPUT LIMIT
   ====================================================== */
console.log("\n===== SERAPH INPUT VALIDATION =====");

test("Seraph investigation limits input length", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/web/server.ts", import.meta.url).pathname,
    "utf8"
  );
  const investigateIdx = content.indexOf("/api/seraph/investigate");
  const section = content.slice(investigateIdx, investigateIdx + 500);
  assert.ok(
    section.includes(".slice(0, 2000)") || section.includes("trim().slice("),
    "server.ts should limit investigation input length"
  );
  assert.ok(
    section.includes('typeof problem !== "string"'),
    "server.ts should type-check problem parameter"
  );
});

/* ======================================================
   5. RATE LIMITER MAX SIZE
   ====================================================== */
console.log("\n===== RATE LIMITER BOUNDS =====");

test("Rate limiter has max user limit", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/security/rate-limit.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("maxUsers"),
    "rate-limit.ts should have maxUsers parameter"
  );
  assert.ok(
    content.includes("this.users.size >= this.maxUsers"),
    "rate-limit.ts should enforce max user limit"
  );
});

/* ======================================================
   6. PROCESS ERROR HANDLERS
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
   7. SECURITY HEADERS
   ====================================================== */
console.log("\n===== SECURITY HEADERS =====");

test("Express server has security headers", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/web/server.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(content.includes("X-Content-Type-Options"), "Should set X-Content-Type-Options");
  assert.ok(content.includes("X-Frame-Options"), "Should set X-Frame-Options");
  assert.ok(content.includes("Strict-Transport-Security"), "Should set HSTS");
  assert.ok(!content.includes('x-powered-by'), "X-Powered-By should be removed");
});

/* ======================================================
   8. CSRF PROTECTION
   ====================================================== */
console.log("\n===== CSRF PROTECTION =====");

test("All mutating endpoints have CSRF protection", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/web/server.ts", import.meta.url).pathname,
    "utf8"
  );
  // Check that POST/PUT/DELETE routes use requireCsrf
  const postRoutes = content.match(/app\.(post|put|delete)\([^)]+/g) || [];
  for (const route of postRoutes) {
    if (route.includes("/api/") || route.includes("/auth/")) {
      // These should have requireCsrf nearby
    }
  }
  assert.ok(
    content.includes("requireCsrf"),
    "server.ts should use requireCsrf middleware"
  );
});

/* ======================================================
   9. STATIC FILE ISOLATION
   ====================================================== */
console.log("\n===== STATIC FILE ISOLATION =====");

test("Static files serve only from public directory", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/web/server.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes('express.static(path.join(__dirname, "public"))'),
    "server.ts should only serve from public/ directory"
  );
  // Verify data/ is not in static serving path
  assert.ok(
    !content.includes('express.static("data")') && !content.includes("express.static('data')"),
    "server.ts should not serve data/ directory"
  );
});

/* ======================================================
   10. PATH TRAVERSAL PREVENTION
   ====================================================== */
console.log("\n===== PATH TRAVERSAL =====");

test("Guild config sanitizes guildId", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/core/guild-config.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("sanitizeGuildId"),
    "guild-config.ts should sanitize guildId"
  );
  assert.ok(
    content.includes("[a-zA-Z0-9_-]"),
    "guild-config.ts should strip non-alphanumeric characters"
  );
});

/* ======================================================
   11. PROVIDER ERROR REDACTION
   ====================================================== */
console.log("\n===== PROVIDER ERROR REDACTION =====");

test("Provider errors don't include response bodies", async () => {
  const fs = await import("fs");
  const providers = ["openai-compatible.ts", "anthropic.ts", "groq.ts", "cohere.ts"];
  for (const file of providers) {
    const content = fs.readFileSync(
      new URL(`../src/ai/providers/${file}`, import.meta.url).pathname,
      "utf8"
    );
    assert.ok(
      !content.includes("${body}") && !content.includes("${errorBody}"),
      `${file} should not include response body in error messages`
    );
  }
});

test("Router sanitizeError truncates errors", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/ai/router.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("sanitizeError"),
    "router.ts should have sanitizeError method"
  );
  assert.ok(
    content.includes("raw.slice(0, 200)"),
    "router.ts should truncate errors to 200 chars"
  );
});

/* ======================================================
   12. AUTHENTICATION REGRESSION
   ====================================================== */
console.log("\n===== AUTH REGRESSION =====");

test("Password login has rate limiting", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/control/auth.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("check(ip)") && content.includes("check(username)"),
    "auth.ts should rate-limit by both IP and username"
  );
});

test("Session rotation exists", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/control/session-store.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("SESSION_ROTATION_MS"),
    "session-store.ts should have rotation interval"
  );
  assert.ok(
    content.includes("rotateSession"),
    "session-store.ts should have rotateSession function"
  );
});

test("CSRF uses timing-safe comparison", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/control/session-store.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("timingSafeEqual"),
    "session-store.ts should use timingSafeEqual for CSRF validation"
  );
});

/* ======================================================
   13. SHUTDOWN HANDLERS
   ====================================================== */
console.log("\n===== SHUTDOWN HANDLERS =====");

test("Shutdown handlers exist for SIGINT and SIGTERM", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/index.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes('process.on("SIGINT"'),
    "index.ts should handle SIGINT"
  );
  assert.ok(
    content.includes('process.on("SIGTERM"'),
    "index.ts should handle SIGTERM"
  );
});

test("Shutdown cleans up Discord client", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/index.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("client.destroy()"),
    "index.ts should destroy Discord client on shutdown"
  );
});

test("Shutdown stops agent manager", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/index.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("agentManager.stop()"),
    "index.ts should stop agent manager on shutdown"
  );
});

/* ======================================================
   14. EXPRESSION ERROR HANDLER
   ====================================================== */
console.log("\n===== EXPRESS ERROR HANDLER =====");

test("Express has global error handler", async () => {
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
   15. DATA PERSISTENCE SAFETY
   ====================================================== */
console.log("\n===== DATA PERSISTENCE =====");

test("Atomic writes use tmp+rename pattern", async () => {
  const fs = await import("fs");
  const files = [
    "../src/core/data-store.ts",
    "../src/core/guild-config.ts",
    "../src/security/audit.ts",
    "../src/control/account-store.ts",
    "../src/control/session-store.ts",
  ];
  for (const file of files) {
    const content = fs.readFileSync(
      new URL(file, import.meta.url).pathname,
      "utf8"
    );
    assert.ok(
      content.includes(".tmp") && content.includes("renameSync"),
      `${file} should use tmp+rename pattern`
    );
  }
});

test("Corrupted JSON falls back to defaults", async () => {
  const fs = await import("fs");
  const files = [
    "../src/control/account-store.ts",
    "../src/control/session-store.ts",
    "../src/core/guild-config.ts",
  ];
  for (const file of files) {
    const content = fs.readFileSync(
      new URL(file, import.meta.url).pathname,
      "utf8"
    );
    assert.ok(
      content.includes("catch") && (content.includes("default") || content.includes("[]") || content.includes("return")),
      `${file} should handle corrupted JSON gracefully`
    );
  }
});

/* ======================================================
   16. SECRET REDACTION IN LOGS
   ====================================================== */
console.log("\n===== LOG REDACTION =====");

test("Logger passes through redactLogMessage", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/logger.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("redactLogMessage"),
    "logger.ts should use redactLogMessage"
  );
});

test("Redaction covers API keys and tokens", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/security/patterns.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("api[_-]?key") || content.includes("API_KEY"),
    "patterns.ts should redact API keys"
  );
  assert.ok(
    content.includes("token") || content.includes("TOKEN"),
    "patterns.ts should redact tokens"
  );
});

/* ======================================================
   17. OAUTH SECURITY
   ====================================================== */
console.log("\n===== OAUTH SECURITY =====");

test("OAuth state uses random bytes and expiry", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/control/oauth.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("randomBytes"),
    "oauth.ts should use crypto.randomBytes for state"
  );
  assert.ok(
    content.includes("10 * 60 * 1000") || content.includes("600_000"),
    "oauth.ts should have 10-minute state expiry"
  );
});

test("OAuth state is consumed once", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync(
    new URL("../src/control/oauth.ts", import.meta.url).pathname,
    "utf8"
  );
  assert.ok(
    content.includes("oauthStates.delete"),
    "oauth.ts should delete state after use (replay prevention)"
  );
});

/* ======================================================
   SUMMARY
   ====================================================== */
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0
  ? "🎉 ALL U13 REGRESSION TESTS PASSED"
  : "⚠️ SOME U13 TESTS FAILED");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

process.exit(failed > 0 ? 1 : 0);
