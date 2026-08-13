import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const xAIProvider =
  new OpenAICompatibleProvider({
    name: "xai",
    apiKey: providerConfig.xai.apiKey,
    baseURL: "https://api.x.ai/v1",
    defaultModel: providerConfig.xai.model,
  });
