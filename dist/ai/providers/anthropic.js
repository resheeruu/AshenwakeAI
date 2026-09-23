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
var anthropic_exports = {};
__export(anthropic_exports, {
  AnthropicProvider: () => AnthropicProvider
});
module.exports = __toCommonJS(anthropic_exports);
var import_config = require("./config");
var import_http = require("./http");
class AnthropicProvider {
  name = "anthropic";
  isAvailable() {
    return Boolean(import_config.providerConfig.anthropic.apiKey);
  }
  async generate(request) {
    const started = (0, import_http.now)();
    const apiKey = import_config.providerConfig.anthropic.apiKey;
    if (!apiKey) {
      throw new Error(
        "Anthropic API key is missing."
      );
    }
    const model = request.model || import_config.providerConfig.anthropic.model;
    const systemMessage = request.messages.find(
      (message) => message.role === "system"
    );
    const messages = request.messages.filter((message) => message.role !== "system").map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content
    }));
    const body = {
      model,
      max_tokens: request.maxTokens ?? 1024,
      messages
    };
    if (systemMessage) {
      body.system = systemMessage.content;
    }
    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        signal: AbortSignal.timeout(15e3),
        body: JSON.stringify(body)
      }
    );
    if (!response.ok) {
      throw new Error(
        `Anthropic HTTP ${response.status}`
      );
    }
    const data = await response.json();
    const text = data?.content?.map((item) => item?.text)?.filter(Boolean)?.join("") || "";
    if (!text) {
      throw new Error(
        "Anthropic returned an empty response."
      );
    }
    return (0, import_http.buildResponse)(
      text,
      this.name,
      model,
      started,
      data?.usage ? {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
      } : void 0
    );
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AnthropicProvider
});
