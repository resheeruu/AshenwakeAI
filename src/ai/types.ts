export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AIRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface AIProvider {
  readonly name: string;

  isAvailable(): boolean;

  generate(request: AIRequest): Promise<AIResponse>;
}
