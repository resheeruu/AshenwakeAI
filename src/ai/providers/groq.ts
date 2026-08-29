import { AIProvider, AIRequest, AIResponse } from "../types";
import { providerConfig } from "./config";
import {
  now,
  buildResponse,
} from "./http";

export class GroqProvider implements AIProvider {
  readonly name = "groq";

  isAvailable(): boolean {
    return providerConfig.groq.enabled;
  }

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {
    const started = now();

    const apiKey = providerConfig.groq.apiKey;

    if (!apiKey) {
      throw new Error("Groq API key is missing.");
    }

    const model =
      request.model ||
      providerConfig.groq.model;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 1024,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Groq HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const text =
      data?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error(
        "Groq returned an empty response."
      );
    }

    return buildResponse(
      text,
      this.name,
      model,
      started
    );
  }
}
