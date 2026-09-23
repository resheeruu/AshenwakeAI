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
var context_engine_exports = {};
__export(context_engine_exports, {
  ContextEngine: () => ContextEngine
});
module.exports = __toCommonJS(context_engine_exports);
class ContextEngine {
  build(history, userMessage, analysis, maxMessages = 20) {
    let selected = [...history];
    if (!analysis.needsMemory) {
      selected = [];
    }
    if (analysis.isFollowUp && history.length > 0) {
      selected = history.slice(-Math.min(maxMessages, history.length));
    } else {
      selected = selected.slice(-maxMessages);
    }
    const system = {
      role: "system",
      content: [
        "You are AshenAI, a helpful Discord AI assistant.",
        "Maintain continuity with the conversation when context is provided.",
        analysis.isFollowUp ? "The user's message is a follow-up. Interpret it using the previous conversation." : "",
        `Detected intent: ${analysis.intent}.`,
        `Complexity: ${analysis.complexity}.`,
        "Never reveal API keys, tokens, passwords, or private configuration."
      ].filter(Boolean).join("\n")
    };
    return {
      messages: [
        system,
        ...selected,
        {
          role: "user",
          content: userMessage
        }
      ],
      historyUsed: selected.length
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ContextEngine
});
