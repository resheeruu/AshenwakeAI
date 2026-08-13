import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const openAIProvider =
  new OpenAICompatibleProvider({
    name: "openai",
    apiKey: providerConfig.openai.apiKey,
    baseURL: "https://api.openai.com/v1",
    defaultModel: providerConfig.openai.model,
  });
