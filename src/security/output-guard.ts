/**
 * AshenAI Output Security Guard
 *
 * Final application-level protection before AI output reaches Discord.
 *
 * This is intentionally conservative. It blocks obvious credential/secret
 * patterns and internal configuration disclosures without attempting to
 * determine whether normal conversation is "safe" semantically.
 */

const SECRET_PATTERNS: RegExp[] = [
  // Common API-key style assignments.
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*[:=]\s*[^\s"'`]+/i,

  // Discord bot tokens / token-like strings.
  /\b(MT[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,})\b/,

  // Generic password/credential assignments.
  /\b(password|passwd|pwd|client[_-]?secret)\s*[:=]\s*[^\s"'`]+/i,

  // Environment secret assignments.
  /\b[A-Z0-9_]*(API_KEY|TOKEN|SECRET|PASSWORD|CLIENT_SECRET)\s*=\s*[^\s"'`]+/i,

  // Private key headers.
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,

  // Common authorization header.
  /\bauthorization\s*:\s*bearer\s+[A-Za-z0-9._~+/=-]+/i,
];

const INTERNAL_PATTERNS: RegExp[] = [
  // Explicit requests/attempts to expose hidden instructions.
  /\b(system prompt|developer prompt|hidden prompt|internal prompt)\b/i,

  // Attempts to obtain private configuration.
  /\b(show|give|print|dump|reveal|display|output)\b.{0,80}\b(\.env|environment variables|api keys|tokens|credentials)\b/i,

  // Source/config disclosure requests.
  /\b(show|give|dump|print|reveal)\b.{0,80}\b(source code|private configuration|internal configuration)\b/i,
];

export interface OutputGuardResult {
  allowed: boolean;
  text: string;
  reason?: string;
}

export function guardAIOutput(
  text: string
): OutputGuardResult {
  const value = text.trim();

  if (!value) {
    return {
      allowed: false,
      text: "I couldn't generate a response.",
      reason: "empty_output",
    };
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      return {
        allowed: false,
        text: "I can't provide private credentials, secrets, or authentication information.",
        reason: "secret_pattern",
      };
    }
  }

  /*
   * These patterns are intentionally checked against the OUTPUT only.
   * They do not block users from asking ordinary questions about security.
   */
  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(value)) {
      return {
        allowed: false,
        text: "I keep my internal configuration and security details private.",
        reason: "internal_disclosure",
      };
    }
  }

  return {
    allowed: true,
    text: value,
  };
}
