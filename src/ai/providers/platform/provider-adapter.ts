import type { AIProvider, AIRequest, AIResponse } from "../../types";
import type { ProviderDefinition, ProviderProtocol } from "./types";
import { getCredential } from "./credential-store";
import { providerRepo } from "./provider-repo";
import { logger } from "../../../logger";

class DynamicOpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  private def: ProviderDefinition;
  private apiKey: string | undefined;

  constructor(def: ProviderDefinition) {
    this.name = def.name;
    this.def = def;
    this.apiKey = getCredential(def.id, "api_key");
  }

  isAvailable(): boolean {
    return this.def.enabled && Boolean(this.apiKey);
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) throw new Error(`${this.name} API key is missing`);
    const model = request.model || this.def.defaultModel || "gpt-4o-mini";
    const endpoint = this.def.endpoint?.replace(/\/$/, "") || "https://api.openai.com/v1";
    const started = Date.now();

    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(this.def.timeoutMs),
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024,
      }),
    });

    if (!response.ok) throw new Error(`${this.name} HTTP ${response.status}`);
    const data = await response.json() as any;
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${this.name} returned empty response`);

    return {
      text,
      provider: this.name,
      model,
      latencyMs: Date.now() - started,
      inputTokens: data?.usage?.prompt_tokens,
      outputTokens: data?.usage?.completion_tokens,
      totalTokens: data?.usage?.total_tokens,
    };
  }
}

class DynamicAnthropicProvider implements AIProvider {
  readonly name: string;
  private def: ProviderDefinition;
  private apiKey: string | undefined;

  constructor(def: ProviderDefinition) {
    this.name = def.name;
    this.def = def;
    this.apiKey = getCredential(def.id, "api_key");
  }

  isAvailable(): boolean {
    return this.def.enabled && Boolean(this.apiKey);
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) throw new Error(`${this.name} API key is missing`);
    const model = request.model || this.def.defaultModel || "claude-3-5-haiku-latest";
    const endpoint = this.def.endpoint?.replace(/\/$/, "") || "https://api.anthropic.com";
    const started = Date.now();

    const systemMsg = request.messages.find(m => m.role === "system");
    const nonSystemMsgs = request.messages.filter(m => m.role !== "system");

    const response = await fetch(`${endpoint}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(this.def.timeoutMs),
      body: JSON.stringify({
        model,
        system: systemMsg?.content || "You are a helpful assistant.",
        messages: nonSystemMsgs.map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
      }),
    });

    if (!response.ok) throw new Error(`${this.name} HTTP ${response.status}`);
    const data = await response.json() as any;
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error(`${this.name} returned empty response`);

    return {
      text,
      provider: this.name,
      model,
      latencyMs: Date.now() - started,
      inputTokens: data?.usage?.input_tokens,
      outputTokens: data?.usage?.output_tokens,
      totalTokens: (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0),
    };
  }
}

class DynamicGeminiProvider implements AIProvider {
  readonly name: string;
  private def: ProviderDefinition;
  private apiKey: string | undefined;

  constructor(def: ProviderDefinition) {
    this.name = def.name;
    this.def = def;
    this.apiKey = getCredential(def.id, "api_key");
  }

  isAvailable(): boolean {
    return this.def.enabled && Boolean(this.apiKey);
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) throw new Error(`${this.name} API key is missing`);
    const model = request.model || this.def.defaultModel || "gemini-3.6-flash";
    const endpoint = this.def.endpoint?.replace(/\/$/, "") || "https://generativelanguage.googleapis.com";
    const started = Date.now();

    const contents = request.messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemMsg = request.messages.find(m => m.role === "system");

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 1024,
      },
    };
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const response = await fetch(
      `${endpoint}/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(this.def.timeoutMs),
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) throw new Error(`${this.name} HTTP ${response.status}`);
    const data = await response.json() as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`${this.name} returned empty response`);

    return {
      text,
      provider: this.name,
      model,
      latencyMs: Date.now() - started,
      inputTokens: data?.usageMetadata?.promptTokenCount,
      outputTokens: data?.usageMetadata?.candidatesTokenCount,
      totalTokens: data?.usageMetadata?.totalTokenCount,
    };
  }
}

class DynamicOllamaProvider implements AIProvider {
  readonly name: string;
  private def: ProviderDefinition;

  constructor(def: ProviderDefinition) {
    this.name = def.name;
    this.def = def;
  }

  isAvailable(): boolean {
    return this.def.enabled;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const model = request.model || this.def.defaultModel || "llama3.2";
    const endpoint = this.def.endpoint?.replace(/\/$/, "") || "http://localhost:11434";
    const started = Date.now();

    const response = await fetch(`${endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(this.def.timeoutMs),
      body: JSON.stringify({
        model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) throw new Error(`${this.name} HTTP ${response.status}`);
    const data = await response.json() as any;
    const text = data?.message?.content;
    if (!text) throw new Error(`${this.name} returned empty response`);

    return {
      text,
      provider: this.name,
      model,
      latencyMs: Date.now() - started,
      inputTokens: data?.prompt_eval_count,
      outputTokens: data?.eval_count,
      totalTokens: (data?.prompt_eval_count || 0) + (data?.eval_count || 0),
    };
  }
}

export function createDynamicProvider(def: ProviderDefinition): AIProvider {
  switch (def.protocol) {
    case "anthropic":
      return new DynamicAnthropicProvider(def);
    case "gemini":
      return new DynamicGeminiProvider(def);
    case "ollama":
      return new DynamicOllamaProvider(def);
    case "openai_compatible":
    default:
      return new DynamicOpenAICompatibleProvider(def);
  }
}

export function loadAllDynamicProviders(): Array<{ provider: AIProvider; priority: number }> {
  const defs = providerRepo.getEnabled();
  return defs.map(def => ({
    provider: createDynamicProvider(def),
    priority: def.priority,
  }));
}
