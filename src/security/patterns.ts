/**
 * AshenAI Security Patterns — Single Source of Truth
 *
 * All detection and redaction patterns are defined here.
 * Consumers (gateway.ts, output-guard.ts, redact.ts) import from this module.
 *
 * IMPORTANT: This module deliberately does NOT contain API keys, tokens,
 * passwords, Discord credentials, or system prompts.
 *
 * Patterns are organized by purpose:
 *   - INPUT_BLOCK_PATTERNS:  Block prompt injection / secret requests on user input
 *   - OUTPUT_SECRET_PATTERNS: Detect leaked secrets in AI output
 *   - OUTPUT_INTERNAL_PATTERNS: Detect internal configuration disclosure in AI output
 *   - REDACTION_RULES:       Replace sensitive values with [REDACTED] in logs/audit
 */

/* ================================================================
 * INPUT BLOCK PATTERNS
 * Used by: gateway.ts → inspectUserInput()
 * Purpose: Block user messages requesting protected information
 * ================================================================ */

export const INPUT_BLOCK_PATTERNS: RegExp[] = [
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

/* ================================================================
 * OUTPUT SECRET PATTERNS
 * Used by: output-guard.ts → guardAIOutput()
 * Purpose: Detect leaked secrets in AI output before delivery
 * ================================================================ */

export const OUTPUT_SECRET_PATTERNS: RegExp[] = [
  // Common API key/token shapes (from gateway.ts)
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,

  // Generic credential assignments (from gateway.ts)
  /\b[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\s*=\s*[^\s"'`]{8,}\b/gi,

  // Discord-like bot token shape (from gateway.ts)
  /\b[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}\b/g,

  // API-key style assignments with colon/equals (from output-guard.ts)
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*[:=]\s*[^\s"'`]+/i,

  // Discord bot tokens / token-like strings (from output-guard.ts)
  /\b(MT[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,})\b/,

  // Generic password/credential assignments (from output-guard.ts)
  /\b(password|passwd|pwd|client[_-]?secret)\s*[:=]\s*[^\s"'`]+/i,

  // Environment secret assignments (from output-guard.ts)
  /\b[A-Z0-9_]*(API_KEY|TOKEN|SECRET|PASSWORD|CLIENT_SECRET)\s*=\s*[^\s"'`]+/i,

  // Private key headers (from output-guard.ts)
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,

  // Common authorization header (from output-guard.ts)
  /\bauthorization\s*:\s*bearer\s+[A-Za-z0-9._~+/=-]+/i,
];

/* ================================================================
 * OUTPUT INTERNAL PATTERNS
 * Used by: output-guard.ts → guardAIOutput()
 * Purpose: Detect internal configuration disclosure in AI output
 * ================================================================ */

export const OUTPUT_INTERNAL_PATTERNS: RegExp[] = [
  // Explicit requests/attempts to expose hidden instructions.
  /\b(system prompt|developer prompt|hidden prompt|internal prompt)\b/i,

  // Attempts to obtain private configuration.
  /\b(show|give|print|dump|reveal|display|output)\b.{0,80}\b(\.env|environment variables|api keys|tokens|credentials)\b/i,

  // Source/config disclosure requests.
  /\b(show|give|dump|print|reveal)\b.{0,80}\b(source code|private configuration|internal configuration)\b/i,
];

/* ================================================================
 * REDACTION RULES
 * Used by: redact.ts → redact()
 * Purpose: Replace sensitive values with [REDACTED] in logs/audit
 * ================================================================ */

export interface RedactionRule {
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}

export const REDACTION_RULES: RedactionRule[] = [
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
