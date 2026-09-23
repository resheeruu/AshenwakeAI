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
var provider_adapter_exports = {};
__export(provider_adapter_exports, {
  createDynamicProvider: () => createDynamicProvider,
  loadAllDynamicProviders: () => loadAllDynamicProviders
});
module.exports = __toCommonJS(provider_adapter_exports);
var import_credential_store = require("./credential-store");
var import_provider_repo = require("./provider-repo");
var import_network_boundary = require("../../../security/network-boundary");
var import_outbound_fetch = require("../../../security/outbound-fetch");
function assertSafeProviderEndpoint(endpoint, protocol) {
  const check = protocol === "ollama" ? (0, import_network_boundary.validateTrustedLocalProviderUrl)(endpoint) : (0, import_network_boundary.validateOutboundUrl)(endpoint);
  if (!check.valid || !check.url) {
    throw new Error(`Provider endpoint blocked: ${check.reason ?? endpoint}`);
  }
  return check.url.toString().replace(/\/$/, "");
}
function policyFor(protocol) {
  return protocol === "ollama" ? "trusted-local" : "public";
}
async function providerFetch(url, init, protocol) {
  const { response } = await (0, import_outbound_fetch.hardenedFetch)(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
    timeoutMs: init.timeoutMs,
    policy: policyFor(protocol),
    maxRedirects: 5
  });
  return response;
}
class DynamicOpenAICompatibleProvider {
  name;
  def;
  apiKey;
  constructor(def) {
    this.name = def.name;
    this.def = def;
    this.apiKey = (0, import_credential_store.getCredential)(def.id, "api_key");
  }
  isAvailable() {
    return this.def.enabled && Boolean(this.apiKey);
  }
  async generate(request) {
    if (!this.apiKey) throw new Error(`${this.name} API key is missing`);
    const model = request.model || this.def.defaultModel || "gpt-4o-mini";
    const endpoint = assertSafeProviderEndpoint(
      this.def.endpoint || "https://api.openai.com/v1",
      "openai_compatible"
    );
    const started = Date.now();
    const response = await providerFetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      signal: AbortSignal.timeout(this.def.timeoutMs),
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024
      })
    }, "openai_compatible");
    if (!response.ok) throw new Error(`${this.name} HTTP ${response.status}`);
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${this.name} returned empty response`);
    return {
      text,
      provider: this.name,
      model,
      latencyMs: Date.now() - started,
      inputTokens: data?.usage?.prompt_tokens,
      outputTokens: data?.usage?.completion_tokens,
      totalTokens: data?.usage?.total_tokens
    };
  }
}
class DynamicAnthropicProvider {
  name;
  def;
  apiKey;
  constructor(def) {
    this.name = def.name;
    this.def = def;
    this.apiKey = (0, import_credential_store.getCredential)(def.id, "api_key");
  }
  isAvailable() {
    return this.def.enabled && Boolean(this.apiKey);
  }
  async generate(request) {
    if (!this.apiKey) throw new Error(`${this.name} API key is missing`);
    const model = request.model || this.def.defaultModel || "claude-3-5-haiku-latest";
    const endpoint = assertSafeProviderEndpoint(
      this.def.endpoint || "https://api.anthropic.com",
      "anthropic"
    );
    const started = Date.now();
    const systemMsg = request.messages.find((m) => m.role === "system");
    const nonSystemMsgs = request.messages.filter((m) => m.role !== "system");
    const response = await providerFetch(`${endpoint}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      signal: AbortSignal.timeout(this.def.timeoutMs),
      body: JSON.stringify({
        model,
        system: systemMsg?.content || "You are a helpful assistant.",
        messages: nonSystemMsgs.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content
        })),
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7
      })
    }, "anthropic");
    if (!response.ok) throw new Error(`${this.name} HTTP ${response.status}`);
    const data = await response.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error(`${this.name} returned empty response`);
    return {
      text,
      provider: this.name,
      model,
      latencyMs: Date.now() - started,
      inputTokens: data?.usage?.input_tokens,
      outputTokens: data?.usage?.output_tokens,
      totalTokens: (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0)
    };
  }
}
class DynamicGeminiProvider {
  name;
  def;
  apiKey;
  constructor(def) {
    this.name = def.name;
    this.def = def;
    this.apiKey = (0, import_credential_store.getCredential)(def.id, "api_key");
  }
  isAvailable() {
    return this.def.enabled && Boolean(this.apiKey);
  }
  async generate(request) {
    if (!this.apiKey) throw new Error(`${this.name} API key is missing`);
    const model = request.model || this.def.defaultModel || "gemini-3.6-flash";
    const endpoint = assertSafeProviderEndpoint(
      this.def.endpoint || "https://generativelanguage.googleapis.com",
      "gemini"
    );
    const started = Date.now();
    const contents = request.messages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    const systemMsg = request.messages.find((m) => m.role === "system");
    const body = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 1024
      }
    };
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }
    const response = await providerFetch(
      `${endpoint}/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        signal: AbortSignal.timeout(this.def.timeoutMs),
        body: JSON.stringify(body)
      },
      "gemini"
    );
    if (!response.ok) throw new Error(`${this.name} HTTP ${response.status}`);
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`${this.name} returned empty response`);
    return {
      text,
      provider: this.name,
      model,
      latencyMs: Date.now() - started,
      inputTokens: data?.usageMetadata?.promptTokenCount,
      outputTokens: data?.usageMetadata?.candidatesTokenCount,
      totalTokens: data?.usageMetadata?.totalTokenCount
    };
  }
}
class DynamicOllamaProvider {
  name;
  def;
  constructor(def) {
    this.name = def.name;
    this.def = def;
  }
  isAvailable() {
    return this.def.enabled;
  }
  async generate(request) {
    const model = request.model || this.def.defaultModel || "llama3.2";
    const endpoint = assertSafeProviderEndpoint(
      this.def.endpoint || "http://localhost:11434",
      "ollama"
    );
    const started = Date.now();
    const response = await providerFetch(`${endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(this.def.timeoutMs),
      body: JSON.stringify({
        model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 1024
        }
      })
    }, "ollama");
    if (!response.ok) throw new Error(`${this.name} HTTP ${response.status}`);
    const data = await response.json();
    const text = data?.message?.content;
    if (!text) throw new Error(`${this.name} returned empty response`);
    return {
      text,
      provider: this.name,
      model,
      latencyMs: Date.now() - started,
      inputTokens: data?.prompt_eval_count,
      outputTokens: data?.eval_count,
      totalTokens: (data?.prompt_eval_count || 0) + (data?.eval_count || 0)
    };
  }
}
function createDynamicProvider(def) {
  switch (def.protocol) {
    case "anthropic":
      return new DynamicAnthropicProvider(def);
    case "gemini":
      return new DynamicGeminiProvider(def);
    case "ollama":
      return new DynamicOllamaProvider(def);
    case "openai_compatible":
    default:
      return new DynamicOpenAICompatibleProvider(def);
  }
}
function loadAllDynamicProviders() {
  const defs = import_provider_repo.providerRepo.getEnabled();
  return defs.map((def) => ({
    provider: createDynamicProvider(def),
    priority: def.priority
  }));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createDynamicProvider,
  loadAllDynamicProviders
});
