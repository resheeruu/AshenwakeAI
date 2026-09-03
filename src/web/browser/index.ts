/* ================================================================
 * BROWSER MODULE — PUBLIC API
 *
 * Centralized browser automation for AshenAI.
 * Exports the browser manager, tools, and types.
 * ================================================================ */

// Types
export type {
  BrowserConfig,
  BrowserSession,
  BrowserActionResult,
  BrowserOpenResult,
  BrowserExtractResult,
  BrowserScreenshotResult,
  BrowserNavigateResult,
  BrowserOperationType,
  BrowserOperation,
  BrowserHealthStatus,
} from "./types";

export { DEFAULT_BROWSER_CONFIG } from "./types";

// Manager
export { BrowserManager, getBrowserManager } from "./manager";

// Security
export {
  validateUrl,
  resolveAndValidateHost,
  validateRedirect,
  validateSelector,
  validateTextInput,
  redactSensitiveContent,
} from "./security";

// Tools
export {
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
  validateBrowserAccess,
  requiresBrowserConfirmation,
  type BrowserToolContext,
  type BrowserAccessResult,
} from "./tools";

// Tool Definitions (for ToolRegistry integration)
export {
  browserToolDefinitions,
  registerBrowserTools,
} from "./tool-definitions";
