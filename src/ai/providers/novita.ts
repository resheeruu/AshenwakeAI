import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const novitaProvider =
  new OpenAICompatibleProvider({
    name: "novita",
    apiKey: providerConfig.novita.apiKey,
    baseURL: "https://api.novita.ai/openai",
    defaultModel: providerConfig.novita.model,
  });
