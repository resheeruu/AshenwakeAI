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
var http_exports = {};
__export(http_exports, {
  buildResponse: () => buildResponse,
  getConversationMessages: () => getConversationMessages,
  getLastUserMessage: () => getLastUserMessage,
  getSystemMessage: () => getSystemMessage,
  now: () => now
});
module.exports = __toCommonJS(http_exports);
function now() {
  return Date.now();
}
function buildResponse(text, provider, model, startedAt, tokenUsage) {
  return {
    text,
    provider,
    model,
    latencyMs: Date.now() - startedAt,
    ...tokenUsage
  };
}
function getLastUserMessage(request) {
  const message = [...request.messages].reverse().find((item) => item.role === "user");
  return message?.content || "";
}
function getSystemMessage(request) {
  const message = request.messages.find(
    (item) => item.role === "system"
  );
  return message?.content;
}
function getConversationMessages(request) {
  return request.messages.filter(
    (item) => item.role !== "system"
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildResponse,
  getConversationMessages,
  getLastUserMessage,
  getSystemMessage,
  now
});
