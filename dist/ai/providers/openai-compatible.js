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
var openai_compatible_exports = {};
__export(openai_compatible_exports, {
  OpenAICompatibleProvider: () => OpenAICompatibleProvider
});
module.exports = __toCommonJS(openai_compatible_exports);
var import_http = require("./http");
class OpenAICompatibleProvider {
  name;
  apiKey;
  baseURL;
  defaultModel;
  extraHeaders;
  constructor(options) {
    this.name = options.name;
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL.replace(/\/$/, "");
    this.defaultModel = options.defaultModel;
    this.extraHeaders = options.extraHeaders ?? {};
  }
  isAvailable() {
    return Boolean(this.apiKey);
  }
  async generate(request) {
    const started = (0, import_http.now)();
    if (!this.apiKey) {
      throw new Error(`${this.name} API key is missing.`);
    }
    const model = request.model || this.defaultModel;
    const response = await fetch(
      `${this.baseURL}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...this.extraHeaders
        },
        signal: AbortSignal.timeout(15e3),
        body: JSON.stringify({
          model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 1024
        })
      }
    );
    if (!response.ok) {
      throw new Error(
        `${this.name} HTTP ${response.status}`
      );
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error(
        `${this.name} returned an empty response.`
      );
    }
    return (0, import_http.buildResponse)(
      text,
      this.name,
      model,
      started,
      data?.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : void 0
    );
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OpenAICompatibleProvider
});
