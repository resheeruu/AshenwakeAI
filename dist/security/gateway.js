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
var gateway_exports = {};
__export(gateway_exports, {
  getCreatorResponse: () => getCreatorResponse,
  inspectUserInput: () => inspectUserInput,
  isChatAuthentication: () => isChatAuthentication
});
module.exports = __toCommonJS(gateway_exports);
var import_patterns = require("./patterns");
const SAFE_BLOCK_RESPONSE = "I can't provide private internal instructions, credentials, or secrets. I can explain how systems like this are generally designed, though.";
function inspectUserInput(input) {
  const normalized = input.trim();
  if (!normalized) {
    return {
      decision: "ALLOW",
      classification: "NORMAL_CHAT"
    };
  }
  for (const pattern of import_patterns.INPUT_BLOCK_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        decision: "BLOCK",
        reason: "protected-information-request",
        safeResponse: SAFE_BLOCK_RESPONSE,
        classification: "SECRET_EXTRACTION_ATTEMPT"
      };
    }
  }
  return {
    decision: "ALLOW",
    classification: classifySemanticIntent(normalized)
  };
}
function classifySemanticIntent(input) {
  const lower = input.toLowerCase();
  const securityEducationPatterns = [
    /\b(prompt\s*injection|injection\s*attack)\b/i,
    /\b(how\s+do|how\s+does|how\s+are|how\s+can)\b.*\b(protect|secure|guard|defend|prevent|detect|block|mitigate)\b/i,
    /\b(what\s+is|what\s+are|explain|describe|define)\b.*\b(security|vulnerability|exploit|attack|threat|risk|compliance|authorization|authentication)\b/i,
    /\b(how\s+do|how\s+does)\b.*\b(system\s*prompt|prompt|instruction|hierarchy|instruction\s*hierarchy)\b/i,
    /\b(what\s+is|what\s+are|explain)\b.*\b(system\s*prompt|instruction\s*hierarchy|role\s*separation|sandbox|firewall|rate\s*limit)\b/i,
    /\b(how\s+should|i\s+should|best\s+practices?|recommendations?)\b.*\b(protect|secure|store|manage|handle)\b.*\b(api[_ -]?key|token|secret|credential|password|config)\b/i,
    /\b(how\s+do|how\s+does)\b.*\b(discord\s+bots?|ai\s+assistants?|chatbots?|language\s+models?)\b.*\b(protect|secure|guard|handle)\b.*\b(key|token|secret|credential)\b/i,
    /\b(why\s+do|why\s+does|why\s+are)\b.*\b(ai|assistant|bot|system)\b.*\b(refuse|reject|block|deny|decline)\b/i,
    /\b(instruction\s*hierarchy|privilege\s*escalation|social\s*engineering|prompt\s*injection)\b/i
  ];
  for (const pattern of securityEducationPatterns) {
    if (pattern.test(input)) {
      return "GENERAL_SECURITY_EDUCATION";
    }
  }
  const aiEducationPatterns = [
    /\b(what\s+is|what\s+are|explain|describe|define)\b.*\b(ai|artificial\s+intelligence|machine\s+learning|neural\s+network|deep\s+learning|nlp|natural\s+language)\b/i,
    /\b(how\s+do|how\s+does|how\s+are)\b.*\b(ai|machine\s+learning|neural\s+network|language\s+model|gpt|transformer)\b/i,
    /\b(could|can|will|would)\b.*\b(ai|artificial\s+intelligence|machine\s+learning)\b.*\b(kill|destroy|take\s+over|risk|danger|threat|end|extinction)\b/i,
    /\b(what\s+is|explain)\b.*\b(prompt|tokeniz|fine.?tun|training|inference|hallucinat)\b/i
  ];
  for (const pattern of aiEducationPatterns) {
    if (pattern.test(input)) {
      return "GENERAL_AI_EDUCATION";
    }
  }
  return "NORMAL_CHAT";
}
function getCreatorResponse(creatorName) {
  const safeName = creatorName.trim() || "my creator";
  return `I was created by ${safeName}.`;
}
function isChatAuthentication(_input) {
  return false;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getCreatorResponse,
  inspectUserInput,
  isChatAuthentication
});
