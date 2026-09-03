/* ================================================================
 * BROWSER AGENT TYPES
 *
 * Types for the Playwright-based browser automation subsystem.
 * ================================================================ */

export interface BrowserConfig {
  /** Maximum concurrent browser sessions */
  maxSessions: number;
  /** Maximum concurrent pages per session */
  maxPagesPerSession: number;
  /** Navigation timeout in milliseconds */
  navigationTimeoutMs: number;
  /** Action timeout in milliseconds */
  actionTimeoutMs: number;
  /** Maximum research duration in milliseconds */
  maxResearchDurationMs: number;
  /** Maximum page size in bytes */
  maxPageSize: number;
  /** Maximum extracted text length */
  maxExtractedTextLength: number;
  /** Maximum screenshot dimensions (width) */
  maxScreenshotWidth: number;
  /** Maximum screenshot dimensions (height) */
  maxScreenshotHeight: number;
  /** Maximum redirects per navigation */
  maxRedirects: number;
  /** Maximum navigation count per session */
  maxNavigations: number;
  /** Maximum click count per session */
  maxClicks: number;
  /** Maximum scroll count per session */
  maxScrolls: number;
  /** Maximum retries for failed operations */
  maxRetries: number;
  /** Enable headless mode */
  headless: boolean;
  /** Chromium executable path (optional, auto-detect if not set) */
  executablePath?: string;
}

export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  maxSessions: 3,
  maxPagesPerSession: 5,
  navigationTimeoutMs: 30_000,
  actionTimeoutMs: 10_000,
  maxResearchDurationMs: 5 * 60_000,
  maxPageSize: 10 * 1024 * 1024,
  maxExtractedTextLength: 100_000,
  maxScreenshotWidth: 1920,
  maxScreenshotHeight: 1080,
  maxRedirects: 5,
  maxNavigations: 20,
  maxClicks: 50,
  maxScrolls: 30,
  maxRetries: 2,
  headless: true,
};

export interface BrowserSession {
  id: string;
  userId: string;
  guildId: string;
  createdAt: number;
  lastActivityAt: number;
  navigationCount: number;
  clickCount: number;
  scrollCount: number;
  pageCount: number;
  status: "active" | "closed" | "error";
}

export interface BrowserActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

export interface BrowserOpenResult extends BrowserActionResult {
  data?: {
    url: string;
    title: string;
    contentLength: number;
  };
}

export interface BrowserExtractResult extends BrowserActionResult {
  data?: {
    text: string;
    title: string;
    url: string;
    links: Array<{ text: string; href: string }>;
    headings: Array<{ level: number; text: string }>;
  };
}

export interface BrowserScreenshotResult extends BrowserActionResult {
  data?: {
    buffer: Buffer;
    width: number;
    height: number;
    format: string;
  };
}

export interface BrowserNavigateResult extends BrowserActionResult {
  data?: {
    url: string;
    title: string;
    status: number;
  };
}

export type BrowserOperationType =
  | "open"
  | "navigate"
  | "click"
  | "type"
  | "fill"
  | "scroll"
  | "wait"
  | "extract"
  | "links"
  | "screenshot"
  | "back"
  | "forward"
  | "close";

export interface BrowserOperation {
  type: BrowserOperationType;
  userId: string;
  guildId: string;
  sessionId: string;
  args: Record<string, unknown>;
  startTime: number;
}

export interface BrowserHealthStatus {
  available: boolean;
  chromiumPath: string | null;
  activeSessions: number;
  maxSessions: number;
  totalOperations: number;
  failedOperations: number;
  lastError: string | null;
}
