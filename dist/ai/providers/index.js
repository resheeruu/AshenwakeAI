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
var providers_exports = {};
__export(providers_exports, {
  getAllProviderNames: () => import_provider_catalog3.getAllProviderNames,
  getProviderCatalogEntry: () => import_provider_catalog3.getProviderCatalogEntry,
  getProviderCount: () => import_provider_catalog3.getProviderCount,
  getProvidersByCategory: () => import_provider_catalog3.getProvidersByCategory,
  getProvidersByPricing: () => import_provider_catalog3.getProvidersByPricing,
  providerCatalog: () => import_provider_catalog2.providerCatalog,
  providerRegistry: () => providerRegistry,
  providers: () => providers
});
module.exports = __toCommonJS(providers_exports);
var import_registry = require("./registry");
var import_gemini = require("./gemini");
var import_groq = require("./groq");
var import_cohere = require("./cohere");
var import_anthropic = require("./anthropic");
var import_openai = require("./openai");
var import_openrouter = require("./openrouter");
var import_mistral = require("./mistral");
var import_together = require("./together");
var import_deepseek = require("./deepseek");
var import_xai = require("./xai");
var import_huggingface = require("./huggingface");
var import_nvidia = require("./nvidia");
var import_fireworks = require("./fireworks");
var import_cerebras = require("./cerebras");
var import_sambanova = require("./sambanova");
var import_novita = require("./novita");
var import_local_llm = require("./local-llm");
var import_ollama = require("./ollama");
var import_provider_catalog2 = require("./provider-catalog");
var import_provider_catalog3 = require("./provider-catalog");
const providerRegistry = new import_registry.ProviderRegistry();
providerRegistry.register(new import_groq.GroqProvider(), 10);
providerRegistry.register(new import_gemini.GeminiProvider(), 20);
providerRegistry.register(import_openrouter.openRouterProvider, 30);
providerRegistry.register(import_openai.openAIProvider, 40);
providerRegistry.register(new import_anthropic.AnthropicProvider(), 50);
providerRegistry.register(import_mistral.mistralProvider, 60);
providerRegistry.register(new import_cohere.CohereProvider(), 70);
providerRegistry.register(import_together.togetherProvider, 80);
providerRegistry.register(import_deepseek.deepSeekProvider, 90);
providerRegistry.register(import_xai.xAIProvider, 100);
providerRegistry.register(import_huggingface.huggingFaceProvider, 110);
providerRegistry.register(import_nvidia.nvidiaProvider, 120);
providerRegistry.register(import_fireworks.fireworksProvider, 130);
providerRegistry.register(import_cerebras.cerebrasProvider, 140);
providerRegistry.register(import_sambanova.sambanovaProvider, 150);
providerRegistry.register(import_novita.novitaProvider, 160);
const ollama = new import_ollama.OllamaProvider();
if (ollama.isAvailable()) {
  providerRegistry.register(ollama, 190);
}
const localLLM = new import_local_llm.LocalLLMProvider();
if (localLLM.isAvailable()) {
  providerRegistry.register(localLLM, 200);
}
try {
  const { loadAllDynamicProviders } = require("./platform/provider-adapter");
  const dynamicProviders = loadAllDynamicProviders();
  for (const { provider, priority } of dynamicProviders) {
    providerRegistry.register(provider, priority);
  }
} catch {
}
const providers = providerRegistry.getAll();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getAllProviderNames,
  getProviderCatalogEntry,
  getProviderCount,
  getProvidersByCategory,
  getProvidersByPricing,
  providerCatalog,
  providerRegistry,
  providers
});
