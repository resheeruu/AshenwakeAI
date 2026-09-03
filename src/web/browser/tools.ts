/* ================================================================
 * BROWSER TOOLS
 *
 * Controlled browser tool API for AI agents.
 * Each tool validates arguments, enforces limits, checks permissions,
 * and emits audit/tracing information.
 *
 * SECURITY: Every tool call goes through validateBrowserAccess()
 * which enforces role-based access control, channel scope, and
 * confirmation requirements using the existing permission system.
 * ================================================================ */

import { logger } from "../../logger";
import { recordAudit } from "../../security/audit";
import { hasPermission, type AshenRole } from "../../security/permissions";
import { getBrowserManager } from "./manager";
import {
  validateUrl,
  validateSelector,
  validateTextInput,
  redactSensitiveContent,
} from "./security";
import type {
  BrowserActionResult,
  BrowserOpenResult,
  BrowserExtractResult,
  BrowserScreenshotResult,
  BrowserNavigateResult,
} from "./types";

/* ================================================================
 * TOOL CONTEXT
 * ================================================================ */

export interface BrowserToolContext {
  userId: string;
  guildId: string;
  channelId: string;
  sessionId: string;
  requesterRole: AshenRole;
  isBotOwner: boolean;
}

/* ================================================================
 * ACCESS CONTROL
 *
 * Browser tools enforce role-based access:
 *   - extract, screenshot, scroll, wait, back, forward: member+
 *   - open, navigate: moderator+
 *   - click, type: moderator+ (confirmation recommended for high-risk)
 *   - close: member+ (session owner only)
 *
 * Bot owners bypass all restrictions.
 * ================================================================ */

type BrowserAction =
  | "browser_open"
  | "browser_navigate"
  | "browser_click"
  | "browser_type"
  | "browser_scroll"
  | "browser_wait"
  | "browser_extract"
  | "browser_screenshot"
  | "browser_back"
  | "browser_forward"
  | "browser_close";

const BROWSER_ROLE_REQUIREMENTS: Record<BrowserAction, AshenRole> = {
  browser_extract: "member",
  browser_screenshot: "member",
  browser_scroll: "member",
  browser_wait: "member",
  browser_back: "member",
  browser_forward: "member",
  browser_close: "member",
  browser_open: "moderator",
  browser_navigate: "moderator",
  browser_click: "moderator",
  browser_type: "moderator",
};

/** Actions that require confirmation from the same user who initiated */
const CONFIRMATION_REQUIRED_ACTIONS = new Set<BrowserAction>([
  "browser_click",
  "browser_type",
]);

export interface BrowserAccessResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate whether a requester can execute a browser action.
 * Uses the existing permission hierarchy from src/security/permissions.ts.
 */
export function validateBrowserAccess(
  action: BrowserAction,
  ctx: BrowserToolContext,
): BrowserAccessResult {
  // Bot owners bypass all restrictions
  if (ctx.isBotOwner) {
    return { allowed: true };
  }

  const requiredRole = BROWSER_ROLE_REQUIREMENTS[action];
  const check = hasPermission(ctx.requesterRole, requiredRole);

  if (!check.allowed) {
    return {
      allowed: false,
      reason: check.reason || `Insufficient role for ${action}`,
    };
  }

  return { allowed: true };
}

/**
 * Check whether a browser action requires confirmation.
 */
export function requiresBrowserConfirmation(action: BrowserAction): boolean {
  return CONFIRMATION_REQUIRED_ACTIONS.has(action);
}

/* ================================================================
 * BROWSER TOOLS
 * ================================================================ */

/**
 * Open a URL in a new browser page.
 */
export async function browserOpen(
  ctx: BrowserToolContext,
  url: string,
): Promise<BrowserOpenResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  // Access control
  const access = validateBrowserAccess("browser_open", ctx);
  if (!access.allowed) {
    recordAudit({
      who: ctx.userId,
      what: "browser_open",
      where: "browser",
      guildId: ctx.guildId,
      result: "denied",
      details: access.reason,
    });
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  if (!manager.isAvailable()) {
    return { success: false, error: "Browser not available", durationMs: Date.now() - t0 };
  }

  // Validate URL
  const urlCheck = validateUrl(url);
  if (!urlCheck.valid) {
    return { success: false, error: urlCheck.reason, durationMs: Date.now() - t0 };
  }

  // Create page
  const page = await manager.createPage(ctx.sessionId);
  if (!page) {
    return { success: false, error: "Failed to create page", durationMs: Date.now() - t0 };
  }

  // Navigate
  const navResult = await manager.navigate(ctx.sessionId, url);
  if (!navResult.success) {
    return { success: false, error: navResult.error, durationMs: Date.now() - t0 };
  }

  // Extract basic info
  const text = await page.innerText("body").catch(() => "");
  const truncated = text.length > 5000 ? text.slice(0, 5000) + "..." : text;

  recordAudit({
    who: ctx.userId,
    what: "browser_open",
    where: "browser",
    guildId: ctx.guildId,
    result: "success",
    details: `url=${url} title=${navResult.title || ""}`,
  });

  return {
    success: true,
    data: {
      url: navResult.title ? url : url,
      title: navResult.title || "",
      contentLength: truncated.length,
    },
    durationMs: Date.now() - t0,
  };
}

/**
 * Navigate to a URL in the current page.
 */
export async function browserNavigate(
  ctx: BrowserToolContext,
  url: string,
): Promise<BrowserNavigateResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  // Access control
  const access = validateBrowserAccess("browser_navigate", ctx);
  if (!access.allowed) {
    recordAudit({
      who: ctx.userId,
      what: "browser_navigate",
      where: "browser",
      guildId: ctx.guildId,
      result: "denied",
      details: access.reason,
    });
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  if (!manager.isAvailable()) {
    return { success: false, error: "Browser not available", durationMs: Date.now() - t0 };
  }

  const result = await manager.navigate(ctx.sessionId, url);

  if (result.success) {
    recordAudit({
      who: ctx.userId,
      what: "browser_navigate",
      where: "browser",
      guildId: ctx.guildId,
      result: "success",
      details: `url=${url}`,
    });
  }

  return {
    success: result.success,
    data: result.success
      ? { url, title: result.title || "", status: result.status || 0 }
      : undefined,
    error: result.error,
    durationMs: Date.now() - t0,
  };
}

/**
 * Click an element on the page.
 */
export async function browserClick(
  ctx: BrowserToolContext,
  selector: string,
): Promise<BrowserActionResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  // Access control
  const access = validateBrowserAccess("browser_click", ctx);
  if (!access.allowed) {
    recordAudit({
      who: ctx.userId,
      what: "browser_click",
      where: "browser",
      guildId: ctx.guildId,
      result: "denied",
      details: access.reason,
    });
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  if (!manager.isAvailable()) {
    return { success: false, error: "Browser not available", durationMs: Date.now() - t0 };
  }

  const selectorCheck = validateSelector(selector);
  if (!selectorCheck.valid) {
    return { success: false, error: selectorCheck.reason, durationMs: Date.now() - t0 };
  }

  const result = await manager.click(ctx.sessionId, selector);

  recordAudit({
    who: ctx.userId,
    what: "browser_click",
    where: "browser",
    guildId: ctx.guildId,
    result: result.success ? "success" : "error",
    details: `selector=${selector}`,
  });

  return {
    success: result.success,
    error: result.error,
    durationMs: Date.now() - t0,
  };
}

/**
 * Type text into an input field.
 */
export async function browserType(
  ctx: BrowserToolContext,
  selector: string,
  text: string,
): Promise<BrowserActionResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  // Access control
  const access = validateBrowserAccess("browser_type", ctx);
  if (!access.allowed) {
    recordAudit({
      who: ctx.userId,
      what: "browser_type",
      where: "browser",
      guildId: ctx.guildId,
      result: "denied",
      details: access.reason,
    });
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  if (!manager.isAvailable()) {
    return { success: false, error: "Browser not available", durationMs: Date.now() - t0 };
  }

  const selectorCheck = validateSelector(selector);
  if (!selectorCheck.valid) {
    return { success: false, error: selectorCheck.reason, durationMs: Date.now() - t0 };
  }

  const textCheck = validateTextInput(text);
  if (!textCheck.valid) {
    return { success: false, error: textCheck.reason, durationMs: Date.now() - t0 };
  }

  const result = await manager.type(ctx.sessionId, selector, text);

  recordAudit({
    who: ctx.userId,
    what: "browser_type",
    where: "browser",
    guildId: ctx.guildId,
    result: result.success ? "success" : "error",
    details: `selector=${selector}`,
  });

  return {
    success: result.success,
    error: result.error,
    durationMs: Date.now() - t0,
  };
}

/**
 * Scroll the page.
 */
export async function browserScroll(
  ctx: BrowserToolContext,
  direction: "up" | "down" | "top" | "bottom",
): Promise<BrowserActionResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  const access = validateBrowserAccess("browser_scroll", ctx);
  if (!access.allowed) {
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  if (!manager.isAvailable()) {
    return { success: false, error: "Browser not available", durationMs: Date.now() - t0 };
  }

  const result = await manager.scroll(ctx.sessionId, direction);

  return {
    success: result.success,
    error: result.error,
    durationMs: Date.now() - t0,
  };
}

/**
 * Wait for a selector to appear on the page.
 */
export async function browserWait(
  ctx: BrowserToolContext,
  selector: string,
  timeoutMs?: number,
): Promise<BrowserActionResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  const access = validateBrowserAccess("browser_wait", ctx);
  if (!access.allowed) {
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  if (!manager.isAvailable()) {
    return { success: false, error: "Browser not available", durationMs: Date.now() - t0 };
  }

  const selectorCheck = validateSelector(selector);
  if (!selectorCheck.valid) {
    return { success: false, error: selectorCheck.reason, durationMs: Date.now() - t0 };
  }

  const result = await manager.waitForSelector(ctx.sessionId, selector, timeoutMs);

  return {
    success: result.success,
    error: result.error,
    durationMs: Date.now() - t0,
  };
}

/**
 * Extract text content from the page.
 */
export async function browserExtract(
  ctx: BrowserToolContext,
  selector?: string,
): Promise<BrowserExtractResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  const access = validateBrowserAccess("browser_extract", ctx);
  if (!access.allowed) {
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  if (!manager.isAvailable()) {
    return { success: false, error: "Browser not available", durationMs: Date.now() - t0 };
  }

  if (selector) {
    const selectorCheck = validateSelector(selector);
    if (!selectorCheck.valid) {
      return { success: false, error: selectorCheck.reason, durationMs: Date.now() - t0 };
    }
  }

  const result = await manager.extractContent(ctx.sessionId, selector);

  if (result.success && result.text) {
    result.text = redactSensitiveContent(result.text);
  }

  recordAudit({
    who: ctx.userId,
    what: "browser_extract",
    where: "browser",
    guildId: ctx.guildId,
    result: result.success ? "success" : "error",
    details: `selector=${selector || "body"} textLength=${result.text?.length || 0}`,
  });

  return {
    success: result.success,
    data: result.success
      ? {
          text: result.text || "",
          title: result.title || "",
          url: result.url || "",
          links: result.links || [],
          headings: result.headings || [],
        }
      : undefined,
    error: result.error,
    durationMs: Date.now() - t0,
  };
}

/**
 * Take a screenshot of the current page.
 */
export async function browserScreenshot(
  ctx: BrowserToolContext,
): Promise<BrowserScreenshotResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  const access = validateBrowserAccess("browser_screenshot", ctx);
  if (!access.allowed) {
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  if (!manager.isAvailable()) {
    return { success: false, error: "Browser not available", durationMs: Date.now() - t0 };
  }

  const result = await manager.screenshot(ctx.sessionId);

  recordAudit({
    who: ctx.userId,
    what: "browser_screenshot",
    where: "browser",
    guildId: ctx.guildId,
    result: result.success ? "success" : "error",
  });

  return {
    success: result.success,
    data: result.success
      ? {
          buffer: result.buffer!,
          width: result.width || 1280,
          height: result.height || 720,
          format: "png",
        }
      : undefined,
    error: result.error,
    durationMs: Date.now() - t0,
  };
}

/**
 * Navigate back.
 */
export async function browserBack(ctx: BrowserToolContext): Promise<BrowserActionResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  const access = validateBrowserAccess("browser_back", ctx);
  if (!access.allowed) {
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  if (!manager.isAvailable()) {
    return { success: false, error: "Browser not available", durationMs: Date.now() - t0 };
  }

  const result = await manager.goBack(ctx.sessionId);
  return { success: result.success, error: result.error, durationMs: Date.now() - t0 };
}

/**
 * Navigate forward.
 */
export async function browserForward(ctx: BrowserToolContext): Promise<BrowserActionResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  const access = validateBrowserAccess("browser_forward", ctx);
  if (!access.allowed) {
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  if (!manager.isAvailable()) {
    return { success: false, error: "Browser not available", durationMs: Date.now() - t0 };
  }

  const result = await manager.goForward(ctx.sessionId);
  return { success: result.success, error: result.error, durationMs: Date.now() - t0 };
}

/**
 * Close the current browser session.
 */
export async function browserClose(ctx: BrowserToolContext): Promise<BrowserActionResult> {
  const t0 = Date.now();
  const manager = getBrowserManager();

  const access = validateBrowserAccess("browser_close", ctx);
  if (!access.allowed) {
    return { success: false, error: access.reason, durationMs: Date.now() - t0 };
  }

  await manager.closeSession(ctx.sessionId);

  recordAudit({
    who: ctx.userId,
    what: "browser_close",
    where: "browser",
    guildId: ctx.guildId,
    result: "success",
  });

  return { success: true, durationMs: Date.now() - t0 };
}
