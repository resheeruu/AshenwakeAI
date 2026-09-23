import { AIProvider } from "../types";
import { ProviderRegistry } from "./registry";
import { providerCatalog } from "./provider-catalog";

import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { CohereProvider } from "./cohere";
import { AnthropicProvider } from "./anthropic";

import { openAIProvider } from "./openai";
import { openRouterProvider } from "./openrouter";
import { mistralProvider } from "./mistral";
import { togetherProvider } from "./together";
import { deepSeekProvider } from "./deepseek";
import { xAIProvider } from "./xai";
import { huggingFaceProvider } from "./huggingface";
import { nvidiaProvider } from "./nvidia";
import { fireworksProvider } from "./fireworks";
import { cerebrasProvider } from "./cerebras";
import { sambanovaProvider } from "./sambanova";
import { novitaProvider } from "./novita";
import { LocalLLMProvider } from "./local-llm";
import { OllamaProvider } from "./ollama";

export const providerRegistry =
  new ProviderRegistry();

providerRegistry.register(new GroqProvider(), 10);
providerRegistry.register(new GeminiProvider(), 20);
providerRegistry.register(openRouterProvider, 30);
providerRegistry.register(openAIProvider, 40);
providerRegistry.register(new AnthropicProvider(), 50);
providerRegistry.register(mistralProvider, 60);
providerRegistry.register(new CohereProvider(), 70);
providerRegistry.register(togetherProvider, 80);
providerRegistry.register(deepSeekProvider, 90);
providerRegistry.register(xAIProvider, 100);
providerRegistry.register(huggingFaceProvider, 110);
providerRegistry.register(nvidiaProvider, 120);
providerRegistry.register(fireworksProvider, 130);
providerRegistry.register(cerebrasProvider, 140);
providerRegistry.register(sambanovaProvider, 150);
providerRegistry.register(novitaProvider, 160);

// Ollama local provider
const ollama = new OllamaProvider();
if (ollama.isAvailable()) {
  providerRegistry.register(ollama, 190);
}

// Optional local LLM provider (disabled unless LOCAL_LLM_ENABLED=true)
const localLLM = new LocalLLMProvider();
if (localLLM.isAvailable()) {
  providerRegistry.register(localLLM, 200);
}

// Load dynamic providers from database (custom + local providers added via dashboard)
try {
  const { loadAllDynamicProviders } = require("./platform/provider-adapter");
  const dynamicProviders = loadAllDynamicProviders();
  for (const { provider, priority } of dynamicProviders) {
    providerRegistry.register(provider, priority);
  }
} catch {
  // Database not yet initialized or platform not available — skip dynamic providers
}

export const providers: AIProvider[] =
  providerRegistry.getAll();

export { providerCatalog } from "./provider-catalog";
export { getProviderCatalogEntry, getProvidersByPricing, getProvidersByCategory, getAllProviderNames, getProviderCount } from "./provider-catalog";
