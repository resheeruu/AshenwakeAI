/* ================================================================
 * BROWSER SECURITY
 *
 * URL validation, SSRF protection, redirect validation, protocol
 * restrictions, and isolation enforcement for browser operations.
 * ================================================================ */

import dns from "node:dns";
import { logger } from "../../logger";

/* ================================================================
 * PROTOCOL RESTRICTIONS
 * ================================================================ */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const BLOCKED_PROTOCOLS = new Set([
  "file:",
  "javascript:",
  "data:",
  "blob:",
  "chrome:",
  "devtools:",
  "about:",
  "ftp:",
  "ws:",
  "wss:",
]);

/* ================================================================
 * IP BLOCKING — reuse the same logic as src/web/fetch.ts
 * ================================================================ */

function isPrivateIP(ip: string): boolean {
  // IPv4 private/reserved ranges
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^0\./.test(ip)) return true;
  if (/^100\.6[4-9]\./.test(ip)) return true;
  if (/^100\.(?:7\d|8\d|9\d|1[01]\d|11[0-9]|12[0-7])\./.test(ip)) return true;
  if (/^192\.0\.0\./.test(ip)) return true;
  if (/^192\.0\.2\./.test(ip)) return true;
  if (/^198\.51\.100\./.test(ip)) return true;
  if (/^203\.0\.113\./.test(ip)) return true;
  if (/^224\./.test(ip)) return true;
  if (/^240\./.test(ip)) return true;
  // IPv6 private/reserved
  if (/^::1$/.test(ip)) return true;
  if (/^fc00:/.test(ip)) return true;
  if (/^fd00:/.test(ip)) return true;
  if (/^fe80:/.test(ip)) return true;
  if (/^::ffff:127\./.test(ip)) return true;
  if (/^::ffff:10\./.test(ip)) return true;
  if (/^::ffff:172\./.test(ip)) return true;
  if (/^::ffff:192\.168\./.test(ip)) return true;
  if (/^::ffff:169\.254\./.test(ip)) return true;
  if (/^0:0:0:0:0:ffff:/.test(ip)) return true;
  // Cloud metadata via IPv6
  if (/^fd00:ec2::/.test(ip)) return true;
  return false;
}

/* ================================================================
 * HOSTNAME BLOCKING
 * ================================================================ */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
  "instance-metadata",
  "azure-metadata",
  "dscloud.metadata",
]);

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  // Block .local, .internal, .localhost TLDs
  if (lower.endsWith(".local") || lower.endsWith(".internal") || lower.endsWith(".localhost")) return true;
  return false;
}

/* ================================================================
 * URL VALIDATION
 * ================================================================ */

export interface URLValidationResult {
  valid: boolean;
  reason?: string;
  parsedUrl?: URL;
}

/**
 * Validate a URL for browser navigation.
 * Blocks unsupported protocols, private IPs, metadata endpoints, etc.
 */
export function validateUrl(url: string): URLValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  // Protocol check
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
      return { valid: false, reason: `Blocked protocol: ${parsed.protocol}` };
    }
    return { valid: false, reason: `Unsupported protocol: ${parsed.protocol}` };
  }

  // Hostname check
  if (isBlockedHostname(parsed.hostname)) {
    return { valid: false, reason: `Blocked hostname: ${parsed.hostname}` };
  }

  return { valid: true, parsedUrl: parsed };
}

/**
 * Resolve a hostname and verify it does not point to a private/reserved IP.
 * Checks ALL resolved addresses to prevent DNS rebinding / multi-address SSRF.
 * Returns the first safe resolved IP address or an error.
 */
export async function resolveAndValidateHost(hostname: string): Promise<{
  valid: boolean;
  ip?: string;
  reason?: string;
}> {
  if (isBlockedHostname(hostname)) {
    return { valid: false, reason: `Blocked hostname: ${hostname}` };
  }

  try {
    const results = await dns.promises.lookup(hostname, { all: true });
    if (!results || results.length === 0) {
      return { valid: false, reason: `DNS resolution returned no addresses for ${hostname}` };
    }

    let firstSafeIp: string | undefined;

    for (const result of results) {
      if (isPrivateIP(result.address)) {
        logger.warn(`🌐 Browser SSRF blocked: ${hostname} has private/reserved address ${result.address}`);
        return {
          valid: false,
          reason: `${hostname} resolves to private/reserved IP ${result.address}`,
        };
      }
      if (!firstSafeIp) {
        firstSafeIp = result.address;
      }
    }

    return { valid: true, ip: firstSafeIp };
  } catch (error) {
    // DNS resolution failure — block for safety
    return { valid: false, reason: `DNS resolution failed for ${hostname}` };
  }
}

/**
 * Validate a redirect destination.
 * Re-checks protocol, hostname, and IP after redirect.
 */
export async function validateRedirect(
  originalUrl: string,
  redirectUrl: string,
): Promise<URLValidationResult> {
  const result = validateUrl(redirectUrl);
  if (!result.valid) return result;

  // Additional check: ensure redirect stays on same protocol or upgrades http→https
  const origParsed = new URL(originalUrl);
  const redirParsed = new URL(redirectUrl);

  if (origParsed.protocol === "https:" && redirParsed.protocol === "http:") {
    return { valid: false, reason: "Redirect downgrades from HTTPS to HTTP" };
  }

  // Resolve and validate the redirect target
  const hostCheck = await resolveAndValidateHost(redirParsed.hostname);
  if (!hostCheck.valid) {
    return { valid: false, reason: hostCheck.reason };
  }

  return result;
}

/* ================================================================
 * CSS SELECTOR VALIDATION
 * ================================================================ */

/**
 * Basic validation for CSS selectors used in browser actions.
 * Prevents injection of arbitrary JavaScript via selectors.
 */
export function validateSelector(selector: string): { valid: boolean; reason?: string } {
  if (!selector || typeof selector !== "string") {
    return { valid: false, reason: "Selector must be a non-empty string" };
  }

  if (selector.length > 500) {
    return { valid: false, reason: "Selector too long" };
  }

  // Block selectors that could execute JavaScript
  const dangerousPatterns = [
    /javascript:/i,
    /expression\(/i,
    /eval\(/i,
    /<script/i,
    /on\w+\s*=/i,  // onclick=, onerror=, etc.
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(selector)) {
      return { valid: false, reason: "Selector contains potentially dangerous content" };
    }
  }

  return { valid: true };
}

/* ================================================================
 * TEXT INPUT VALIDATION
 * ================================================================ */

/**
 * Validate text input for browser type/fill operations.
 * Prevents injection of control characters and excessively long input.
 */
export function validateTextInput(text: string): { valid: boolean; reason?: string } {
  if (typeof text !== "string") {
    return { valid: false, reason: "Text must be a string" };
  }

  if (text.length > 10_000) {
    return { valid: false, reason: "Text input too long (max 10,000 characters)" };
  }

  // Block null bytes and other control characters (except newline/tab)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) {
    return { valid: false, reason: "Text contains invalid control characters" };
  }

  return { valid: true };
}

/* ================================================================
 * CONTENT REDACTION
 * ================================================================ */

const SENSITIVE_PATTERNS = [
  /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
  /(?:token|secret|api[_-]?key|access[_-]?key)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
  /(?:authorization|bearer)\s+[^\s'"]{8,}/gi,
  /(?:cookie|set-cookie)\s*[:=]\s*[^\s;]{8,}/gi,
];

/**
 * Redact sensitive information from browser-extracted text.
 */
export function redactSensitiveContent(text: string): string {
  let redacted = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      const eqIndex = match.indexOf("=") !== -1 ? match.indexOf("=") : match.indexOf(":");
      if (eqIndex === -1) return "[REDACTED]";
      return match.slice(0, eqIndex + 1) + " [REDACTED]";
    });
  }
  return redacted;
}
