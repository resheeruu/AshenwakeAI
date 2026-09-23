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
var cohere_exports = {};
__export(cohere_exports, {
  CohereProvider: () => CohereProvider
});
module.exports = __toCommonJS(cohere_exports);
var import_config = require("./config");
var import_http = require("./http");
class CohereProvider {
  name = "cohere";
  isAvailable() {
    return Boolean(import_config.providerConfig.cohere.apiKey);
  }
  async generate(request) {
    const started = (0, import_http.now)();
    const apiKey = import_config.providerConfig.cohere.apiKey;
    if (!apiKey) {
      throw new Error("Cohere API key is missing.");
    }
    const model = request.model || import_config.providerConfig.cohere.model;
    const response = await fetch(
      "https://api.cohere.com/v2/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(15e3),
        body: JSON.stringify({
          model,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content
          })),
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 1024
        })
      }
    );
    if (!response.ok) {
      throw new Error(
        `Cohere HTTP ${response.status}`
      );
    }
    const data = await response.json();
    const text = data?.message?.content?.map((item) => item?.text)?.filter(Boolean)?.join("\n") || "";
    if (!text) {
      throw new Error(
        "Cohere returned an empty response."
      );
    }
    return (0, import_http.buildResponse)(
      text,
      this.name,
      model,
      started,
      data?.usage?.tokens ? {
        inputTokens: data.usage.tokens.input_tokens,
        outputTokens: data.usage.tokens.output_tokens,
        totalTokens: (data.usage.tokens.input_tokens ?? 0) + (data.usage.tokens.output_tokens ?? 0)
      } : void 0
    );
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CohereProvider
});
