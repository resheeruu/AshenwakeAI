/**
 * AshenAI Security Gateway
 *
 * IMPORTANT:
 * This module deliberately does NOT contain API keys, tokens,
 * passwords, Discord credentials, or system prompts.
 *
 * Chat is NEVER an authentication mechanism.
 *
 * U12: Detection patterns are centralized in ./patterns.ts
 */

import { INPUT_BLOCK_PATTERNS } from "./patterns";

export type SecurityDecision =
  | "ALLOW"
  | "BLOCK";

export interface SecurityResult {
  decision: SecurityDecision;
  reason?: string;
  safeResponse?: string;
}

const SAFE_BLOCK_RESPONSE =
  "I can't provide protected internal information, credentials, hidden instructions, source code, or security details.";

export function inspectUserInput(
  input: string
): SecurityResult {
  const normalized = input.trim();

  if (!normalized) {
    return {
      decision: "ALLOW",
    };
  }

  for (const pattern of INPUT_BLOCK_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        decision: "BLOCK",
        reason: "protected-information-request",
        safeResponse: SAFE_BLOCK_RESPONSE,
      };
    }
  }

  return {
    decision: "ALLOW",
  };
}

/**
 * Public creator identity.
 *
 * This is intentionally separate from authorization.
 * Knowing the creator name NEVER grants access to secrets.
 */
export function getCreatorResponse(
  creatorName: string
): string {
  const safeName =
    creatorName.trim() || "my creator";

  return `I was created by ${safeName}.`;
}

/**
 * Explicitly makes the security boundary clear.
 *
 * This function is intentionally simple:
 * chat identity claims are never authentication.
 */
export function isChatAuthentication(
  _input: string
): false {
  return false;
}
