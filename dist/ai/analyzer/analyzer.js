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
var analyzer_exports = {};
__export(analyzer_exports, {
  RequestAnalyzer: () => RequestAnalyzer
});
module.exports = __toCommonJS(analyzer_exports);
class RequestAnalyzer {
  analyze(content, hasHistory) {
    const text = content.trim().toLowerCase();
    const followUpPatterns = [
      /^more[.!?]*$/,
      /^continue[.!?]*$/,
      /^explain more[.!?]*$/,
      /^tell me more[.!?]*$/,
      /^what about that[.!?]*$/,
      /^and then[.!?]*$/,
      /^why[.!?]*$/,
      /^how so[.!?]*$/,
      /^elaborate[.!?]*$/
    ];
    const isFollowUp = hasHistory && followUpPatterns.some((pattern) => pattern.test(text));
    let intent = "general";
    if (/^(hi|hello|hey|yo|sup|wazzup|good morning|good evening)\b/.test(
      text
    )) {
      intent = "greeting";
    } else if (isFollowUp) {
      intent = "followup";
    } else if (/\b(code|coding|typescript|javascript|python|java|debug|bug|function|class|api|program)\b/.test(
      text
    )) {
      intent = "coding";
    } else if (/\b(prove|analyze|analysis|reason|logic|compare|difference|why|solve|calculate)\b/.test(
      text
    )) {
      intent = "reasoning";
    } else if (/\b(write|story|poem|creative|joke|funny|imagine|idea)\b/.test(
      text
    )) {
      intent = "creative";
    } else if (/\b(what is|who is|when did|where is|define|meaning)\b/.test(
      text
    )) {
      intent = "factual";
    }
    const complexity = text.length > 500 || intent === "reasoning" ? "high" : text.length > 150 ? "medium" : "low";
    const keywords = text.replace(/[^\w\s]/g, " ").split(/\s+/).filter((word) => word.length >= 4).slice(0, 12);
    return {
      intent,
      isFollowUp,
      needsMemory: isFollowUp || hasHistory || intent === "reasoning",
      complexity,
      priority: intent === "followup" || intent === "reasoning" ? "high" : "normal",
      confidence: isFollowUp ? 0.98 : 0.8,
      keywords
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RequestAnalyzer
});
