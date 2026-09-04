import { AIProvider, AIRequest, AIResponse } from "../types";
import { providerConfig } from "./config";
import { now, buildResponse } from "./http";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  isAvailable(): boolean {
    return Boolean(providerConfig.gemini.apiKey);
  }

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {
    const started = now();
    const apiKey = providerConfig.gemini.apiKey;

    if (!apiKey) {
      throw new Error("Gemini API key is missing.");
    }

    const model =
      request.model || providerConfig.gemini.model;

    const contents = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role:
          message.role === "assistant"
            ? "model"
            : "user",
        parts: [
          {
            text: message.content,
          },
        ],
      }));

    const systemMessage = request.messages.find(
      (message) => message.role === "system"
    );

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 1024,
      },
    };

    if (systemMessage) {
      body.systemInstruction = {
        parts: [
          {
            text: systemMessage.content,
          },
        ],
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(body),
      }
    );

    const raw = await response.text();

    let data: any;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Gemini returned invalid JSON: ${raw.slice(0, 500)}`
      );
    }

    if (!response.ok) {
      throw new Error(
        `Gemini HTTP ${response.status}: ${
          data?.error?.message || "Unknown error"
        }`
      );
    }

    const candidates = data?.candidates;

    if (!Array.isArray(candidates) || candidates.length === 0) {
      const blockReason =
        data?.promptFeedback?.blockReason;

      const blockMessage =
        data?.promptFeedback?.blockReasonMessage;

      if (blockReason) {
        throw new Error(
          `Gemini returned no candidates. ` +
          `Block reason: ${blockReason}` +
          (blockMessage
            ? ` — ${blockMessage}`
            : "")
        );
      }

      throw new Error(
        `Gemini returned no candidates. ` +
        `Response: (details redacted)`
      );
    }

    const parts =
      candidates[0]?.content?.parts;

    const text = Array.isArray(parts)
      ? parts
          .map((part: any) => part?.text)
          .filter(
            (value: unknown): value is string =>
              typeof value === "string" &&
              value.length > 0
          )
          .join("")
          .trim()
      : "";

    if (!text) {
      const finishReason =
        candidates[0]?.finishReason || "unknown";

      throw new Error(
        `Gemini returned no text. ` +
        `Finish reason: ${finishReason}`
      );
    }

    return buildResponse(
      text,
      this.name,
      model,
      started,
      data?.usageMetadata ? {
        inputTokens: data.usageMetadata.promptTokenCount,
        outputTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined
    );
  }
}
