import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const togetherProvider =
  new OpenAICompatibleProvider({
    name: "together",
    apiKey: providerConfig.together.apiKey,
    baseURL: "https://api.together.xyz/v1",
    defaultModel: providerConfig.together.model,
  });
