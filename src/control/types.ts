export interface SystemStatus {
  running: boolean;
  uptime: number;
  version: string;
  nodeVersion: string;
  platform: string;
  pid: number;
}

export interface ProviderInfo {
  name: string;
  available: boolean;
  successes: number;
  failures: number;
  averageLatencyMs: number;
  disabledUntil: number;
  disabledReason: string | null;
  lastError: string | null;
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  uptime: number;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
  };
  cpu: {
    model: string;
    cores: number;
  };
  disk: {
    dataDirExists: boolean;
    dataFileCount: number;
  };
}

export interface MemoryStats {
  conversations: number;
  messages: number;
  persistent: boolean;
}

export interface UsageSnapshot {
  global: {
    totalRequests: number;
    totalCredits: number;
    totalTokens: number;
    failures: number;
  };
  providers: Record<string, { requests: number; credits: number; latency: number }>;
}

export interface DiagnosticResult {
  overall: "healthy" | "degraded" | "unhealthy";
  score: number;
  checks: Array<{
    name: string;
    status: "pass" | "warn" | "fail";
    message: string;
    details?: string;
  }>;
  timestamp: number;
}

export interface LogSnapshot {
  entries: Array<{
    id: number;
    timestamp: string;
    level: string;
    message: string;
  }>;
  total: number;
}

export interface FeatureStatus {
  discord: boolean;
  web: boolean;
  agent: boolean;
  selfHealer: boolean;
  music: boolean;
  games: boolean;
  moderation: boolean;
  automod: boolean;
  tickets: boolean;
  community: boolean;
  vision: boolean;
  codingAgents: boolean;
}

export interface ActionResult {
  success: boolean;
  message: string;
  details?: string;
}

export type AdminAction =
  | "restart"
  | "stop"
  | "reload_config"
  | "clear_memory"
  | "reset_usage"
  | "run_diagnostics"
  | "backup"
  | "provider_disable"
  | "provider_enable";

export interface ActionRequest {
  action: AdminAction;
  target?: string;
  reason?: string;
  confirmed?: boolean;
}

export interface ActionConfirmation {
  required: boolean;
  action: AdminAction;
  riskLevel: "low" | "medium" | "high";
  message: string;
  target?: string;
}
