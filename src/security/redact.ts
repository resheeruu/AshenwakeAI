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
 *
 * U12: Redaction rules are centralized in ./patterns.ts
 */

import { REDACTION_RULES } from "./patterns";

function redactString(text: string): string {
  let result = text;
  for (const { pattern, replacement } of REDACTION_RULES) {
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
