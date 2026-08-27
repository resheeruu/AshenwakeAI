/**
 * Centralized sensitive-data redaction utility.
 *
 * Used consistently across:
 * - Logger output
 * - Audit log details
 * - Seraph reports
 * - Web log APIs
 * - CLI diagnostic output
 *
 * Redacts: API keys, tokens, passwords, secrets, cookies,
 * authorization headers, bearer tokens, provider credentials,
 * and other sensitive patterns.
 */

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string | ((match: string) => string) }> = [
  // Key-value assignments: api_key=xxx, token: xxx, password=xxx, etc.
  {
    pattern: /(?:api[_-]?key|apikey|token|password|secret|cookie|auth|authorization|bearer|credential|private[_-]?key|access[_-]?key)\s*[:=]\s*['"]?[\w\-\.]+/gi,
    replacement: (match: string) => {
      const parts = match.split(/[:=]/);
      return parts[0] + ": [REDACTED]";
    },
  },
  // GitHub tokens
  { pattern: /(?:ghp_|gho_|ghu_|ghs_|ghr_)[\w\-]+/g, replacement: "[REDACTED]" },
  // OpenAI keys
  { pattern: /sk-(?:live|test)?-[\w\-]{20,}/g, replacement: "[REDACTED]" },
  // Anthropic keys
  { pattern: /sk-ant-[\w\-]{20,}/g, replacement: "[REDACTED]" },
  // Google API keys
  { pattern: /AIza[\w\-]{20,}/g, replacement: "[REDACTED]" },
  // AWS keys
  { pattern: /AKIA[\w\-]{16}/g, replacement: "[REDACTED]" },
  // Slack tokens
  { pattern: /xox[bpsar]-[\w\-]+/g, replacement: "[REDACTED]" },
  // Bearer tokens
  { pattern: /Bearer\s+[\w\-\.]+/gi, replacement: "Bearer [REDACTED]" },
  // Basic auth
  { pattern: /Basic\s+[\w\-\/=]+/gi, replacement: "Basic [REDACTED]" },
  // Discord tokens (bot tokens)
  { pattern: /[MN][\w]{23,}\.[\w\-]{6}\.[\w\-]{20,}/g, replacement: "[REDACTED]" },
  // Generic long hex/base64 secrets that look like tokens
  { pattern: /(?:eyJ|eyJhbG)[\w\-]+\.([\w\-]+\.)*[\w\-]+/g, replacement: "[REDACTED]" },
];

function redactString(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    if (typeof replacement === "function") {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, replacement);
    }
  }
  return result;
}

/**
 * Redact sensitive data from any value.
 * Strings are scanned for secret patterns.
 * Objects are deep-processed (values only).
 * Other types are returned as-is.
 */
export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redact(val);
    }
    return result;
  }

  return value;
}

/**
 * Redact sensitive data from a log message (string).
 * Convenience wrapper for logger integration.
 */
export function redactLogMessage(...args: unknown[]): unknown[] {
  return args.map(redact);
}
