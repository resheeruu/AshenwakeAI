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
var ollama_exports = {};
__export(ollama_exports, {
  OllamaProvider: () => OllamaProvider
});
module.exports = __toCommonJS(ollama_exports);
var import_http = require("./http");
class OllamaProvider {
  name = "ollama";
  baseURL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  defaultModel = process.env.OLLAMA_MODEL || "qwen2.5-coder:0.5b";
  available = null;
  isAvailable() {
    if (this.available === null) {
      this.checkAvailability();
    }
    return this.available === true;
  }
  checkAvailability() {
    fetch(`${this.baseURL}/api/tags`, { signal: AbortSignal.timeout(2e3) }).then((r) => {
      this.available = r.ok;
    }).catch(() => {
      this.available = false;
    });
  }
  async generate(request) {
    const started = (0, import_http.now)();
    const model = request.model || this.defaultModel;
    const response = await fetch(
      `${this.baseURL}/api/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(15e3),
        body: JSON.stringify({
          model,
          messages: request.messages,
          stream: false,
          options: {
            temperature: request.temperature ?? 0.7,
            num_predict: request.maxTokens ?? 1024
          }
        })
      }
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Ollama HTTP ${response.status}`
      );
    }
    const data = await response.json();
    const text = data?.message?.content;
    if (!text) {
      throw new Error(
        "Ollama returned an empty response."
      );
    }
    return (0, import_http.buildResponse)(
      text,
      this.name,
      model,
      started,
      data.prompt_eval_count != null || data.eval_count != null ? {
        inputTokens: data.prompt_eval_count ?? void 0,
        outputTokens: data.eval_count ?? void 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0) || void 0
      } : void 0
    );
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OllamaProvider
});
