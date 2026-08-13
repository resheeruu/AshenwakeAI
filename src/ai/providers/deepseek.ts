import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const deepSeekProvider =
  new OpenAICompatibleProvider({
    name: "deepseek",
    apiKey: providerConfig.deepseek.apiKey,
    baseURL: "https://api.deepseek.com",
    defaultModel: providerConfig.deepseek.model,
  });
