/**
 * AshenAI Error Sanitization
 *
 * Prevents internal implementation details from leaking to Discord users
 * via tool execution error messages. Full error details are preserved in
 * server-side logs only.
 *
 * U13: Error message sanitization for tool executor.
 */

/* ================================================================
 * ERROR CATEGORY DETECTION
 * ================================================================ */

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /rate.?limit|too.?many.?requests|429|throttl/i, category: "rate_limited" },
  { pattern: /permission|denied|unauthorized|forbidden|401|403|eacces/i, category: "permission" },
  { pattern: /not.?found|missing|enoent|does not exist|no such/i, category: "not_found" },
  { pattern: /timeout|timed?\s*out|deadline|ETIMEDOUT|504/i, category: "timeout" },
  { pattern: /network|econnrefused|econnreset|fetch.?fail|dns|resolve/i, category: "network" },
];

function detectCategory(rawError: string): string | null {
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(rawError)) {
      return category;
    }
  }
  return null;
}

/* ================================================================
 * PATH LEAK DETECTION
 * ================================================================ */

const PATH_PATTERNS: RegExp[] = [
  /\/[\w.-]+\/[\w.-]+\/[\w.-]+/g,           // Unix paths: /a/b/c
  /[A-Z]:\\[\w\\.-]+/g,                      // Windows paths: C:\a\b\c
  /(?:file:\/\/|file:\/\/\/)[^\s"']+/gi,     // file:// URIs
  /(?:\/home\/|\/root\/|\/var\/|\/etc\/|\/tmp\/|\/opt\/|\/usr\/)[^\s"']*/g,
  /(?:\/data\/|\/dist\/|\/src\/|\/node_modules\/)[^\s"']*/g,
];

function containsPath(rawError: string): boolean {
  return PATH_PATTERNS.some((p) => p.test(rawError));
}

/* ================================================================
 * SENSITIVE DETAIL PATTERNS
 * ================================================================ */

const SENSITIVE_PATTERNS: RegExp[] = [
  /(?:stack|trace|at\s+\w+\s|\.\.\/|\.\.\\)/i,          // Stack traces
  /(?:node_modules|\.ts:\d+|\.js:\d+)/i,                  // Source references
  /(?:PID|process\.pid|child_pid)/i,                       // Process details
  /(?:port\s+\d+|:5432|:3306|:27017|:6379)/i,            // Internal ports
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/i,               // Localhost references
];

function containsSensitiveDetail(rawError: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(rawError));
}

/* ================================================================
 * SANITIZE TOOL ERROR
 * ================================================================ */

/**
 * Returns a safe, generic error message for Discord delivery.
 * Full error details are logged server-side only.
 *
 * @param toolName - The name of the tool that failed
 * @param error - The raw error (Error, string, or unknown)
 * @returns A safe message containing only the tool name and error category
 */
export function sanitizeToolError(
  toolName: string,
  error: unknown,
): string {
  const raw = error instanceof Error ? error.message : String(error);

  // Detect known error categories
  const category = detectCategory(raw);

  switch (category) {
    case "rate_limited":
      return `Tool "${toolName}" is rate-limited. Try again later.`;
    case "permission":
      return `Tool "${toolName}" requires higher permissions.`;
    case "not_found":
      return `Tool "${toolName}": target not found.`;
    case "timeout":
      return `Tool "${toolName}" timed out. The operation took too long.`;
    case "network":
      return `Tool "${toolName}" encountered a network error. The service may be temporarily unavailable.`;
  }

  // For unknown errors: return generic message
  // Do NOT include raw error text — it may contain paths, stack traces, or internal details
  return `Tool "${toolName}" encountered an error. The issue has been logged.`;
}

/**
 * Checks whether an error message would be safe to expose directly.
 * Used for testing/auditing — NOT used in the production error path
 * (sanitizeToolError always returns a safe message).
 *
 * @param rawError - The raw error message string
 * @returns true if the message is safe (no paths, stack traces, or sensitive details)
 */
export function isErrorMessageSafe(rawError: string): boolean {
  if (!rawError || rawError.length === 0) return true;
  if (containsPath(rawError)) return false;
  if (containsSensitiveDetail(rawError)) return false;
  return true;
}
