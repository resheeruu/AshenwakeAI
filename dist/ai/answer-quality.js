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
var answer_quality_exports = {};
__export(answer_quality_exports, {
  AnswerQualityEngine: () => AnswerQualityEngine
});
module.exports = __toCommonJS(answer_quality_exports);
class AnswerQualityEngine {
  minimumLength = 20;
  looksUnfinished(text) {
    const value = text.trim();
    if (!value) return true;
    if (value.length < this.minimumLength) {
      return true;
    }
    if (/[,:;(\-]$/.test(value)) {
      return true;
    }
    const codeBlocks = (value.match(/```/g) ?? []).length;
    if (codeBlocks % 2 !== 0) {
      return true;
    }
    const unfinishedEndings = [
      "for example:",
      "such as:",
      "including:",
      "because",
      "although",
      "however,",
      "therefore,",
      "which means",
      "this is because",
      "the main reason is",
      "in conclusion,"
    ];
    const lower = value.toLowerCase();
    if (unfinishedEndings.some(
      (ending) => lower.endsWith(ending)
    )) {
      return true;
    }
    return false;
  }
  inspect(text) {
    const unfinished = this.looksUnfinished(text);
    return {
      text: text.trim(),
      unfinished,
      reason: unfinished ? "The generated answer appears incomplete." : void 0
    };
  }
  buildContinuationRequest(original, answer) {
    const messages = [
      ...original.messages,
      {
        role: "assistant",
        content: answer
      },
      {
        role: "user",
        content: "Continue the previous answer from exactly where it stopped. Do not repeat the previous content. Finish the explanation naturally and completely. If a list, example, code block, or sentence was started, finish it. Return only the continuation."
      }
    ];
    return {
      ...original,
      messages
    };
  }
  combine(first, continuation) {
    const a = first.trim();
    const b = continuation.trim();
    if (!b) return a;
    if (!a) return b;
    return `${a}
${b}`;
  }
  validateResponse(response) {
    return this.inspect(response.text);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AnswerQualityEngine
});
