import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const cerebrasProvider =
  new OpenAICompatibleProvider({
    name: "cerebras",
    apiKey: providerConfig.cerebras.apiKey,
    baseURL: "https://api.cerebras.ai/v1",
    defaultModel: providerConfig.cerebras.model,
  });
