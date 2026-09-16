/* ================================================================
 * PARTICIPANT CLASSIFIER
 *
 * Classifies interaction participants based on Discord metadata
 * and contextual signals.
 *
 * CRITICAL: Discord bot detection is the ONLY definitive signal.
 * All other classifications are contextual/inferred.
 * ================================================================ */

import type {
  Participant,
  ParticipantClassification,
} from "./types";

/**
 * Classify a Discord user as a participant.
 *
 * Classification rules:
 * - message.author.bot === true → DISCORD_BOT (definitive)
 * - message.author.bot === false → HUMAN (default)
 * - Explicit persona invocation in conversation → AI_PERSONA / FICTIONAL_PERSONA (contextual)
 * - Ambiguous → UNKNOWN
 *
 * Never claim definitive AI detection for non-bot accounts.
 */
export function classifyParticipant(params: {
  userId: string;
  displayName: string;
  botFlag: boolean;
  contextMessage?: string;
}): Participant {
  const { userId, displayName, botFlag, contextMessage } = params;

  if (botFlag) {
    return {
      id: `discord:${userId}`,
      discordUserId: userId,
      displayName,
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: ["discord_author_bot_flag"],
    };
  }

  // Non-bot user — check contextual signals
  const lowerContext = (contextMessage ?? "").toLowerCase();

  if (looksLikeAIPersona(displayName, lowerContext)) {
    return {
      id: `discord:${userId}`,
      discordUserId: userId,
      displayName,
      discordBot: false,
      classification: "AI_PERSONA",
      classificationConfidence: 0.5,
      evidence: ["persona_claim_or_name"],
    };
  }

  if (looksLikeFictionalPersona(displayName, lowerContext)) {
    return {
      id: `discord:${userId}`,
      discordUserId: userId,
      displayName,
      discordBot: false,
      classification: "FICTIONAL_PERSONA",
      classificationConfidence: 0.6,
      evidence: ["fictional_name_pattern"],
    };
  }

  // Default: human
  return {
    id: `discord:${userId}`,
    discordUserId: userId,
    displayName,
    discordBot: false,
    classification: "HUMAN",
    classificationConfidence: 0.9,
    evidence: ["discord_author_not_bot"],
  };
}

/**
 * Check if a display name or context suggests a fictional character.
 */
function looksLikeFictionalPersona(
  name: string,
  context: string
): boolean {
  const fictionalPatterns = [
    /\bbatman\b/i,
    /\bsuperman\b/i,
    /\bspider[- ]?man\b/i,
    /\biron man\b/i,
    /\bwolverine\b/i,
    /\bthor\b/i,
    /\bhulk\b/i,
    /\bjoker\b/i,
    /\bsherlock\b/i,
    /\bholmes\b/i,
    /\bgandalf\b/i,
    /\bfrodo\b/i,
    /\baragorn\b/i,
    /\bvader\b/i,
    /\bkylo\b/i,
    /\bneo\b/i,
    /\bmorpheus\b/i,
    /\belon musk\b/i,
    /\bshakespeare\b/i,
    /\bnapoleon\b/i,
    /\bzeus\b/i,
    /\bodin\b/i,
    /\bloki\b/i,
    /\bathanor\b/i,
    /\brobin\b/i,
    /\balfred\b/i,
    /\bjarvis\b/i,
    /\bfriday\b/i,
    /\bfriday\b/i,
    /\bvision\b/i,
    /\bomega\b/i,
    /\balpha\b/i,
    /\bsentinel\b/i,
    /\bphantom\b/i,
    /\bshadow\b/i,
    /\bghost\b/i,
    /\bnexus\b/i,
    /\bquantum\b/i,
    /\bvortex\b/i,
  ];

  const nameMatch = fictionalPatterns.some((p) =>
    p.test(name)
  );

  const contextClaim =
    /\b(i am|i'm|call me|known as|presenting as)\b/.test(
      context
    ) &&
    /\b(batman|superman|ai|robot|bot|persona|character)\b/i.test(
      context
    );

  return nameMatch || contextClaim;
}

/**
 * Check if a user is presenting themselves as an AI persona.
 */
function looksLikeAIPersona(
  name: string,
  context: string
): boolean {
  const aiPatterns = [
    /\b(artificial intelligence|neural net|language model)\b/i,
    /\b(i am an ai|i am ai|i'm an ai|i'm ai)\b/i,
    /\b(claude|gpt|chatgpt|bard|gemini|llama|mistral)\b/i,
    /\b(openai|anthropic|google ai)\b/i,
  ];

  const nameMatch =
    /\b(bot|ai|assistant|gpt|claude|gemini)\b/i.test(name);

  const contextMatch = aiPatterns.some((p) => p.test(context));

  return nameMatch || contextMatch;
}

/**
 * Update classification based on conversational evidence.
 * Use when the participant says something that reveals their nature.
 */
export function reclassifyFromResponse(
  participant: Participant,
  responseText: string
): Participant {
  const lower = responseText.toLowerCase();

  // If they explicitly claim to be an AI
  if (
    /\b(i am an ai|i am ai|i'm an ai|i'm ai|as an ai|as a language model)\b/i.test(
      lower
    )
  ) {
    return {
      ...participant,
      classification: "AI_PERSONA",
      classificationConfidence: Math.min(
        participant.classificationConfidence + 0.2,
        0.8
      ),
      evidence: [
        ...participant.evidence,
        "self_claimed_ai",
      ],
    };
  }

  // If they deny being an AI
  if (
    /\b(i am not an ai|i'm not an ai|i'm human|i am human|i'm a person)\b/i.test(
      lower
    )
  ) {
    return {
      ...participant,
      classification: "HUMAN",
      classificationConfidence: Math.min(
        participant.classificationConfidence + 0.1,
        0.85
      ),
      evidence: [
        ...participant.evidence,
        "denied_ai_claim",
      ],
    };
  }

  return participant;
}
