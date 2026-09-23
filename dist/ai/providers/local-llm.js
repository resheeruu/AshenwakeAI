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
var local_llm_exports = {};
__export(local_llm_exports, {
  LocalLLMProvider: () => LocalLLMProvider
});
module.exports = __toCommonJS(local_llm_exports);
var import_http = require("./http");
var import_logger = require("../../logger");
class LocalLLMProvider {
  name = "local-llm";
  baseURL;
  defaultModel;
  available = null;
  constructor() {
    this.baseURL = process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:8080";
    this.defaultModel = process.env.LOCAL_LLM_MODEL || "local";
  }
  isAvailable() {
    if (this.available === null) {
      this.checkAvailability();
    }
    return this.available === true;
  }
  checkAvailability() {
    if (process.env.LOCAL_LLM_ENABLED !== "true") {
      this.available = false;
      return;
    }
    fetch(`${this.baseURL}/v1/models`, { signal: AbortSignal.timeout(2e3) }).then((r) => {
      this.available = r.ok;
      if (r.ok) {
        import_logger.logger.info(`\u{1F3E0} Local LLM available at ${this.baseURL}`);
      }
    }).catch(() => {
      this.available = false;
    });
  }
  async generate(request) {
    const started = (0, import_http.now)();
    const model = request.model || this.defaultModel;
    const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(3e4),
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024,
        stream: false
      })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Local LLM HTTP ${response.status}: ${body.slice(0, 200)}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Local LLM returned an empty response.");
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
  LocalLLMProvider
});
