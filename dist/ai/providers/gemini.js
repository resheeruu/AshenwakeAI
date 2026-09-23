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
var gemini_exports = {};
__export(gemini_exports, {
  GeminiProvider: () => GeminiProvider
});
module.exports = __toCommonJS(gemini_exports);
var import_config = require("./config");
var import_http = require("./http");
class GeminiProvider {
  name = "gemini";
  isAvailable() {
    return Boolean(import_config.providerConfig.gemini.apiKey);
  }
  async generate(request) {
    const started = (0, import_http.now)();
    const apiKey = import_config.providerConfig.gemini.apiKey;
    if (!apiKey) {
      throw new Error("Gemini API key is missing.");
    }
    const model = request.model || import_config.providerConfig.gemini.model;
    const contents = request.messages.filter((message) => message.role !== "system").map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: message.content
        }
      ]
    }));
    const systemMessage = request.messages.find(
      (message) => message.role === "system"
    );
    const body = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 1024
      }
    };
    if (systemMessage) {
      body.systemInstruction = {
        parts: [
          {
            text: systemMessage.content
          }
        ]
      };
    }
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        signal: AbortSignal.timeout(15e3),
        body: JSON.stringify(body)
      }
    );
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Gemini returned invalid JSON: ${raw.slice(0, 500)}`
      );
    }
    if (!response.ok) {
      throw new Error(
        `Gemini HTTP ${response.status}: ${data?.error?.message || "Unknown error"}`
      );
    }
    const candidates = data?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      const blockReason = data?.promptFeedback?.blockReason;
      const blockMessage = data?.promptFeedback?.blockReasonMessage;
      if (blockReason) {
        throw new Error(
          `Gemini returned no candidates. Block reason: ${blockReason}` + (blockMessage ? ` \u2014 ${blockMessage}` : "")
        );
      }
      throw new Error(
        `Gemini returned no candidates. Response: (details redacted)`
      );
    }
    const parts = candidates[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((part) => part?.text).filter(
      (value) => typeof value === "string" && value.length > 0
    ).join("").trim() : "";
    if (!text) {
      const finishReason = candidates[0]?.finishReason || "unknown";
      throw new Error(
        `Gemini returned no text. Finish reason: ${finishReason}`
      );
    }
    return (0, import_http.buildResponse)(
      text,
      this.name,
      model,
      started,
      data?.usageMetadata ? {
        inputTokens: data.usageMetadata.promptTokenCount,
        outputTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount
      } : void 0
    );
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GeminiProvider
});
