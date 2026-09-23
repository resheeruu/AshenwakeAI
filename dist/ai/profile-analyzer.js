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
var profile_analyzer_exports = {};
__export(profile_analyzer_exports, {
  analyzeProfileSignals: () => analyzeProfileSignals
});
module.exports = __toCommonJS(profile_analyzer_exports);
function countEmoji(text) {
  return text.match(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu
  )?.length ?? 0;
}
function detectLanguage(text) {
  const lower = text.toLowerCase();
  const filipinoWords = [
    "ako",
    "ikaw",
    "ano",
    "bakit",
    "paano",
    "saan",
    "salamat",
    "oo",
    "hindi",
    "ayos",
    "kumusta",
    "pwede",
    "gusto",
    "kailangan"
  ];
  const hasFilipino = filipinoWords.some(
    (word) => new RegExp(`\\b${word}\\b`, "i").test(lower)
  );
  const englishWords = [
    "the",
    "what",
    "why",
    "how",
    "where",
    "please",
    "thanks",
    "help",
    "can",
    "should"
  ];
  const hasEnglish = englishWords.some(
    (word) => new RegExp(`\\b${word}\\b`, "i").test(lower)
  );
  if (hasFilipino && hasEnglish) {
    return "taglish";
  }
  if (hasFilipino) {
    return "fil";
  }
  if (hasEnglish) {
    return "en";
  }
  return void 0;
}
function analyzeProfileSignals(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  const signals = {};
  const language = detectLanguage(trimmed);
  if (language) {
    signals.language = language;
  }
  const emojiCount = countEmoji(trimmed);
  if (emojiCount >= 3) {
    signals.emoji = "high";
  } else if (emojiCount >= 1) {
    signals.emoji = "medium";
  } else {
    signals.emoji = "low";
  }
  const casualMarkers = /\b(lol|lmao|haha|hahaha|bro|bruh|dude|yo|nah|yep|yup)\b/i.test(
    trimmed
  );
  const formalMarkers = /\b(please|kindly|regarding|therefore|furthermore|respectfully)\b/i.test(
    trimmed
  );
  if (casualMarkers) {
    signals.formality = "low";
    signals.humor = "medium";
  } else if (formalMarkers) {
    signals.formality = "high";
    signals.humor = "low";
  }
  if (/\b(joke|joking|funny|lmao|lol|haha|roast|meme)\b/i.test(
    trimmed
  )) {
    signals.humor = "high";
  }
  if (/\b(short|brief|quick|just answer|tl;dr)\b/i.test(
    trimmed
  ) || trimmed.length < 35) {
    signals.verbosity = "low";
  } else if (trimmed.length > 500) {
    signals.verbosity = "high";
  } else {
    signals.verbosity = "medium";
  }
  if (/```|typescript|javascript|python|npm|typescript|api|database|sql|terminal|linux|docker|git|typescript/i.test(
    trimmed
  )) {
    signals.technicalLevel = "advanced";
  }
  return signals;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  analyzeProfileSignals
});
