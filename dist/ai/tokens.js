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
var tokens_exports = {};
__export(tokens_exports, {
  countChatTokens: () => countChatTokens,
  countTokens: () => countTokens,
  getAvailableResponseTokens: () => getAvailableResponseTokens,
  isWithinTokenLimit: () => isWithinTokenLimit,
  selectMessagesForTokenBudget: () => selectMessagesForTokenBudget,
  truncateToTokenLimit: () => truncateToTokenLimit
});
module.exports = __toCommonJS(tokens_exports);
var import_gpt_tokenizer = require("gpt-tokenizer");
const MAX_CONTEXT_TOKENS = 4096;
const RESERVE_TOKENS = 512;
function countTokens(text) {
  if (!text) return 0;
  return (0, import_gpt_tokenizer.encode)(text).length;
}
function countChatTokens(messages) {
  if (!messages.length) return 0;
  try {
    const encoded = (0, import_gpt_tokenizer.encodeChat)(
      messages.map((m) => ({ role: m.role, content: m.content }))
    );
    return encoded.length;
  } catch {
    return messages.reduce((sum, m) => sum + countTokens(m.content) + 4, 0);
  }
}
function isWithinTokenLimit(text, limit) {
  return countTokens(text) <= limit;
}
function truncateToTokenLimit(text, limit) {
  const tokens = (0, import_gpt_tokenizer.encode)(text);
  if (tokens.length <= limit) return text;
  return decode(tokens.slice(0, limit));
}
function getAvailableResponseTokens(messages, modelLimit = MAX_CONTEXT_TOKENS) {
  const used = countChatTokens(messages);
  return Math.max(256, modelLimit - used - RESERVE_TOKENS);
}
function selectMessagesForTokenBudget(messages, tokenBudget) {
  if (messages.length === 0) return [];
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");
  const systemTokens = countChatTokens(systemMessages);
  const availableForHistory = tokenBudget - systemTokens;
  if (availableForHistory <= 0) return systemMessages;
  const selected = [...systemMessages];
  let usedTokens = 0;
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msg = nonSystemMessages[i];
    const msgTokens = countTokens(msg.content) + 4;
    if (usedTokens + msgTokens > availableForHistory) break;
    usedTokens += msgTokens;
    selected.splice(systemMessages.length, 0, msg);
  }
  return selected;
}
function decode(tokens) {
  try {
    const mod = require("gpt-tokenizer");
    return mod.decode(tokens);
  } catch {
    return tokens.join(" ");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  countChatTokens,
  countTokens,
  getAvailableResponseTokens,
  isWithinTokenLimit,
  selectMessagesForTokenBudget,
  truncateToTokenLimit
});
