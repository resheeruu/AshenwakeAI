import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const mistralProvider =
  new OpenAICompatibleProvider({
    name: "mistral",
    apiKey: providerConfig.mistral.apiKey,
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: providerConfig.mistral.model,
  });
