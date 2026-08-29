import { AIProvider, AIRequest, AIResponse } from "../types";
import { now, buildResponse } from "./http";

export interface OpenAICompatibleOptions {
  name: string;
  apiKey?: string;
  baseURL: string;
  defaultModel: string;
  extraHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;

  private readonly apiKey?: string;
  private readonly baseURL: string;
  private readonly defaultModel: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: OpenAICompatibleOptions) {
    this.name = options.name;
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL.replace(/\/$/, "");
    this.defaultModel = options.defaultModel;
    this.extraHeaders = options.extraHeaders ?? {};
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {
    const started = now();

    if (!this.apiKey) {
      throw new Error(`${this.name} API key is missing.`);
    }

    const model = request.model || this.defaultModel;

    const response = await fetch(
      `${this.baseURL}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...this.extraHeaders,
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
        `${this.name} HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const text =
      data?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error(
        `${this.name} returned an empty response.`
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
