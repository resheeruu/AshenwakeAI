import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const sambanovaProvider =
  new OpenAICompatibleProvider({
    name: "sambanova",
    apiKey: providerConfig.sambanova.apiKey,
    baseURL: "https://api.sambanova.ai/v1",
    defaultModel: providerConfig.sambanova.model,
  });
