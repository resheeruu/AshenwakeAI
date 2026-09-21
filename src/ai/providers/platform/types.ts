export type ProviderType = "builtin" | "custom" | "local";
export type ProviderProtocol = "openai_compatible" | "anthropic" | "gemini" | "ollama";

export interface ProviderDefinition {
  id: string;
  name: string;
  displayName: string;
  providerType: ProviderType;
  protocol: ProviderProtocol;
  endpoint?: string;
  enabled: boolean;
  priority: number;
  defaultModel?: string;
  timeoutMs: number;
  retryMaxAttempts: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderCredential {
  providerId: string;
  credentialKey: string;
  credentialValue: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName?: string;
  contextLength?: number;
  capabilities: string[];
  enabled: boolean;
  priority: number;
  isDefault: boolean;
  createdAt: number;
}

export interface ProviderHealthSnapshot {
  available: boolean;
  successes: number;
  failures: number;
  averageLatencyMs: number;
  lastLatencyMs?: number;
  disabledUntil?: number;
  lastError?: string;
  healthState: string;
  lastSuccessAt?: number;
  lastFailureAt?: number;
}

export interface CreateProviderInput {
  name: string;
  displayName: string;
  providerType: ProviderType;
  protocol: ProviderProtocol;
  endpoint?: string;
  apiKey?: string;
  defaultModel?: string;
  priority?: number;
  timeoutMs?: number;
  retryMaxAttempts?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateProviderInput {
  displayName?: string;
  endpoint?: string;
  apiKey?: string;
  defaultModel?: string;
  enabled?: boolean;
  priority?: number;
  timeoutMs?: number;
  retryMaxAttempts?: number;
  metadata?: Record<string, unknown>;
  protocol?: ProviderProtocol;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  providerName: string;
  modelsDiscovered: number;
  modelIds: string[];
  error?: string;
}

export interface DiscoverModelsResult {
  success: boolean;
  models: Array<{
    modelId: string;
    displayName?: string;
    contextLength?: number;
    capabilities?: string[];
  }>;
  error?: string;
}

export interface ProviderStatusView {
  id: string;
  name: string;
  displayName: string;
  providerType: ProviderType;
  protocol: ProviderProtocol;
  endpointHostname?: string;
  enabled: boolean;
  priority: number;
  defaultModel?: string;
  modelCount: number;
  health: ProviderHealthSnapshot;
  createdAt: number;
  updatedAt: number;
}
