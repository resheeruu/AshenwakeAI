import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const nvidiaProvider =
  new OpenAICompatibleProvider({
    name: "nvidia",
    apiKey: providerConfig.nvidia.apiKey,
    baseURL:
      "https://integrate.api.nvidia.com/v1",
    defaultModel:
      providerConfig.nvidia.model,
  });
