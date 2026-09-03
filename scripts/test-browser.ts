/* ================================================================
 * BROWSER AGENT TESTS
 *
 * Tests for the Playwright-based browser automation subsystem.
 * Covers security, lifecycle, tools, resource limits, and
 * graceful degradation when Chromium is unavailable.
 * ================================================================ */

import {
  validateUrl,
  resolveAndValidateHost,
  validateRedirect,
  validateSelector,
  validateTextInput,
  redactSensitiveContent,
} from "../src/web/browser/security";
import {
  BrowserManager,
  getBrowserManager,
} from "../src/web/browser/manager";
import {
  DEFAULT_BROWSER_CONFIG,
} from "../src/web/browser/types";

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition: boolean, message: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

function section(name: string): void {
  console.log(`\n🔐 ${name}`);
}

async function main(): Promise<void> {
  /* ================================================================
   * SECURITY TESTS
   * ================================================================ */

  section("validateUrl");

  assert(validateUrl("https://example.com").valid === true, "allows valid HTTPS URLs");
  assert(validateUrl("http://example.com").valid === true, "allows valid HTTP URLs");
  assert(validateUrl("file:///etc/passwd").valid === false, "blocks file:// protocol");
  assert(validateUrl("javascript:alert(1)").valid === false, "blocks javascript: protocol");
  assert(validateUrl("data:text/html,<script>alert(1)</script>").valid === false, "blocks data: protocol");
  assert(validateUrl("blob:https://example.com/fake-id").valid === false, "blocks blob: protocol");
  assert(validateUrl("http://localhost:8080").valid === false, "blocks localhost");
  assert(validateUrl("http://0.0.0.0").valid === false, "blocks 0.0.0.0");
  assert(validateUrl("http://[::1]").valid === false, "blocks ::1");
  assert(validateUrl("http://myhost.local").valid === false, "blocks .local TLD");
  assert(validateUrl("http://myhost.internal").valid === false, "blocks .internal TLD");
  assert(validateUrl("not-a-url").valid === false, "blocks invalid URLs");
  assert(validateUrl("ftp://example.com").valid === false, "blocks unsupported protocols");

  section("resolveAndValidateHost");

  const localhostResult = await resolveAndValidateHost("localhost");
  assert(localhostResult.valid === false, "blocks localhost");

  const metadataResult = await resolveAndValidateHost("169.254.169.254");
  assert(metadataResult.valid === false, "blocks metadata endpoint");

  const localResult = await resolveAndValidateHost("myhost.local");
  assert(localResult.valid === false, "blocks .local domains");

  section("validateRedirect");

  const httpsRedirect = await validateRedirect("http://example.com", "https://example.com/page");
  assert(httpsRedirect.valid === true, "allows HTTPS redirect");

  const httpDowngrade = await validateRedirect("https://example.com", "http://example.com/page");
  assert(httpDowngrade.valid === false, "blocks HTTP downgrade from HTTPS");

  const privateRedirect = await validateRedirect("http://example.com", "http://192.168.1.1");
  assert(privateRedirect.valid === false, "blocks redirect to private IP");

  section("validateSelector");

  assert(validateSelector(".my-class").valid === true, "allows valid CSS selectors");
  assert(validateSelector("#my-id").valid === true, "allows ID selectors");
  assert(validateSelector("div > p").valid === true, "allows complex selectors");
  assert(validateSelector("").valid === false, "blocks empty selectors");
  assert(validateSelector("a".repeat(600)).valid === false, "blocks overly long selectors");
  assert(validateSelector("javascript:alert(1)").valid === false, "blocks javascript in selectors");
  assert(validateSelector("div[onclick='alert(1)']").valid === false, "blocks onclick in selectors");

  section("validateTextInput");

  assert(validateTextInput("Hello world").valid === true, "allows normal text");
  assert(validateTextInput("a".repeat(20000)).valid === false, "blocks overly long text");
  assert(validateTextInput("hello\x00world").valid === false, "blocks null bytes");
  assert(validateTextInput("hello\x08world").valid === false, "blocks control characters");
  assert(validateTextInput("hello\n\tworld").valid === true, "allows newlines and tabs");

  section("redactSensitiveContent");

  const passwordRedacted = redactSensitiveContent("password = mysecret123456");
  assert(passwordRedacted.includes("[REDACTED]"), "redacts passwords");
  assert(!passwordRedacted.includes("mysecret123456"), "password value removed");

  const apiKeyRedacted = redactSensitiveContent("api_key = abcdefghijklmnop");
  assert(apiKeyRedacted.includes("[REDACTED]"), "redacts API keys");

  const bearerRedacted = redactSensitiveContent("Authorization: Bearer abcdefghijklmnop");
  assert(bearerRedacted.includes("[REDACTED]"), "redacts bearer tokens");

  const normalText = "This is normal text without secrets.";
  assert(redactSensitiveContent(normalText) === normalText, "leaves normal text unchanged");

  /* ================================================================
   * BROWSER MANAGER TESTS
   * ================================================================ */

  section("Browser Manager Lifecycle");

  const manager = new BrowserManager({ headless: true });

  const initResult = await manager.initialize();
  assert(typeof initResult === "boolean", "initializes without crashing");

  const health = manager.getHealth();
  assert(health.hasOwnProperty("available"), "reports available status");
  assert(health.hasOwnProperty("activeSessions"), "reports active sessions");
  assert(health.hasOwnProperty("maxSessions"), "reports max sessions");
  assert(health.hasOwnProperty("totalOperations"), "reports total operations");
  assert(health.maxSessions === DEFAULT_BROWSER_CONFIG.maxSessions, "max sessions matches config");

  const config = manager.getConfig();
  assert(config.maxSessions === DEFAULT_BROWSER_CONFIG.maxSessions, "config max sessions correct");
  assert(config.navigationTimeoutMs === DEFAULT_BROWSER_CONFIG.navigationTimeoutMs, "config timeout correct");
  assert(config.headless === true, "config headless correct");

  // Session creation when unavailable
  const { sessionId, available } = await manager.createSession("user1", "guild1");
  if (!manager.isAvailable()) {
    assert(available === false, "session creation fails gracefully when unavailable");
    assert(sessionId === "", "session ID is empty when unavailable");
  }

  // Graceful shutdown
  await manager.shutdown();
  assert(manager.isAvailable() === false, "shutdown marks manager unavailable");

  /* ================================================================
   * BROWSER TOOLS TESTS
   * ================================================================ */

  section("Browser Tools (Unavailable Browser)");

  const { browserOpen, browserNavigate, browserClick, browserType,
          browserScroll, browserWait, browserExtract, browserScreenshot,
          browserBack, browserForward, browserClose } = await import("../src/web/browser/tools");

  const testCtx = { userId: "test-user", guildId: "test-guild", sessionId: "nonexistent", isBotOwner: false };

  const openResult = await browserOpen(testCtx, "https://example.com");
  assert(openResult.success === false, "browserOpen fails gracefully");

  const navResult = await browserNavigate(testCtx, "https://example.com");
  assert(navResult.success === false, "browserNavigate fails gracefully");

  const clickResult = await browserClick(testCtx, ".button");
  assert(clickResult.success === false, "browserClick fails gracefully");

  const typeResult = await browserType(testCtx, "input", "text");
  assert(typeResult.success === false, "browserType fails gracefully");

  const scrollResult = await browserScroll(testCtx, "down");
  assert(scrollResult.success === false, "browserScroll fails gracefully");

  const waitResult = await browserWait(testCtx, ".element");
  assert(waitResult.success === false, "browserWait fails gracefully");

  const extractResult = await browserExtract(testCtx);
  assert(extractResult.success === false, "browserExtract fails gracefully");

  const screenshotResult = await browserScreenshot(testCtx);
  assert(screenshotResult.success === false, "browserScreenshot fails gracefully");

  const backResult = await browserBack(testCtx);
  assert(backResult.success === false, "browserBack fails gracefully");

  const forwardResult = await browserForward(testCtx);
  assert(forwardResult.success === false, "browserForward fails gracefully");

  const closeResult = await browserClose(testCtx);
  assert(closeResult.success === true, "browserClose succeeds even with invalid session");

  /* ================================================================
   * RESOURCE LIMITS TESTS
   * ================================================================ */

  section("Browser Resource Limits");

  assert(DEFAULT_BROWSER_CONFIG.maxSessions <= 10, "max sessions <= 10");
  assert(DEFAULT_BROWSER_CONFIG.maxPagesPerSession <= 10, "max pages per session <= 10");
  assert(DEFAULT_BROWSER_CONFIG.navigationTimeoutMs <= 60_000, "navigation timeout <= 60s");
  assert(DEFAULT_BROWSER_CONFIG.actionTimeoutMs <= 30_000, "action timeout <= 30s");
  assert(DEFAULT_BROWSER_CONFIG.maxResearchDurationMs <= 10 * 60_000, "research duration <= 10min");
  assert(DEFAULT_BROWSER_CONFIG.maxRedirects <= 10, "max redirects <= 10");
  assert(DEFAULT_BROWSER_CONFIG.maxNavigations <= 50, "max navigations <= 50");
  assert(DEFAULT_BROWSER_CONFIG.maxClicks <= 100, "max clicks <= 100");
  assert(DEFAULT_BROWSER_CONFIG.maxScrolls <= 50, "max scrolls <= 50");
  assert(DEFAULT_BROWSER_CONFIG.maxSessions > 0, "max sessions > 0");
  assert(DEFAULT_BROWSER_CONFIG.maxPagesPerSession > 0, "max pages per session > 0");
  assert(DEFAULT_BROWSER_CONFIG.navigationTimeoutMs > 0, "navigation timeout > 0");
  assert(DEFAULT_BROWSER_CONFIG.maxPageSize > 0, "max page size > 0");
  assert(DEFAULT_BROWSER_CONFIG.maxExtractedTextLength > 0, "max extracted text > 0");

  /* ================================================================
   * PIPELINE INTEGRATION TESTS
   * ================================================================ */

  section("Pipeline SPA Detection");

  const spaHtml = `
    <html>
      <head><title>SPA App</title></head>
      <body>
        <div id="root"></div>
        <script type="module" src="/app.js"></script>
      </body>
    </html>
  `;
  const SPA_INDICATORS = [
    /<div\s+id=["']?root["']?\s*>/i,
    /<div\s+id=["']?app["']?\s*>/i,
    /<div\s+id=["']?__next["']?\s*>/i,
    /<noscript>/i,
    /<script\s+type=["']?module["']?\s*>/i,
    /react|vue|angular|svelte/i,
  ];
  const textOnly = spaHtml.replace(/<[^>]+>/g, "").trim();
  const isSpa = SPA_INDICATORS.some((p) => p.test(spaHtml)) && textOnly.length < 500;
  assert(isSpa === true, "detects SPA shell HTML");

  const normalHtml = `
    <html>
      <head><title>Article</title></head>
      <body>
        <article>
          <h1>My Article</h1>
          <p>This is a long article with lots of content about various topics.
          It contains multiple paragraphs and detailed information that would
          be useful for research purposes.</p>
        </article>
      </body>
    </html>
  `;
  const normalTextOnly = normalHtml.replace(/<[^>]+>/g, "").trim();
  const normalIsSpa = SPA_INDICATORS.some((p) => p.test(normalHtml)) && normalTextOnly.length < 500;
  assert(normalIsSpa === false, "does not detect normal HTML as SPA");

  /* ================================================================
   * SUMMARY
   * ================================================================ */

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Browser Agent Tests: ${passed}/${total} passed, ${failed} failed`);
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Test runner failed:", error);
  process.exit(1);
});
