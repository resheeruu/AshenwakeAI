/* ================================================================
 * BROWSER TOOL DEFINITIONS
 *
 * Registers browser tools in the existing ToolDefinition framework.
 * Each definition specifies requiredRole, confirmationRequired,
 * riskLevel, and allowedScopes — enabling the executor pipeline
 * to enforce permissions, confirmation, rate limiting, and audit.
 * ================================================================ */

import type { ToolDefinition, ToolContext, ToolResult } from "../../ai/tools/types";
import { getBrowserManager } from "./manager";
import {
  browserOpen,
  browserNavigate,
  browserClick,
  browserType,
  browserScroll,
  browserWait,
  browserExtract,
  browserScreenshot,
  browserBack,
  browserForward,
  browserClose,
  type BrowserToolContext,
} from "./tools";
import {
  validateUrl,
  validateSelector,
  validateTextInput,
} from "./security";

/* ================================================================
 * HELPER: Convert ToolContext → BrowserToolContext
 * ================================================================ */

function toBrowserContext(ctx: ToolContext): BrowserToolContext {
  return {
    userId: ctx.requesterId,
    guildId: ctx.guildId,
    channelId: ctx.channelId,
    sessionId: (ctx.arguments._sessionId as string) || "",
    requesterRole: ctx.requesterRole,
    isBotOwner: ctx.requesterRole === "owner",
  };
}

/* ================================================================
 * BROWSER TOOL DEFINITIONS
 * ================================================================ */

export const browserToolDefinitions: ToolDefinition[] = [
  {
    name: "browser_open",
    description: "Open a URL in a new browser page. Requires moderator role.",
    category: "browser",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: false,
    riskLevel: "medium",
    parameters: [
      { name: "url", type: "string", description: "URL to open", required: true },
    ],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const url = ctx.arguments.url as string;
      if (!url) return { status: "validation_error", message: "Missing required parameter: url" };

      const urlCheck = validateUrl(url);
      if (!urlCheck.valid) return { status: "validation_error", message: urlCheck.reason || "Invalid URL" };

      const bCtx = toBrowserContext(ctx);
      const result = await browserOpen(bCtx, url);

      return {
        status: result.success ? "success" : "error",
        message: result.success
          ? `Opened: ${result.data?.title || url}`
          : result.error || "Failed to open URL",
        data: result.data,
      };
    },
  },
  {
    name: "browser_navigate",
    description: "Navigate to a URL in the current browser page. Requires moderator role.",
    category: "browser",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: false,
    riskLevel: "medium",
    parameters: [
      { name: "url", type: "string", description: "URL to navigate to", required: true },
    ],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const url = ctx.arguments.url as string;
      if (!url) return { status: "validation_error", message: "Missing required parameter: url" };

      const urlCheck = validateUrl(url);
      if (!urlCheck.valid) return { status: "validation_error", message: urlCheck.reason || "Invalid URL" };

      const bCtx = toBrowserContext(ctx);
      const result = await browserNavigate(bCtx, url);

      return {
        status: result.success ? "success" : "error",
        message: result.success
          ? `Navigated to: ${result.data?.title || url}`
          : result.error || "Failed to navigate",
        data: result.data,
      };
    },
  },
  {
    name: "browser_click",
    description: "Click an element on the page. Requires moderator role and confirmation.",
    category: "browser",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      { name: "selector", type: "string", description: "CSS selector of element to click", required: true },
    ],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const selector = ctx.arguments.selector as string;
      if (!selector) return { status: "validation_error", message: "Missing required parameter: selector" };

      const selCheck = validateSelector(selector);
      if (!selCheck.valid) return { status: "validation_error", message: selCheck.reason || "Invalid selector" };

      const bCtx = toBrowserContext(ctx);
      const result = await browserClick(bCtx, selector);

      return {
        status: result.success ? "success" : "error",
        message: result.success ? `Clicked: ${selector}` : result.error || "Failed to click",
      };
    },
  },
  {
    name: "browser_type",
    description: "Type text into an input field. Requires moderator role and confirmation.",
    category: "browser",
    requiredRole: "moderator",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: true,
    riskLevel: "high",
    parameters: [
      { name: "selector", type: "string", description: "CSS selector of input field", required: true },
      { name: "text", type: "string", description: "Text to type", required: true },
    ],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const selector = ctx.arguments.selector as string;
      const text = ctx.arguments.text as string;
      if (!selector) return { status: "validation_error", message: "Missing required parameter: selector" };
      if (!text) return { status: "validation_error", message: "Missing required parameter: text" };

      const selCheck = validateSelector(selector);
      if (!selCheck.valid) return { status: "validation_error", message: selCheck.reason || "Invalid selector" };

      const txtCheck = validateTextInput(text);
      if (!txtCheck.valid) return { status: "validation_error", message: txtCheck.reason || "Invalid text" };

      const bCtx = toBrowserContext(ctx);
      const result = await browserType(bCtx, selector, text);

      return {
        status: result.success ? "success" : "error",
        message: result.success ? `Typed into: ${selector}` : result.error || "Failed to type",
      };
    },
  },
  {
    name: "browser_scroll",
    description: "Scroll the browser page.",
    category: "browser",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [
      {
        name: "direction",
        type: "string",
        description: "Scroll direction",
        required: true,
        allowedValues: ["up", "down", "top", "bottom"],
      },
    ],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const direction = ctx.arguments.direction as "up" | "down" | "top" | "bottom";
      if (!direction) return { status: "validation_error", message: "Missing required parameter: direction" };

      const bCtx = toBrowserContext(ctx);
      const result = await browserScroll(bCtx, direction);

      return {
        status: result.success ? "success" : "error",
        message: result.success ? `Scrolled ${direction}` : result.error || "Failed to scroll",
      };
    },
  },
  {
    name: "browser_wait",
    description: "Wait for a CSS selector to appear on the page.",
    category: "browser",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [
      { name: "selector", type: "string", description: "CSS selector to wait for", required: true },
      { name: "timeoutMs", type: "number", description: "Timeout in milliseconds", required: false },
    ],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const selector = ctx.arguments.selector as string;
      if (!selector) return { status: "validation_error", message: "Missing required parameter: selector" };

      const selCheck = validateSelector(selector);
      if (!selCheck.valid) return { status: "validation_error", message: selCheck.reason || "Invalid selector" };

      const bCtx = toBrowserContext(ctx);
      const result = await browserWait(bCtx, selector, ctx.arguments.timeoutMs as number | undefined);

      return {
        status: result.success ? "success" : "error",
        message: result.success ? `Element appeared: ${selector}` : result.error || "Wait timed out",
      };
    },
  },
  {
    name: "browser_extract",
    description: "Extract text content from the page.",
    category: "browser",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: false,
    riskLevel: "safe",
    parameters: [
      { name: "selector", type: "string", description: "CSS selector to extract from (optional, defaults to body)", required: false },
    ],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const selector = ctx.arguments.selector as string | undefined;

      if (selector) {
        const selCheck = validateSelector(selector);
        if (!selCheck.valid) return { status: "validation_error", message: selCheck.reason || "Invalid selector" };
      }

      const bCtx = toBrowserContext(ctx);
      const result = await browserExtract(bCtx, selector);

      return {
        status: result.success ? "success" : "error",
        message: result.success
          ? `Extracted ${result.data?.text?.length || 0} characters`
          : result.error || "Failed to extract",
        data: result.data,
      };
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current page.",
    category: "browser",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: false,
    riskLevel: "safe",
    parameters: [],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const bCtx = toBrowserContext(ctx);
      const result = await browserScreenshot(bCtx);

      return {
        status: result.success ? "success" : "error",
        message: result.success
          ? `Screenshot: ${result.data?.width}x${result.data?.height}`
          : result.error || "Failed to take screenshot",
        data: result.data,
      };
    },
  },
  {
    name: "browser_back",
    description: "Navigate back in browser history.",
    category: "browser",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const bCtx = toBrowserContext(ctx);
      const result = await browserBack(bCtx);

      return {
        status: result.success ? "success" : "error",
        message: result.success ? "Navigated back" : result.error || "Failed to go back",
      };
    },
  },
  {
    name: "browser_forward",
    description: "Navigate forward in browser history.",
    category: "browser",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const bCtx = toBrowserContext(ctx);
      const result = await browserForward(bCtx);

      return {
        status: result.success ? "success" : "error",
        message: result.success ? "Navigated forward" : result.error || "Failed to go forward",
      };
    },
  },
  {
    name: "browser_close",
    description: "Close the current browser session.",
    category: "browser",
    requiredRole: "member",
    requiredDiscordPermissions: [],
    allowedScopes: ["AI_CHAT"],
    confirmationRequired: false,
    riskLevel: "low",
    parameters: [],
    execute: async (ctx: ToolContext): Promise<ToolResult> => {
      const bCtx = toBrowserContext(ctx);
      const result = await browserClose(bCtx);

      return {
        status: result.success ? "success" : "error",
        message: result.success ? "Session closed" : result.error || "Failed to close session",
      };
    },
  },
];

/* ================================================================
 * REGISTRATION HELPER
 * ================================================================ */

/**
 * Register all browser tools in the given ToolRegistry.
 * Call this at startup after the registry is created.
 */
export function registerBrowserTools(registry: {
  register(tool: ToolDefinition): void;
}): void {
  for (const tool of browserToolDefinitions) {
    registry.register(tool);
  }
}
