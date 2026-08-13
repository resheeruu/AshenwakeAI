import { OpenAICompatibleProvider } from "./openai-compatible";
import { providerConfig } from "./config";

export const huggingFaceProvider =
  new OpenAICompatibleProvider({
    name: "huggingface",
    apiKey: providerConfig.huggingface.apiKey,
    baseURL: "https://router.huggingface.co/v1",
    defaultModel: providerConfig.huggingface.model,
  });
