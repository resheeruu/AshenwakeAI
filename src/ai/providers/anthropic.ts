import { AIProvider, AIRequest, AIResponse } from "../types";
import { providerConfig } from "./config";
import { now, buildResponse } from "./http";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  isAvailable(): boolean {
    return Boolean(providerConfig.anthropic.apiKey);
  }

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {
    const started = now();
    const apiKey = providerConfig.anthropic.apiKey;

    if (!apiKey) {
      throw new Error(
        "Anthropic API key is missing."
      );
    }

    const model =
      request.model ||
      providerConfig.anthropic.model;

    const systemMessage = request.messages.find(
      (message) => message.role === "system"
    );

    const messages = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role:
          message.role === "assistant"
            ? "assistant"
            : "user",
        content: message.content,
      }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens ?? 1024,
      messages,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();

      throw new Error(
        `Anthropic HTTP ${response.status}: ${errorBody}`
      );
    }

    const data = await response.json();

    const text =
      data?.content
        ?.map((item: any) => item?.text)
        ?.filter(Boolean)
        ?.join("") || "";

    if (!text) {
      throw new Error(
        "Anthropic returned an empty response."
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
