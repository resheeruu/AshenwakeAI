export type ChatRole = "system" | "user" | "assistant";

export enum HealthState {
  NOT_CONFIGURED = "not_configured",
  CONFIGURED = "configured",
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  RATE_LIMITED = "rate_limited",
  AUTH_FAILED = "auth_failed",
  NO_CREDITS = "no_credits",
  TIMEOUT = "timeout",
  NETWORK_ERROR = "network_error",
  QUARANTINED = "quarantined",
  RECOVERING = "recovering",
}

export interface ModelHealthState {
  successes: number;
  failures: number;
  consecutiveFailures: number;
  lastError?: string;
  lastFailureAt: number;
  lastSuccessAt: number;
}

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
