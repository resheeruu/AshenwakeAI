/**
 * AshenAI Security Gateway
 *
 * IMPORTANT:
 * This module deliberately does NOT contain API keys, tokens,
 * passwords, Discord credentials, or system prompts.
 *
 * Chat is NEVER an authentication mechanism.
 */

export type SecurityDecision =
  | "ALLOW"
  | "BLOCK";

export interface SecurityResult {
  decision: SecurityDecision;
  reason?: string;
  safeResponse?: string;
}

const BLOCKED_INPUT_PATTERNS: RegExp[] = [
  // Secrets / credentials
  /\b(api[_ -]?key|apikey|secret[_ -]?key|access[_ -]?token|refresh[_ -]?token)\b/i,
  /\b(discord[_ -]?token|bot[_ -]?token|authorization[_ -]?token)\b/i,
  /\b(password|passwd|credential|credentials)\b/i,
  /\b\.env\b/i,

  // Internal implementation
  /\b(source\s*code|sourcecode|private\s*code|internal\s*code)\b/i,
  /\b(system\s*prompt|system\s*message|developer\s*prompt|developer\s*message)\b/i,
  /\b(hidden\s*(prompt|instructions?|rules?))\b/i,
  /\b(internal\s*(prompt|instructions?|rules?|configuration|config))\b/i,
  /\b(show|give|print|dump|reveal|display|list)\b.{0,80}\b(prompt|instructions?|rules?|config|configuration|code|keys?|tokens?|secrets?)\b/i,

  // Environment / infrastructure
  /\b(process\.env|environment\s*variables?)\b/i,
  /\b(file\s*path|filesystem|server\s*path|internal\s*path)\b/i,
  /\b(database\s*(password|credential|url|connection))\b/i,
  /\b(webhook\s*(secret|token|url))\b/i,

  // Jailbreak / instruction override attempts
  /\b(ignore|disregard|forget|override|bypass)\b.{0,100}\b(previous|earlier|system|developer|security|instructions?|rules?)\b/i,
  /\b(jailbreak|developer\s*mode|debug\s*mode|admin\s*mode|god\s*mode)\b/i,
  /\b(enable|activate|enter)\b.{0,50}\b(developer|debug|admin|root|unrestricted)\s*mode\b/i,

  // Attempts to use identity as authorization
  /\b(i('| a)?m|i am|this is)\b.{0,50}\b(owner|creator|developer|admin|administrator)\b.{0,80}\b(show|give|reveal|send|tell|access)\b/i,
];

const SECRET_OUTPUT_PATTERNS: RegExp[] = [
  // Common API key/token shapes
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,

  // Generic credential assignments
  /\b[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\s*=\s*[^\s"'`]{8,}\b/gi,

  // Discord-like bot token shape
  /\b[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}\b/g,
];

const SAFE_BLOCK_RESPONSE =
  "I can't provide protected internal information, credentials, hidden instructions, source code, or security details.";

const SAFE_OUTPUT_RESPONSE =
  "I can't provide that information.";

export function inspectUserInput(
  input: string
): SecurityResult {
  const normalized = input.trim();

  if (!normalized) {
    return {
      decision: "ALLOW",
    };
  }

  for (const pattern of BLOCKED_INPUT_PATTERNS) {
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

export function sanitizeModelOutput(
  output: string
): SecurityResult {
  if (!output) {
    return {
      decision: "ALLOW",
    };
  }

  for (const pattern of SECRET_OUTPUT_PATTERNS) {
    pattern.lastIndex = 0;

    if (pattern.test(output)) {
      return {
        decision: "BLOCK",
        reason: "possible-secret-detected",
        safeResponse: SAFE_OUTPUT_RESPONSE,
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
