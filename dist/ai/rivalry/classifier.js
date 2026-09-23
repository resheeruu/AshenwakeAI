"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var classifier_exports = {};
__export(classifier_exports, {
  classifyParticipant: () => classifyParticipant,
  reclassifyFromResponse: () => reclassifyFromResponse
});
module.exports = __toCommonJS(classifier_exports);
function classifyParticipant(params) {
  const { userId, displayName, botFlag, contextMessage } = params;
  if (botFlag) {
    return {
      id: `discord:${userId}`,
      discordUserId: userId,
      displayName,
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1,
      evidence: ["discord_author_bot_flag"]
    };
  }
  const lowerContext = (contextMessage ?? "").toLowerCase();
  if (looksLikeAIPersona(displayName, lowerContext)) {
    return {
      id: `discord:${userId}`,
      discordUserId: userId,
      displayName,
      discordBot: false,
      classification: "AI_PERSONA",
      classificationConfidence: 0.5,
      evidence: ["persona_claim_or_name"]
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
      evidence: ["fictional_name_pattern"]
    };
  }
  return {
    id: `discord:${userId}`,
    discordUserId: userId,
    displayName,
    discordBot: false,
    classification: "HUMAN",
    classificationConfidence: 0.9,
    evidence: ["discord_author_not_bot"]
  };
}
function looksLikeFictionalPersona(name, context) {
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
    /\bvortex\b/i
  ];
  const nameMatch = fictionalPatterns.some(
    (p) => p.test(name)
  );
  const contextClaim = /\b(i am|i'm|call me|known as|presenting as)\b/.test(
    context
  ) && /\b(batman|superman|ai|robot|bot|persona|character)\b/i.test(
    context
  );
  return nameMatch || contextClaim;
}
function looksLikeAIPersona(name, context) {
  const aiPatterns = [
    /\b(artificial intelligence|neural net|language model)\b/i,
    /\b(i am an ai|i am ai|i'm an ai|i'm ai)\b/i,
    /\b(claude|gpt|chatgpt|bard|gemini|llama|mistral)\b/i,
    /\b(openai|anthropic|google ai)\b/i
  ];
  const nameMatch = /\b(bot|ai|assistant|gpt|claude|gemini)\b/i.test(name);
  const contextMatch = aiPatterns.some((p) => p.test(context));
  return nameMatch || contextMatch;
}
function reclassifyFromResponse(participant, responseText) {
  const lower = responseText.toLowerCase();
  if (/\b(i am an ai|i am ai|i'm an ai|i'm ai|as an ai|as a language model)\b/i.test(
    lower
  )) {
    return {
      ...participant,
      classification: "AI_PERSONA",
      classificationConfidence: Math.min(
        participant.classificationConfidence + 0.2,
        0.8
      ),
      evidence: [
        ...participant.evidence,
        "self_claimed_ai"
      ]
    };
  }
  if (/\b(i am not an ai|i'm not an ai|i'm human|i am human|i'm a person)\b/i.test(
    lower
  )) {
    return {
      ...participant,
      classification: "HUMAN",
      classificationConfidence: Math.min(
        participant.classificationConfidence + 0.1,
        0.85
      ),
      evidence: [
        ...participant.evidence,
        "denied_ai_claim"
      ]
    };
  }
  return participant;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  classifyParticipant,
  reclassifyFromResponse
});
