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
var provider_catalog_exports = {};
__export(provider_catalog_exports, {
  getAllProviderNames: () => getAllProviderNames,
  getProviderCatalogEntry: () => getProviderCatalogEntry,
  getProviderCount: () => getProviderCount,
  getProvidersByCategory: () => getProvidersByCategory,
  getProvidersByPricing: () => getProvidersByPricing,
  providerCatalog: () => providerCatalog
});
module.exports = __toCommonJS(provider_catalog_exports);
const providerCatalog = [
  { id: "gemini", name: "google-gemini", displayName: "Google Gemini", pricingClass: "free-tier", credentialRequired: true, protocol: "gemini", category: "Major AI", capabilities: ["chat", "vision", "tools", "streaming"], quota: "Free tier with generous limits", availability: "available", lastVerified: Date.now() },
  { id: "groq", name: "groq", displayName: "Groq", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Ultra-Fast LLM", capabilities: ["chat", "streaming"], quota: "Free tier available", availability: "available", lastVerified: Date.now() },
  { id: "openrouter", name: "openrouter", displayName: "OpenRouter", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Aggregator", capabilities: ["chat", "vision", "tools", "streaming"], quota: "Pay-as-you-go with free credits", availability: "available", lastVerified: Date.now() },
  { id: "mistral", name: "mistral", displayName: "Mistral AI", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Major AI", capabilities: ["chat", "tools", "streaming"], quota: "Free tier available", availability: "available", lastVerified: Date.now() },
  { id: "anthropic", name: "anthropic", displayName: "Anthropic Claude", pricingClass: "paid", credentialRequired: true, protocol: "anthropic", category: "Major AI", capabilities: ["chat", "vision", "tools", "streaming"], quota: "Paid only", availability: "available", lastVerified: Date.now() },
  { id: "openai", name: "openai", displayName: "OpenAI", pricingClass: "paid", credentialRequired: true, protocol: "openai_compatible", category: "Major AI", capabilities: ["chat", "vision", "tools", "streaming"], quota: "Paid only", availability: "available", lastVerified: Date.now() },
  { id: "cohere", name: "cohere", displayName: "Cohere", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Enterprise AI", capabilities: ["chat", "tools", "streaming"], quota: "Free tier available", availability: "available", lastVerified: Date.now() },
  { id: "together", name: "together", displayName: "Together AI", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Open Source", capabilities: ["chat", "streaming"], quota: "Free tier available", availability: "available", lastVerified: Date.now() },
  { id: "deepseek", name: "deepseek", displayName: "DeepSeek", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Major AI", capabilities: ["chat", "reasoning", "streaming"], quota: "Free tier with generous limits", availability: "available", lastVerified: Date.now() },
  { id: "xai", name: "xai", displayName: "xAI Grok", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Major AI", capabilities: ["chat", "streaming"], quota: "Free tier available", availability: "unknown" },
  { id: "huggingface", name: "huggingface", displayName: "Hugging Face", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Open Source", capabilities: ["chat", "embedding", "streaming"], quota: "Free Inference API", availability: "available", lastVerified: Date.now() },
  { id: "nvidia", name: "nvidia", displayName: "NVIDIA NIM", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "GPU Accelerated", capabilities: ["chat", "vision", "streaming"], quota: "Free tier with GPU credits", availability: "available", lastVerified: Date.now() },
  { id: "fireworks", name: "fireworks", displayName: "Fireworks AI", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Open Source", capabilities: ["chat", "streaming"], quota: "Free tier available", availability: "available", lastVerified: Date.now() },
  { id: "cerebras", name: "cerebras", displayName: "Cerebras", pricingClass: "trial", credentialRequired: true, protocol: "openai_compatible", category: "Ultra-Fast", capabilities: ["chat", "streaming"], quota: "Trial credits available", availability: "unknown" },
  { id: "sambanova", name: "sambanova", displayName: "SambaNova", pricingClass: "trial", credentialRequired: true, protocol: "openai_compatible", category: "Enterprise", capabilities: ["chat", "streaming"], quota: "Trial credits available", availability: "unknown" },
  { id: "novita", name: "novita", displayName: "Novita AI", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Budget AI", capabilities: ["chat", "streaming"], quota: "Free tier available", availability: "available", lastVerified: Date.now() },
  { id: "ollama", name: "ollama", displayName: "Ollama", pricingClass: "local", credentialRequired: false, protocol: "ollama", category: "Local AI", capabilities: ["chat", "streaming"], quota: "Local - no API key required", availability: "available" },
  { id: "local-llm", name: "local-llm", displayName: "llama.cpp / Local LLM", pricingClass: "local", credentialRequired: false, protocol: "openai_compatible", category: "Local AI", capabilities: ["chat", "streaming"], quota: "Local - no API key required", availability: "available" },
  { id: "custom", name: "custom", displayName: "Custom OpenAI-Compatible", pricingClass: "custom", credentialRequired: true, protocol: "openai_compatible", category: "Custom", capabilities: ["chat", "streaming"], quota: "Depends on custom endpoint", availability: "unknown" },
  { id: "deepinfra", name: "deepinfra", displayName: "DeepInfra", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Budget AI", capabilities: ["chat", "streaming"], quota: "Free tier available", availability: "unknown" },
  { id: "replicate", name: "replicate", displayName: "Replicate", pricingClass: "paid", credentialRequired: true, protocol: "openai_compatible", category: "Platform", capabilities: ["chat", "vision", "streaming"], quota: "Pay-per-compute", availability: "unknown" },
  { id: "github-models", name: "github-models", displayName: "GitHub Models", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Developer Platform", capabilities: ["chat", "streaming"], quota: "Free tier available", availability: "unknown" },
  { id: "cloudflare-ai", name: "cloudflare-ai", displayName: "Cloudflare Workers AI", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Edge AI", capabilities: ["chat", "streaming"], quota: "Free tier with Workers bundles", availability: "unknown" },
  { id: "zai", name: "zai", displayName: "Z.AI (Zhipu)", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Major AI", capabilities: ["chat", "vision", "streaming"], quota: "Free tier available", availability: "unknown" },
  { id: "minimax", name: "minimax", displayName: "MiniMax", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Major AI", capabilities: ["chat", "streaming"], quota: "Free tier available", availability: "unknown" },
  { id: "alibaba", name: "alibaba", displayName: "Alibaba Qwen", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Major AI", capabilities: ["chat", "vision", "streaming"], quota: "Free tier available", availability: "unknown" },
  { id: "ai21", name: "ai21", displayName: "AI21 Labs", pricingClass: "paid", credentialRequired: true, protocol: "openai_compatible", category: "Enterprise AI", capabilities: ["chat", "streaming"], quota: "Paid only", availability: "unknown" },
  { id: "baseten", name: "baseten", displayName: "Baseten", pricingClass: "trial", credentialRequired: true, protocol: "openai_compatible", category: "Platform", capabilities: ["chat", "streaming"], quota: "Trial credits available", availability: "unknown" },
  { id: "amazon-bedrock", name: "amazon-bedrock", displayName: "Amazon Bedrock", pricingClass: "paid", credentialRequired: true, protocol: "openai_compatible", category: "Cloud AI", capabilities: ["chat", "vision", "streaming"], quota: "Pay-per-use", availability: "unknown" },
  { id: "hyperbolic", name: "hyperbolic", displayName: "Hyperbolic", pricingClass: "free-tier", credentialRequired: true, protocol: "openai_compatible", category: "Budget AI", capabilities: ["chat", "streaming"], quota: "Free tier available", availability: "unknown" }
];
function getProviderCatalogEntry(id) {
  return providerCatalog.find((e) => e.id === id || e.name === id);
}
function getProvidersByPricing(pricingClass) {
  return providerCatalog.filter((e) => e.pricingClass === pricingClass);
}
function getProvidersByCategory(category) {
  return providerCatalog.filter((e) => e.category === category);
}
function getAllProviderNames() {
  return providerCatalog.map((e) => e.name);
}
function getProviderCount() {
  return providerCatalog.length;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getAllProviderNames,
  getProviderCatalogEntry,
  getProviderCount,
  getProvidersByCategory,
  getProvidersByPricing,
  providerCatalog
});
