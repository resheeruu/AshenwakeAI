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
  guildId?: string;
  userId?: string;
  channelId?: string;
  source?: string;
}

export interface AIResponse {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIProvider {
  readonly name: string;

  isAvailable(): boolean;

  generate(request: AIRequest): Promise<AIResponse>;
}
