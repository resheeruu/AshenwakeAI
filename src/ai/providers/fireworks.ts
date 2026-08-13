import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const fireworksProvider =
  new OpenAICompatibleProvider({
    name: "fireworks",
    apiKey: providerConfig.fireworks.apiKey,
    baseURL: "https://api.fireworks.ai/inference/v1",
    defaultModel: providerConfig.fireworks.model,
  });
