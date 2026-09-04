import { AIProvider, AIRequest, AIResponse } from "../types";
import { now, buildResponse } from "./http";

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";

  private readonly baseURL =
    process.env.OLLAMA_BASE_URL ||
    "http://127.0.0.1:11434";

  private readonly defaultModel =
    process.env.OLLAMA_MODEL ||
    "qwen2.5-coder:0.5b";

  private available: boolean | null = null;

  isAvailable(): boolean {
    if (this.available === null) {
      this.checkAvailability();
    }
    return this.available === true;
  }

  private checkAvailability(): void {
    fetch(`${this.baseURL}/api/tags`, { signal: AbortSignal.timeout(2000) })
      .then((r) => { this.available = r.ok; })
      .catch(() => { this.available = false; });
  }

  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    const started = now();

    const model =
      request.model || this.defaultModel;

    const response = await fetch(
      `${this.baseURL}/api/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model,
          messages: request.messages,
          stream: false,
          options: {
            temperature:
              request.temperature ?? 0.7,
            num_predict:
              request.maxTokens ?? 1024,
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Ollama HTTP ${response.status}`,
      );
    }

    const data = await response.json();

    const text = data?.message?.content;

    if (!text) {
      throw new Error(
        "Ollama returned an empty response.",
      );
    }

    return buildResponse(
      text,
      this.name,
      model,
      started,
      (data.prompt_eval_count != null || data.eval_count != null) ? {
        inputTokens: data.prompt_eval_count ?? undefined,
        outputTokens: data.eval_count ?? undefined,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0) || undefined,
      } : undefined
    );
  }
}
