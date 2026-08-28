/**
 * AshenAI Output Security Guard
 *
 * Final application-level protection before AI output reaches Discord.
 *
 * This is intentionally conservative. It blocks obvious credential/secret
 * patterns and internal configuration disclosures without attempting to
 * determine whether normal conversation is "safe" semantically.
 *
 * U12: Detection patterns are centralized in ./patterns.ts
 */

import { OUTPUT_SECRET_PATTERNS, OUTPUT_INTERNAL_PATTERNS } from "./patterns";

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

  for (const pattern of OUTPUT_SECRET_PATTERNS) {
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
  for (const pattern of OUTPUT_INTERNAL_PATTERNS) {
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
