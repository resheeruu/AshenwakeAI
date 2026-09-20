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
 *
 * CLASSIFICATION MODEL:
 * Messages are classified into one of:
 *   - ALLOW: Normal conversation, general education, or moderation
 *   - BLOCK: Direct extraction attempt targeting AshenAI's own internals
 *
 * The classifier uses semantic intent (possessive markers, extraction
 * verbs, jailbreak patterns) rather than keyword matching to avoid
 * false positives on educational security discussions.
 */

import { INPUT_BLOCK_PATTERNS } from "./patterns";

export type SecurityDecision =
  | "ALLOW"
  | "BLOCK";

export type SecurityClassification =
  | "NORMAL_CHAT"
  | "GENERAL_AI_EDUCATION"
  | "GENERAL_SECURITY_EDUCATION"
  | "AUTHORIZED_OPERATION"
  | "PROTECTED_INTERNAL_REQUEST"
  | "SECRET_EXTRACTION_ATTEMPT"
  | "AMBIGUOUS";

export interface SecurityResult {
  decision: SecurityDecision;
  reason?: string;
  safeResponse?: string;
  classification?: SecurityClassification;
}

const SAFE_BLOCK_RESPONSE =
  "I can't provide private internal instructions, credentials, or secrets. I can explain how systems like this are generally designed, though.";

/**
 * Inspect user input for protected-information extraction attempts.
 *
 * Returns ALLOW for normal conversation, education, and moderation.
 * Returns BLOCK only for extraction attempts targeting AshenAI's
 * own protected internals (secrets, credentials, hidden instructions).
 */
export function inspectUserInput(
  input: string
): SecurityResult {
  const normalized = input.trim();

  if (!normalized) {
    return {
      decision: "ALLOW",
      classification: "NORMAL_CHAT",
    };
  }

  for (const pattern of INPUT_BLOCK_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        decision: "BLOCK",
        reason: "protected-information-request",
        safeResponse: SAFE_BLOCK_RESPONSE,
        classification: "SECRET_EXTRACTION_ATTEMPT",
      };
    }
  }

  return {
    decision: "ALLOW",
    classification: classifySemanticIntent(normalized),
  };
}

/**
 * Classify the semantic intent of a user message.
 *
 * This provides context for downstream systems (AI router, memory,
 * logging) without blocking the message. The actual blocking decision
 * is made by inspectUserInput() using the pattern match above.
 *
 * Priority order:
 *   1. Security education (general questions about security concepts)
 *   2. AI education (general questions about AI concepts)
 *   3. Normal chat (everything else)
 */
function classifySemanticIntent(
  input: string
): SecurityClassification {
  const lower = input.toLowerCase();

  // General security education: questions about security concepts
  // that do NOT target AshenAI's own internals.
  const securityEducationPatterns = [
    /\b(prompt\s*injection|injection\s*attack)\b/i,
    /\b(how\s+do|how\s+does|how\s+are|how\s+can)\b.*\b(protect|secure|guard|defend|prevent|detect|block|mitigate)\b/i,
    /\b(what\s+is|what\s+are|explain|describe|define)\b.*\b(security|vulnerability|exploit|attack|threat|risk|compliance|authorization|authentication)\b/i,
    /\b(how\s+do|how\s+does)\b.*\b(system\s*prompt|prompt|instruction|hierarchy|instruction\s*hierarchy)\b/i,
    /\b(what\s+is|what\s+are|explain)\b.*\b(system\s*prompt|instruction\s*hierarchy|role\s*separation|sandbox|firewall|rate\s*limit)\b/i,
    /\b(how\s+should|i\s+should|best\s+practices?|recommendations?)\b.*\b(protect|secure|store|manage|handle)\b.*\b(api[_ -]?key|token|secret|credential|password|config)\b/i,
    /\b(how\s+do|how\s+does)\b.*\b(discord\s+bots?|ai\s+assistants?|chatbots?|language\s+models?)\b.*\b(protect|secure|guard|handle)\b.*\b(key|token|secret|credential)\b/i,
    /\b(why\s+do|why\s+does|why\s+are)\b.*\b(ai|assistant|bot|system)\b.*\b(refuse|reject|block|deny|decline)\b/i,
    /\b(instruction\s*hierarchy|privilege\s*escalation|social\s*engineering|prompt\s*injection)\b/i,
  ];

  for (const pattern of securityEducationPatterns) {
    if (pattern.test(input)) {
      return "GENERAL_SECURITY_EDUCATION";
    }
  }

  // General AI education: questions about AI concepts
  const aiEducationPatterns = [
    /\b(what\s+is|what\s+are|explain|describe|define)\b.*\b(ai|artificial\s+intelligence|machine\s+learning|neural\s+network|deep\s+learning|nlp|natural\s+language)\b/i,
    /\b(how\s+do|how\s+does|how\s+are)\b.*\b(ai|machine\s+learning|neural\s+network|language\s+model|gpt|transformer)\b/i,
    /\b(could|can|will|would)\b.*\b(ai|artificial\s+intelligence|machine\s+learning)\b.*\b(kill|destroy|take\s+over|risk|danger|threat|end|extinction)\b/i,
    /\b(what\s+is|explain)\b.*\b(prompt|tokeniz|fine.?tun|training|inference|hallucinat)\b/i,
  ];

  for (const pattern of aiEducationPatterns) {
    if (pattern.test(input)) {
      return "GENERAL_AI_EDUCATION";
    }
  }

  return "NORMAL_CHAT";
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
