import { AIProvider, AIRequest, AIResponse } from "../types";
import { providerConfig } from "./config";
import { now, buildResponse } from "./http";

export class CohereProvider implements AIProvider {
  readonly name = "cohere";

  isAvailable(): boolean {
    return Boolean(providerConfig.cohere.apiKey);
  }

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {
    const started = now();
    const apiKey = providerConfig.cohere.apiKey;

    if (!apiKey) {
      throw new Error("Cohere API key is missing.");
    }

    const model =
      request.model || providerConfig.cohere.model;

    const response = await fetch(
      "https://api.cohere.com/v2/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 1024,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Cohere HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const text =
      data?.message?.content
        ?.map((item: any) => item?.text)
        ?.filter(Boolean)
        ?.join("\n") || "";

    if (!text) {
      throw new Error(
        "Cohere returned an empty response."
      );
    }

    return buildResponse(
      text,
      this.name,
      model,
      started,
      data?.usage?.tokens ? {
        inputTokens: data.usage.tokens.input_tokens,
        outputTokens: data.usage.tokens.output_tokens,
        totalTokens: (data.usage.tokens.input_tokens ?? 0) + (data.usage.tokens.output_tokens ?? 0),
      } : undefined
    );
  }
}
