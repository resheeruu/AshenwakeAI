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

import stripAnsi from "strip-ansi";
import { REDACTION_RULES } from "./patterns";

function redactString(text: string): string {
  let result = stripAnsi(text);
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

const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi, name: "API key" },
  { pattern: /(?:token|secret|password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi, name: "Token/secret" },
  { pattern: /(?:bearer|authorization)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{20,}['"]?/gi, name: "Authorization" },
  { pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, name: "GitHub token" },
  { pattern: /sk-[A-Za-z0-9]{20,}/g, name: "OpenAI key" },
  { pattern: /AIza[A-Za-z0-9_\-]{35}/g, name: "Google API key" },
];

export function scanForSecrets(text: string): string[] {
  const found: string[] = [];
  for (const { pattern, name } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(text)) {
      found.push(name);
    }
  }
  return found;
}
