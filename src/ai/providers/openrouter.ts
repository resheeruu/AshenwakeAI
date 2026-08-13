import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const openRouterProvider =
  new OpenAICompatibleProvider({
    name: "openrouter",
    apiKey: providerConfig.openrouter.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: providerConfig.openrouter.model,
    extraHeaders: {
      "HTTP-Referer": "https://discord.com",
      "X-Title": "AshenAI",
    },
  });
