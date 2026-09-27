/**
 * Local Web E2E Test
 *
 * Boots the real Express app in-process and asserts the public HTTP contract:
 * static asset MIME types, page routes, API handler reachability, and 404 behaviour.
 */

process.env.NODE_ENV = "test";
process.env.PORT = "18080";
process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars-long";
process.env.ASHENAI_CORS_ORIGINS = "http://localhost:18080";
process.env.AUTH_BASE_URL = "http://localhost:18080";

const BASE_URL = "http://localhost:18080";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.error(`  ❌ ${name}: ${error}`);
    failed++;
  }
}

async function waitForServer(timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // Server not ready
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not start in time");
}

async function runTests() {
  await test("GET /api/health returns 200 JSON", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    if (!(res.headers.get("content-type") ?? "").includes("json")) throw new Error("Not JSON");
    const data = await res.json();
    if (data.ok !== true) throw new Error("Health check failed");
  });

  await test("GET / → 200 text/html with AshenAI branding", async () => {
    const res = await fetch(`${BASE_URL}/`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) throw new Error(`content-type: ${ct}`);
    const html = await res.text();
    if (!html.includes("AshenAI")) throw new Error("Missing AshenAI in landing page");
    if (html.includes("AshenWakeAI")) throw new Error("Stale AshenWakeAI branding present");
  });

  await test("GET /index.html → actual index.html", async () => {
    const res = await fetch(`${BASE_URL}/index.html`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) throw new Error(`content-type: ${ct}`);
    const html = await res.text();
    if (!html.includes("AshenAI")) throw new Error("Missing AshenAI branding");
  });

  await test("GET /css/base.css → 200 text/css with real CSS", async () => {
    const res = await fetch(`${BASE_URL}/css/base.css`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/css")) throw new Error(`content-type: ${ct}`);
    const body = await res.text();
    if (!body.includes("{")) throw new Error("Not CSS content");
    if (body.includes("<!DOCTYPE")) throw new Error("Got HTML instead of CSS (catch-all leak)");
  });

  await test("GET /js/app.js → 200 javascript MIME with real JS", async () => {
    const res = await fetch(`${BASE_URL}/js/app.js`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("javascript")) throw new Error(`content-type: ${ct}`);
    const body = await res.text();
    if (body.includes("<!DOCTYPE")) throw new Error("Got HTML instead of JS (catch-all leak)");
  });

  await test("GET /assets/logo-1.png → 200 image/png", async () => {
    const res = await fetch(`${BASE_URL}/assets/logo-1.png`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("image/png")) throw new Error(`content-type: ${ct}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 1000) throw new Error(`Suspiciously small PNG: ${buf.byteLength}`);
    const png = new Uint8Array(buf.slice(0, 4));
    if (png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) {
      throw new Error("Missing PNG magic bytes");
    }
  });

  await test("GET /assets/favicon.svg → 200 image/svg+xml", async () => {
    const res = await fetch(`${BASE_URL}/assets/favicon.svg`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("image/svg")) throw new Error(`content-type: ${ct}`);
    const body = await res.text();
    if (!body.includes("<svg")) throw new Error("Not SVG content");
  });

  await test("GET /nonexistent-static.css → 404 (not HTML 200)", async () => {
    const res = await fetch(`${BASE_URL}/nonexistent-static.css`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  await test("GET /definitely-does-not-exist → 404", async () => {
    const res = await fetch(`${BASE_URL}/definitely-does-not-exist`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  await test("GET /nonexistent-page-xyz → 404", async () => {
    const res = await fetch(`${BASE_URL}/nonexistent-page-xyz`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  await test("CSP header present on /", async () => {
    const res = await fetch(`${BASE_URL}/`);
    const csp = res.headers.get("content-security-policy");
    if (!csp || !csp.includes("default-src")) throw new Error("CSP header missing or invalid");
  });

  await test("GET /api/unknown → 404 JSON (not index.html)", async () => {
    const res = await fetch(`${BASE_URL}/api/definitely-not-a-route`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) throw new Error(`Expected JSON, got ${ct}`);
    const body = await res.text();
    if (body.includes("<!DOCTYPE")) throw new Error("API 404 returned HTML");
  });

  await test("API routes reach their handlers, not the landing page", async () => {
    const paths = [
      "/api/guilds/123/settings",
      "/api/security/sessions",
      "/api/providers/catalog",
      "/api/audit/search",
      "/api/system/diagnostics/extended",
      "/api/guilds/123/analytics",
    ];
    for (const p of paths) {
      const res = await fetch(`${BASE_URL}${p}`);
      const ct = res.headers.get("content-type") ?? "";
      const body = await res.text();
      if (body.includes("<!DOCTYPE html>")) {
        throw new Error(`${p} returned index.html (catch-all shadowing)`);
      }
      // Unauthenticated admin routes must answer 401/403/404 JSON, never HTML 200.
      if (res.status === 200 && ct.includes("text/html")) {
        throw new Error(`${p} → 200 text/html from a non-page route`);
      }
      if (!ct.includes("json")) {
        throw new Error(`${p} → ${res.status} ${ct} (expected JSON)`);
      }
    }
  });

  await test("POST /auth/login unknown body → JSON error, not HTML", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) throw new Error(`content-type: ${ct}`);
    if (res.status >= 500) throw new Error(`Status ${res.status}`);
  });

  await test("Page routes still resolve (docs/status/privacy/terms/features)", async () => {
    for (const p of ["/docs", "/status", "/privacy", "/terms", "/features"]) {
      const res = await fetch(`${BASE_URL}${p}`);
      if (res.status !== 200) throw new Error(`${p} → ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("text/html")) throw new Error(`${p} content-type: ${ct}`);
    }
  });

  await test("/dashboard unauthenticated → not 200 landing page", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`);
    const body = await res.text();
    // requireAuth should redirect/401; never silently serve the marketing page.
    if (res.status === 200 && body.includes("Intelligent infrastructure for Discord communities")) {
      throw new Error("/dashboard served the landing page unauthenticated");
    }
  });

  console.log(`\n[E2E] Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} tests failed`);
}

async function main() {
  const { AIRouter } = await import("../src/ai/router");
  const { ConversationMemory } = await import("../src/ai/memory");
  const { UsageManager } = await import("../src/ai/usage-manager");
  const { UsageStats } = await import("../src/analytics/usage-stats");
  const { SystemUsageManager } = await import("../src/ai/system-usage");
  const { registerProductionDiscordTools } = await import("../src/ai/tools/discord/bootstrap");
  const { providers } = await import("../src/ai/providers");
  const { initControlLayer } = await import("../src/control");
  const { startWebServer } = await import("../src/web/server");

  registerProductionDiscordTools(() => null);

  const router = new AIRouter(providers);
  const memory = new ConversationMemory();

  initControlLayer(router, new UsageManager(), new ConversationMemory(), () => "1.0.1-test", {
    getSystemUsage: () => ({}),
    getGlobalUsage: () => ({}),
    getBudget: () => ({}),
  });

  startWebServer(
    router,
    () => ({ discordReady: false }),
    new UsageManager(),
    new UsageStats(),
    () => "1.0.1-test",
    memory,
    new SystemUsageManager(),
  );

  console.log("[E2E] Web server started, waiting for readiness...");
  await new Promise((r) => setTimeout(r, 2000));
  await waitForServer();
  console.log("[E2E] Web server ready, running tests...");

  try {
    await runTests();
    console.log("\n[E2E] All tests passed!");
    process.exit(0);
  } catch (error) {
    console.error("[E2E] Failed:", error);
    process.exit(1);
  }
}

main();
