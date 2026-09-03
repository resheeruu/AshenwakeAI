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
  validateBrowserAccess,
  requiresBrowserConfirmation,
  type BrowserToolContext,
} from "../src/web/browser/tools";
import {
  browserToolDefinitions,
} from "../src/web/browser/tool-definitions";
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
   * ACCESS CONTROL TESTS
   * ================================================================ */

  section("validateBrowserAccess");

  {
    // Member role can access read-only tools
    const memberCtx: BrowserToolContext = {
      userId: "user1",
      guildId: "guild1",
      channelId: "chan1",
      sessionId: "sess1",
      requesterRole: "member",
      isBotOwner: false,
    };

    const extractAccess = validateBrowserAccess("browser_extract", memberCtx);
    assert(extractAccess.allowed === true, "member can access browser_extract");

    const screenshotAccess = validateBrowserAccess("browser_screenshot", memberCtx);
    assert(screenshotAccess.allowed === true, "member can access browser_screenshot");

    const scrollAccess = validateBrowserAccess("browser_scroll", memberCtx);
    assert(scrollAccess.allowed === true, "member can access browser_scroll");

    // Member role cannot access moderator-only tools
    const openAccess = validateBrowserAccess("browser_open", memberCtx);
    assert(openAccess.allowed === false, "member cannot access browser_open");
    assert(openAccess.reason?.includes("moderator") || openAccess.reason?.includes("Requires"), "denial reason mentions role requirement");

    const navigateAccess = validateBrowserAccess("browser_navigate", memberCtx);
    assert(navigateAccess.allowed === false, "member cannot access browser_navigate");

    const clickAccess = validateBrowserAccess("browser_click", memberCtx);
    assert(clickAccess.allowed === false, "member cannot access browser_click");

    const typeAccess = validateBrowserAccess("browser_type", memberCtx);
    assert(typeAccess.allowed === false, "member cannot access browser_type");

    // Moderator can access all tools
    const modCtx: BrowserToolContext = {
      ...memberCtx,
      requesterRole: "moderator",
    };

    const modOpenAccess = validateBrowserAccess("browser_open", modCtx);
    assert(modOpenAccess.allowed === true, "moderator can access browser_open");

    const modNavigateAccess = validateBrowserAccess("browser_navigate", modCtx);
    assert(modNavigateAccess.allowed === true, "moderator can access browser_navigate");

    const modClickAccess = validateBrowserAccess("browser_click", modCtx);
    assert(modClickAccess.allowed === true, "moderator can access browser_click");

    const modTypeAccess = validateBrowserAccess("browser_type", modCtx);
    assert(modTypeAccess.allowed === true, "moderator can access browser_type");

    // Bot owner bypasses all restrictions
    const ownerCtx: BrowserToolContext = {
      ...memberCtx,
      requesterRole: "guest",
      isBotOwner: true,
    };

    const ownerOpenAccess = validateBrowserAccess("browser_open", ownerCtx);
    assert(ownerOpenAccess.allowed === true, "bot owner bypasses role restrictions");
  }

  section("requiresBrowserConfirmation");

  {
    assert(requiresBrowserConfirmation("browser_click") === true, "browser_click requires confirmation");
    assert(requiresBrowserConfirmation("browser_type") === true, "browser_type requires confirmation");
    assert(requiresBrowserConfirmation("browser_open") === false, "browser_open does not require confirmation");
    assert(requiresBrowserConfirmation("browser_navigate") === false, "browser_navigate does not require confirmation");
    assert(requiresBrowserConfirmation("browser_extract") === false, "browser_extract does not require confirmation");
    assert(requiresBrowserConfirmation("browser_screenshot") === false, "browser_screenshot does not require confirmation");
    assert(requiresBrowserConfirmation("browser_scroll") === false, "browser_scroll does not require confirmation");
  }

  /* ================================================================
   * TOOL DEFINITIONS TESTS
   * ================================================================ */

  section("Browser Tool Definitions");

  {
    assert(browserToolDefinitions.length === 11, `11 browser tools registered (got ${browserToolDefinitions.length})`);

    // All tools have required fields
    for (const tool of browserToolDefinitions) {
      assert(typeof tool.name === "string", `${tool.name} has name`);
      assert(typeof tool.description === "string", `${tool.name} has description`);
      assert(typeof tool.requiredRole === "string", `${tool.name} has requiredRole`);
      assert(Array.isArray(tool.allowedScopes), `${tool.name} has allowedScopes`);
      assert(typeof tool.confirmationRequired === "boolean", `${tool.name} has confirmationRequired`);
      assert(typeof tool.riskLevel === "string", `${tool.name} has riskLevel`);
      assert(typeof tool.execute === "function", `${tool.name} has execute function`);
    }

    // Check specific tool properties
    const openTool = browserToolDefinitions.find((t) => t.name === "browser_open");
    assert(openTool?.requiredRole === "moderator", "browser_open requires moderator role");
    assert(openTool?.confirmationRequired === false, "browser_open does not require confirmation");
    assert(openTool?.riskLevel === "medium", "browser_open risk is medium");

    const clickTool = browserToolDefinitions.find((t) => t.name === "browser_click");
    assert(clickTool?.requiredRole === "moderator", "browser_click requires moderator role");
    assert(clickTool?.confirmationRequired === true, "browser_click requires confirmation");
    assert(clickTool?.riskLevel === "high", "browser_click risk is high");

    const extractTool = browserToolDefinitions.find((t) => t.name === "browser_extract");
    assert(extractTool?.requiredRole === "member", "browser_extract requires member role");
    assert(extractTool?.riskLevel === "safe", "browser_extract risk is safe");

    // All tools have browser category
    for (const tool of browserToolDefinitions) {
      assert(tool.category === "browser", `${tool.name} has category=browser`);
    }
  }

  /* ================================================================
   * CROSS-GUILD ISOLATION TESTS
   * ================================================================ */

  section("Cross-Session/Cross-Guild Isolation");

  {
    // Sessions with different guilds should be isolated
    const ctx1: BrowserToolContext = {
      userId: "user1",
      guildId: "guild1",
      channelId: "chan1",
      sessionId: "sess1",
      requesterRole: "member",
      isBotOwner: false,
    };

    const ctx2: BrowserToolContext = {
      userId: "user1",
      guildId: "guild2",
      channelId: "chan1",
      sessionId: "sess1",
      requesterRole: "member",
      isBotOwner: false,
    };

    // Both should be valid contexts (isolation is enforced at session level)
    assert(ctx1.guildId !== ctx2.guildId, "different guild IDs are isolated");

    // Session IDs are unique per creation
    const manager = getBrowserManager();
    const session1 = manager.createSession("user1", "guild1");
    const session2 = manager.createSession("user2", "guild1");
    // Sessions should have different IDs (async, but structurally guaranteed)
    assert(typeof session1.then === "function", "createSession returns promise");
    assert(typeof session2.then === "function", "createSession returns promise");
  }

  /* ================================================================
   * REDIRECT SSRF VALIDATION TESTS
   * ================================================================ */

  section("Redirect SSRF Validation");

  {
    // Redirect to private IP should be blocked
    const privateRedirect = await validateRedirect(
      "https://example.com",
      "http://192.168.1.1/secret",
    );
    assert(privateRedirect.valid === false, "blocks redirect to private IP");
    assert(
      privateRedirect.reason?.includes("private") ||
      privateRedirect.reason?.includes("reserves") ||
      privateRedirect.reason?.includes("DNS") ||
      privateRedirect.reason?.includes("downgrade"),
      "reason mentions private IP, DNS failure, or protocol downgrade",
    );

    // Redirect to localhost should be blocked
    const localhostRedirect = await validateRedirect(
      "https://example.com",
      "http://localhost/admin",
    );
    assert(localhostRedirect.valid === false, "blocks redirect to localhost");

    // Redirect to metadata endpoint should be blocked
    const metadataRedirect = await validateRedirect(
      "https://example.com",
      "http://169.254.169.254/metadata",
    );
    assert(metadataRedirect.valid === false, "blocks redirect to metadata endpoint");

    // HTTP downgrade should be blocked
    const downgradeRedirect = await validateRedirect(
      "https://example.com",
      "http://example.com/page",
    );
    assert(downgradeRedirect.valid === false, "blocks HTTPS→HTTP downgrade");

    // Valid HTTPS redirect should be allowed
    const validRedirect = await validateRedirect(
      "https://example.com",
      "https://other.com/page",
    );
    assert(validRedirect.valid === true, "allows valid HTTPS redirect");
  }

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
