import { AIProvider, AIRequest, AIResponse } from "../types";
import { now, buildResponse } from "./http";
import { logger } from "../../logger";

/**
 * Optional local LLM provider using llama-server HTTP API.
 *
 * Requires:
 * - llama-server running on a local port (default: 8080)
 * - Set LOCAL_LLM_ENABLED=true and LOCAL_LLM_BASE_URL=http://127.0.0.1:8080
 *
 * This provider is intentionally low priority (200) so cloud providers
 * are tried first. It serves as a fallback when all cloud providers
 * are unavailable, or for users who want fully offline inference.
 *
 * Recommended models for limited RAM (<2GB free):
 * - SmolLM2 135M Q4_K_M (~85MB, ~250MB RAM)
 * - Qwen 2.5 0.5B Q4_K_M (~350MB, ~500MB RAM)
 */
export class LocalLLMProvider implements AIProvider {
  readonly name = "local-llm";

  private readonly baseURL: string;
  private readonly defaultModel: string;
  private available: boolean | null = null;

  constructor() {
    this.baseURL = process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:8080";
    this.defaultModel = process.env.LOCAL_LLM_MODEL || "local";
  }

  isAvailable(): boolean {
    if (this.available === null) {
      this.checkAvailability();
    }
    return this.available === true;
  }

  private checkAvailability(): void {
    if (process.env.LOCAL_LLM_ENABLED !== "true") {
      this.available = false;
      return;
    }

    fetch(`${this.baseURL}/v1/models`, { signal: AbortSignal.timeout(2000) })
      .then((r) => {
        this.available = r.ok;
        if (r.ok) {
          logger.info(`🏠 Local LLM available at ${this.baseURL}`);
        }
      })
      .catch(() => {
        this.available = false;
      });
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const started = now();
    const model = request.model || this.defaultModel;

    const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024,
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Local LLM HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("Local LLM returned an empty response.");
    }

    return buildResponse(text, this.name, model, started,
      data?.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined
    );
  }
}
