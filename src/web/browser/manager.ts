/* ================================================================
 * BROWSER MANAGER
 *
 * Centralized Playwright/Chromium lifecycle management.
 * Handles browser launch, context isolation, page management,
 * concurrency control, resource accounting, and graceful shutdown.
 * ================================================================ */

import type { Browser, BrowserContext, Page } from "playwright";
import { logger } from "../../logger";
import type {
  BrowserConfig,
  BrowserSession,
  BrowserHealthStatus,
} from "./types";
import { DEFAULT_BROWSER_CONFIG } from "./types";
import { validateUrl, resolveAndValidateHost, validateRedirect } from "./security";

/* ================================================================
 * BROWSER AVAILABILITY
 * ================================================================ */

let playwrightAvailable = false;
let chromiumModule: typeof import("playwright") | null = null;

async function checkPlaywrightAvailability(): Promise<boolean> {
  try {
    chromiumModule = await import("playwright");
    playwrightAvailable = true;
    logger.info("✅ Playwright/Chromium available");
    return true;
  } catch (error) {
    playwrightAvailable = false;
    logger.warn(
      `⚠️ Playwright/Chromium not available: ${error instanceof Error ? error.message : String(error)}. ` +
      `Browser features will be disabled. HTTP pipeline remains available.`
    );
    return false;
  }
}

/* ================================================================
 * BROWSER MANAGER
 * ================================================================ */

export class BrowserManager {
  private browser: Browser | null = null;
  private contexts = new Map<string, BrowserContext>();
  private pages = new Map<string, Page>();
  private sessions = new Map<string, BrowserSession>();
  private config: BrowserConfig;
  private initialized = false;
  private shutdownInProgress = false;
  private totalOperations = 0;
  private failedOperations = 0;
  private lastError: string | null = null;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = { ...DEFAULT_BROWSER_CONFIG, ...config };
  }

  /* ================================================================
   * INITIALIZATION
   * ================================================================ */

  async initialize(): Promise<boolean> {
    if (this.initialized) return playwrightAvailable;

    const available = await checkPlaywrightAvailability();
    if (!available) {
      this.initialized = true;
      return false;
    }

    try {
      await this.launchBrowser();
      this.initialized = true;
      return true;
    } catch (error) {
      logger.warn(
        `⚠️ Browser launch failed: ${error instanceof Error ? error.message : String(error)}. ` +
        `Browser features disabled.`
      );
      this.lastError = error instanceof Error ? error.message : String(error);
      this.initialized = true;
      return false;
    }
  }

  isAvailable(): boolean {
    return playwrightAvailable && this.browser !== null && !this.shutdownInProgress;
  }

  /* ================================================================
   * BROWSER LAUNCH
   * ================================================================ */

  private async launchBrowser(): Promise<void> {
    if (!chromiumModule) {
      throw new Error("Playwright not available");
    }

    const launchOptions = {
      headless: this.config.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-default-browser-check",
      ],
    };

    if (this.config.executablePath) {
      (launchOptions as any).executablePath = this.config.executablePath;
    }

    this.browser = await chromiumModule.chromium.launch(launchOptions);

    this.browser.on("disconnected", () => {
      logger.warn("🔴 Browser disconnected");
      this.browser = null;
      this.cleanupSessions();
    });

    logger.info("🚀 Browser launched successfully");
  }

  /* ================================================================
   * CONTEXT + PAGE CREATION (isolated per session)
   * ================================================================ */

  async createSession(
    userId: string,
    guildId: string,
  ): Promise<{ sessionId: string; available: boolean }> {
    if (!this.isAvailable()) {
      return { sessionId: "", available: false };
    }

    // Check session limits
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => s.status === "active"
    );
    if (activeSessions.length >= this.config.maxSessions) {
      logger.warn(`Browser session limit reached (${this.config.maxSessions})`);
      return { sessionId: "", available: false };
    }

    const sessionId = `bsess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const context = await this.browser!.newContext({
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 720 },
        locale: "en-US",
        timezoneId: "America/New_York",
        // Isolation: no persistent cookies/storage
        storageState: undefined,
      });

      this.contexts.set(sessionId, context);

      const session: BrowserSession = {
        id: sessionId,
        userId,
        guildId,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        navigationCount: 0,
        clickCount: 0,
        scrollCount: 0,
        pageCount: 0,
        status: "active",
      };
      this.sessions.set(sessionId, session);

      logger.debug(`🌐 Browser session created: ${sessionId} (user=${userId} guild=${guildId})`);
      return { sessionId, available: true };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.failedOperations++;
      logger.error(`Failed to create browser session: ${this.lastError}`);
      return { sessionId: "", available: false };
    }
  }

  /* ================================================================
   * PAGE OPERATIONS
   * ================================================================ */

  async createPage(sessionId: string): Promise<Page | null> {
    const context = this.contexts.get(sessionId);
    const session = this.sessions.get(sessionId);
    if (!context || !session || session.status !== "active") {
      return null;
    }

    // Check page limits
    const sessionPages = Array.from(this.pages.entries()).filter(
      ([id]) => id.startsWith(sessionId)
    );
    if (sessionPages.length >= this.config.maxPagesPerSession) {
      logger.warn(`Page limit reached for session ${sessionId}`);
      return null;
    }

    try {
      const page = await context.newPage();
      const pageId = `${sessionId}_page_${session.pageCount}`;
      this.pages.set(pageId, page);
      session.pageCount++;
      session.lastActivityAt = Date.now();
      return page;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.failedOperations++;
      logger.error(`Failed to create page: ${this.lastError}`);
      return null;
    }
  }

  getPage(sessionId: string, pageIndex = 0): Page | null {
    const pageId = `${sessionId}_page_${pageIndex}`;
    return this.pages.get(pageId) || null;
  }

  /* ================================================================
   * NAVIGATION WITH SECURITY
   * ================================================================ */

  async navigate(
    sessionId: string,
    url: string,
    pageIndex = 0,
  ): Promise<{ success: boolean; title?: string; status?: number; error?: string }> {
    const session = this.sessions.get(sessionId);
    const page = this.getPage(sessionId, pageIndex);
    if (!session || !page || session.status !== "active") {
      return { success: false, error: "Invalid session or page" };
    }

    // Check navigation limits
    if (session.navigationCount >= this.config.maxNavigations) {
      return { success: false, error: "Navigation limit reached" };
    }

    // Validate URL
    const urlCheck = validateUrl(url);
    if (!urlCheck.valid) {
      return { success: false, error: urlCheck.reason };
    }

    // Resolve and validate hostname
    const hostCheck = await resolveAndValidateHost(urlCheck.parsedUrl!.hostname);
    if (!hostCheck.valid) {
      return { success: false, error: hostCheck.reason };
    }

    try {
      const response = await page.goto(url, {
        timeout: this.config.navigationTimeoutMs,
        waitUntil: "domcontentloaded",
      });

      // Redirect SSRF validation: check if the final URL after redirects
      // differs from the original. If so, validate the redirect destination.
      const finalUrl = page.url();
      if (finalUrl !== url && !finalUrl.startsWith(url)) {
        const redirectCheck = await validateRedirect(url, finalUrl);
        if (!redirectCheck.valid) {
          // Navigate back to about:blank to prevent staying on unsafe page
          await page.goto("about:blank").catch(() => {});
          return {
            success: false,
            error: `Redirect blocked: ${redirectCheck.reason}`,
          };
        }
      }

      session.navigationCount++;
      session.lastActivityAt = Date.now();
      this.totalOperations++;

      const title = await page.title();
      return {
        success: true,
        title,
        status: response?.status() || 0,
      };
    } catch (error) {
      this.failedOperations++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return { success: false, error: this.lastError };
    }
  }

  /* ================================================================
   * EXTRACTION
   * ================================================================ */

  async extractContent(
    sessionId: string,
    selector?: string,
    pageIndex = 0,
  ): Promise<{
    success: boolean;
    text?: string;
    title?: string;
    url?: string;
    links?: Array<{ text: string; href: string }>;
    headings?: Array<{ level: number; text: string }>;
    error?: string;
  }> {
    const session = this.sessions.get(sessionId);
    const page = this.getPage(sessionId, pageIndex);
    if (!session || !page || session.status !== "active") {
      return { success: false, error: "Invalid session or page" };
    }

    try {
      const title = await page.title();
      const url = page.url();

      let text: string;
      if (selector) {
        const element = await page.$(selector);
        if (!element) {
          return { success: false, error: `Element not found: ${selector}` };
        }
        text = await element.evaluate((el) => (el as HTMLElement).innerText || el.textContent || "");
      } else {
        text = await page.innerText("body");
      }

      // Truncate to max length
      if (text.length > this.config.maxExtractedTextLength) {
        text = text.slice(0, this.config.maxExtractedTextLength) + "...";
      }

      // Extract links
      const links = await page.$$eval("a[href]", (anchors) =>
        anchors
          .map((a) => ({
            text: (a as HTMLAnchorElement).innerText?.trim() || "",
            href: (a as HTMLAnchorElement).href || "",
          }))
          .filter((l) => l.text && l.href)
          .slice(0, 100)
      );

      // Extract headings
      const headings = await page.$$eval(
        "h1, h2, h3, h4, h5, h6",
        (els) =>
          els
            .map((el) => ({
              level: parseInt(el.tagName.replace("H", ""), 10),
              text: (el as HTMLElement).innerText?.trim() || "",
            }))
            .filter((h) => h.text)
            .slice(0, 50)
      );

      session.lastActivityAt = Date.now();
      this.totalOperations++;

      return { success: true, text, title, url, links, headings };
    } catch (error) {
      this.failedOperations++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return { success: false, error: this.lastError };
    }
  }

  /* ================================================================
   * SCREENSHOT
   * ================================================================ */

  async screenshot(
    sessionId: string,
    pageIndex = 0,
  ): Promise<{
    success: boolean;
    buffer?: Buffer;
    width?: number;
    height?: number;
    error?: string;
  }> {
    const session = this.sessions.get(sessionId);
    const page = this.getPage(sessionId, pageIndex);
    if (!session || !page || session.status !== "active") {
      return { success: false, error: "Invalid session or page" };
    }

    try {
      const buffer = await page.screenshot({
        type: "png",
        fullPage: false,
      });

      // Enforce screenshot byte size limit
      if (buffer.length > this.config.maxScreenshotBytes) {
        return {
          success: false,
          error: `Screenshot too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max ${(this.config.maxScreenshotBytes / 1024 / 1024).toFixed(1)}MB)`,
        };
      }

      session.lastActivityAt = Date.now();
      this.totalOperations++;

      return {
        success: true,
        buffer,
        width: this.config.maxScreenshotWidth,
        height: this.config.maxScreenshotHeight,
      };
    } catch (error) {
      this.failedOperations++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return { success: false, error: this.lastError };
    }
  }

  /* ================================================================
   * INTERACTIVE ACTIONS
   * ================================================================ */

  async click(
    sessionId: string,
    selector: string,
    pageIndex = 0,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId);
    const page = this.getPage(sessionId, pageIndex);
    if (!session || !page || session.status !== "active") {
      return { success: false, error: "Invalid session or page" };
    }

    if (session.clickCount >= this.config.maxClicks) {
      return { success: false, error: "Click limit reached" };
    }

    try {
      await page.click(selector, { timeout: this.config.actionTimeoutMs });
      session.clickCount++;
      session.lastActivityAt = Date.now();
      this.totalOperations++;
      return { success: true };
    } catch (error) {
      this.failedOperations++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return { success: false, error: this.lastError };
    }
  }

  async type(
    sessionId: string,
    selector: string,
    text: string,
    pageIndex = 0,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId);
    const page = this.getPage(sessionId, pageIndex);
    if (!session || !page || session.status !== "active") {
      return { success: false, error: "Invalid session or page" };
    }

    try {
      await page.fill(selector, text, { timeout: this.config.actionTimeoutMs });
      session.lastActivityAt = Date.now();
      this.totalOperations++;
      return { success: true };
    } catch (error) {
      this.failedOperations++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return { success: false, error: this.lastError };
    }
  }

  async scroll(
    sessionId: string,
    direction: "up" | "down" | "top" | "bottom",
    pageIndex = 0,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId);
    const page = this.getPage(sessionId, pageIndex);
    if (!session || !page || session.status !== "active") {
      return { success: false, error: "Invalid session or page" };
    }

    if (session.scrollCount >= this.config.maxScrolls) {
      return { success: false, error: "Scroll limit reached" };
    }

    try {
      switch (direction) {
        case "down":
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          break;
        case "up":
          await page.evaluate(() => window.scrollBy(0, -window.innerHeight));
          break;
        case "top":
          await page.evaluate(() => window.scrollTo(0, 0));
          break;
        case "bottom":
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          break;
      }
      session.scrollCount++;
      session.lastActivityAt = Date.now();
      this.totalOperations++;
      return { success: true };
    } catch (error) {
      this.failedOperations++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return { success: false, error: this.lastError };
    }
  }

  async waitForSelector(
    sessionId: string,
    selector: string,
    timeoutMs?: number,
    pageIndex = 0,
  ): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId);
    const page = this.getPage(sessionId, pageIndex);
    if (!session || !page || session.status !== "active") {
      return { success: false, error: "Invalid session or page" };
    }

    try {
      await page.waitForSelector(selector, {
        timeout: timeoutMs || this.config.actionTimeoutMs,
      });
      session.lastActivityAt = Date.now();
      this.totalOperations++;
      return { success: true };
    } catch (error) {
      this.failedOperations++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return { success: false, error: this.lastError };
    }
  }

  async goBack(sessionId: string, pageIndex = 0): Promise<{ success: boolean; error?: string }> {
    const page = this.getPage(sessionId, pageIndex);
    if (!page) return { success: false, error: "Invalid page" };

    try {
      await page.goBack({ timeout: this.config.navigationTimeoutMs });
      this.totalOperations++;
      return { success: true };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return { success: false, error: this.lastError };
    }
  }

  async goForward(sessionId: string, pageIndex = 0): Promise<{ success: boolean; error?: string }> {
    const page = this.getPage(sessionId, pageIndex);
    if (!page) return { success: false, error: "Invalid page" };

    try {
      await page.goForward({ timeout: this.config.navigationTimeoutMs });
      this.totalOperations++;
      return { success: true };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return { success: false, error: this.lastError };
    }
  }

  /* ================================================================
   * SESSION CLEANUP
   * ================================================================ */

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = "closed";

    // Close all pages for this session
    for (const [pageId, page] of this.pages) {
      if (pageId.startsWith(sessionId)) {
        try {
          await page.close();
        } catch {}
        this.pages.delete(pageId);
      }
    }

    // Close context
    const context = this.contexts.get(sessionId);
    if (context) {
      try {
        await context.close();
      } catch {}
      this.contexts.delete(sessionId);
    }

    this.sessions.delete(sessionId);
    logger.debug(`🌐 Browser session closed: ${sessionId}`);
  }

  private cleanupSessions(): void {
    for (const [id, session] of this.sessions) {
      if (session.status === "active") {
        session.status = "error";
      }
    }
    // Close all contexts and pages
    for (const [, context] of this.contexts) {
      try { context.close(); } catch {}
    }
    for (const [, page] of this.pages) {
      try { page.close(); } catch {}
    }
    this.contexts.clear();
    this.pages.clear();
  }

  /* ================================================================
   * HEALTH
   * ================================================================ */

  getHealth(): BrowserHealthStatus {
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => s.status === "active"
    ).length;

    return {
      available: this.isAvailable(),
      chromiumPath: this.browser ? "connected" : null,
      activeSessions,
      maxSessions: this.config.maxSessions,
      totalOperations: this.totalOperations,
      failedOperations: this.failedOperations,
      lastError: this.lastError,
    };
  }

  getConfig(): Readonly<BrowserConfig> {
    return { ...this.config };
  }

  /* ================================================================
   * SHUTDOWN
   * ================================================================ */

  async shutdown(): Promise<void> {
    if (this.shutdownInProgress) return;
    this.shutdownInProgress = true;

    logger.info("🛑 Browser manager shutting down...");

    // Close all sessions
    for (const [id] of this.sessions) {
      await this.closeSession(id);
    }

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
      this.browser = null;
    }

    this.contexts.clear();
    this.pages.clear();
    this.sessions.clear();

    logger.info("✅ Browser manager shutdown complete");
  }
}

/* ================================================================
 * SINGLETON
 * ================================================================ */

let instance: BrowserManager | null = null;

export function getBrowserManager(config?: Partial<BrowserConfig>): BrowserManager {
  if (!instance) {
    instance = new BrowserManager(config);
  }
  return instance;
}
