import { providerRepo } from "./provider-repo";
import { storeCredential, getCredential, deleteCredential, deleteAllCredentials } from "./credential-store";
import { providerRegistry } from "../index";
import type {
  ProviderDefinition,
  CreateProviderInput,
  UpdateProviderInput,
  TestConnectionResult,
  DiscoverModelsResult,
  ProviderStatusView,
} from "./types";
import { logger } from "../../../logger";
import { recordAudit } from "../../../security/audit";
import { nanoid } from "nanoid";
import { testProviderConnection, discoverModels, isSafeEndpoint } from "./connection-tester";
import { createDynamicProvider, loadAllDynamicProviders } from "./provider-adapter";

export type ProviderRuntimeState =
  | "idle"
  | "starting"
  | "running"
  | "quarantined"
  | "disabled";

export interface ProviderRuntime {
  definition: ProviderDefinition;
  credential: string | undefined;
  healthState:
    | "HEALTHY"
    | "CONFIGURED"
    | "DEGRADED"
    | "AUTH_FAILED"
    | "NOT_CONFIGURED"
    | "TIMEOUT"
    | "NETWORK_ERROR"
    | "QUARANTINED";
  state: ProviderRuntimeState;
  lastHealthCheck: number;
  lastSuccessAt: number;
  lastFailureAt: number;
  consecutiveFailures: number;
  cooldownUntil: number;
  disabledUntil: number;
  successes: number;
  failures: number;
  averageLatencyMs: number;
  lastLatencyMs: number | undefined;
}

function initialState(): ProviderRuntime {
  return {
    definition: {
      id: "",
      name: "",
      displayName: "",
      providerType: "custom" as const,
      protocol: "openai_compatible" as const,
      enabled: false,
      priority: 100,
      defaultModel: undefined,
      timeoutMs: 15000,
      retryMaxAttempts: 2,
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
    } as ProviderDefinition,
    credential: undefined,
    healthState: "NOT_CONFIGURED",
    state: "idle",
    lastHealthCheck: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    consecutiveFailures: 0,
    cooldownUntil: 0,
    disabledUntil: 0,
    successes: 0,
    failures: 0,
    averageLatencyMs: 0,
    lastLatencyMs: undefined,
  };
}

export class ProviderRuntimeManager {
  private runtimes = new Map<string, ProviderRuntime>();

  getRuntime(id: string): ProviderRuntime | undefined {
    return this.runtimes.get(id);
  }

  getAllRuntimes(): Map<string, ProviderRuntime> {
    return this.runtimes;
  }

  getHealthState(id: string): "HEALTHY" | "CONFIGURED" | "DEGRADED" | "AUTH_FAILED" | "NOT_CONFIGURED" | "TIMEOUT" | "NETWORK_ERROR" | "QUARANTINED" | undefined {
    const runtime = this.runtimes.get(id);
    return runtime ? runtime.healthState : undefined;
  }

  isProviderAvailable(id: string): boolean {
    const runtime = this.runtimes.get(id);
    return runtime ? runtime.state === "running" && runtime.healthState === "HEALTHY" : false;
  }

  // CREATE: validate → persist definition → persist credential → persist models → create runtime instance → register → verify → audit
  async createProvider(
    input: CreateProviderInput,
    actorUserId: string,
    actorUserName: string,
  ): Promise<ProviderDefinition> {
    // 1. Validate
    if (!input.name || !input.displayName || !input.protocol) {
      throw new Error("Missing required provider fields: name, displayName, protocol");
    }
    if (!["openai_compatible", "anthropic", "gemini", "ollama"].includes(input.protocol)) {
      throw new Error("Invalid protocol");
    }
    if (providerRepo.exists(input.name)) {
      throw new Error(`Provider name "${input.name}" is already taken`);
    }

    // 2. Persist definition - let repository handle createdAt/updatedAt
    const def = providerRepo.create({
      id: `dp_${nanoid(12)}`,
      name: input.name,
      displayName: input.displayName,
      providerType: input.providerType ?? "custom",
      protocol: input.protocol,
      endpoint: input.endpoint,
      enabled: false, // Start disabled until credential is set
      priority: input.priority ?? 100,
      defaultModel: input.defaultModel,
      timeoutMs: input.timeoutMs ?? 15000,
      retryMaxAttempts: input.retryMaxAttempts ?? 2,
      metadata: input.metadata ?? {},
    } as const);

    // 3. Persist credential if API key provided
    if (input.apiKey) {
      storeCredential(def.id, "api_key", input.apiKey);
    }

    // 4. Initialize runtime state from the persisted definition
    const runtime = initialState();
    runtime.definition = def;
    runtime.credential = input.apiKey ? await getCredential(def.id, "api_key") : undefined;
    runtime.state = "idle";
    this.runtimes.set(def.id, runtime);

    // 5. Verify: test connection with provided credential
    try {
      await this.verifyProvider(def.id);
    } catch {
      // Verification failure does not block creation, but marks as unconfigured
    }

    // 6. Audit
    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Created provider: ${input.displayName} (${input.name})`,
      where: "provider-platform",
      result: "success",
      details: `type=${input.providerType} protocol=${input.protocol}`,
    });

    logger.info(`➕ Provider created: ${input.displayName} (${def.id}) by ${actorUserName}`);
    return def;
  }

  // UPDATE: validate → persist → invalidate old runtime → rebuild runtime instance → replace registry entry → refresh router → audit
  async updateProvider(
    id: string,
    input: UpdateProviderInput,
    actorUserId: string,
    actorUserName: string,
  ): Promise<void> {
    const existing = providerRepo.getById(id);
    if (!existing) throw new Error("Provider not found");

    // 1. Validate protocol if provided
    if (input.protocol && !["openai_compatible", "anthropic", "gemini", "ollama"].includes(input.protocol)) {
      throw new Error("Invalid protocol");
    }

    // 2. Persist definition updates - let repository own updatedAt
    const updates: Record<string, unknown> = {};
    if (input.displayName !== undefined) updates.displayName = input.displayName;
    if (input.endpoint !== undefined) updates.endpoint = input.endpoint;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.defaultModel !== undefined) updates.defaultModel = input.defaultModel;
    if (input.timeoutMs !== undefined) updates.timeoutMs = input.timeoutMs;
    if (input.retryMaxAttempts !== undefined) updates.retryMaxAttempts = input.retryMaxAttempts;
    if (input.metadata !== undefined) updates.metadata = input.metadata;

    providerRepo.update(id, updates);

    // 3. If apiKey was provided, update the credential
    if (input.apiKey !== undefined) {
      storeCredential(id, "api_key", input.apiKey);
      // Reset runtime credential and health state
      const runtime = this.runtimes.get(id);
      if (runtime) {
        runtime.credential = undefined;
        runtime.healthState = "CONFIGURED";
        runtime.state = "idle";
        runtime.successes = 0;
        runtime.failures = 0;
        runtime.averageLatencyMs = 0;
        runtime.lastLatencyMs = undefined;
      }
    }

    // 4. If enabled state changed, rebuild runtime
    const runtime = this.runtimes.get(id);
    if (runtime && input.enabled !== undefined) {
      if (input.enabled) {
        await this.enableProvider(id, actorUserId, actorUserName);
      } else {
        await this.disableProvider(id, actorUserId, actorUserName);
      }
    }

    // 5. Audit
    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Updated provider: ${existing.displayName}`,
      where: "provider-platform",
      result: "success",
    });

    logger.info(`✏️ Provider updated: ${existing.displayName} (${id}) by ${actorUserName}`);
  }

  // CREDENTIAL UPDATE: encrypt → persist → invalidate old provider → reload credential → rebuild runtime provider → verify
  async updateCredential(id: string, apiKey: string): Promise<void> {
    // 1. Encrypt and persist
    storeCredential(id, "api_key", apiKey);

    // 2. Invalidate old runtime credential and reload
    const runtime = this.runtimes.get(id);
    if (runtime) {
      runtime.credential = undefined;
      runtime.healthState = "CONFIGURED";
      runtime.state = "idle";
      runtime.successes = 0;
      runtime.failures = 0;
      runtime.averageLatencyMs = 0;
      runtime.lastLatencyMs = undefined;
    }

    // 3. Rebuild runtime provider with new credential
    await this.verifyProvider(id);
  }

  // ENABLE: persist enabled=true → create/reload runtime provider → register → verify
  async enableProvider(
    id: string,
    actorUserId: string,
    actorUserName: string,
  ): Promise<void> {
    const def = providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");

    // Update repo enabled state (repository handles updatedAt)
    providerRepo.update(id, { enabled: true });

    // Create runtime provider instance
    const provider = createDynamicProvider({ ...def, enabled: true });

    // Register in registry
    providerRegistry.register(provider, def.priority);

    // Test connection and update health
    await this.verifyProvider(id);

    // Audit
    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Enabled provider: ${def.displayName}`,
      where: "provider-platform",
      result: "success",
    });

    logger.info(`✅ Provider enabled: ${def.displayName} (${id}) by ${actorUserName}`);
  }

  // DISABLE: persist enabled=false → unregister runtime provider → invalidate runtime instance → verify
  async disableProvider(
    id: string,
    actorUserId: string,
    actorUserName: string,
  ): Promise<void> {
    const def = providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");

    // Unregister from registry
    providerRegistry.unregister(def.name);

    // Update repo enabled state (repository handles updatedAt)
    providerRepo.update(id, { enabled: false });

    // Invalidate runtime instance
    const runtime = this.runtimes.get(id);
    if (runtime) {
      runtime.state = "disabled";
      runtime.healthState = "NOT_CONFIGURED";
      runtime.credential = undefined;
      runtime.successes = 0;
      runtime.failures = 0;
      runtime.averageLatencyMs = 0;
      runtime.lastLatencyMs = undefined;
    }

    // Audit
    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Disabled provider: ${def.displayName}`,
      where: "provider-platform",
      result: "success",
    });

    logger.info(`🚫 Provider disabled: ${def.displayName} (${id}) by ${actorUserName}`);
  }

  // TOGGLE: enable or disable a provider by name
  async toggleProvider(
    id: string,
    enabled: boolean,
    actorUserId: string,
    actorUserName: string,
  ): Promise<void> {
    const def = providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");

    if (enabled) {
      await this.enableProvider(id, actorUserId, actorUserName);
    } else {
      await this.disableProvider(id, actorUserId, actorUserName);
    }
  }

  // DELETE: disable → unregister → destroy runtime → delete models → delete credentials → delete definition → audit
  async deleteProvider(id: string, actorUserId: string, actorUserName: string): Promise<void> {
    const existing = providerRepo.getById(id);
    if (!existing) throw new Error("Provider not found");

    // 1. Disable first
    await this.disableProvider(id, actorUserId, actorUserName);

    // 2. Delete models
    providerRepo.deleteModels(id);

    // 3. Delete credentials
    deleteAllCredentials(id);

    // 4. Remove from runtimes
    this.runtimes.delete(id);

    // 5. Audit
    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Deleted provider: ${existing.displayName} (${existing.name})`,
      where: "provider-platform",
      result: "success",
    });

    logger.info(`🗑️ Provider deleted: ${existing.displayName} (${id}) by ${actorUserName}`);
  }

  // Verify: test connection and update health state
  async verifyProvider(id: string): Promise<{ success: boolean; healthState: string }> {
    const def = providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");

    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error("Runtime not initialized");

    const apiKey = getCredential(id, "api_key");
    const result = await testProviderConnection(def.protocol, def.endpoint, apiKey, def.timeoutMs);

    // Update runtime health state based on result
    if (result.success) {
      runtime.healthState = "HEALTHY";
      runtime.lastSuccessAt = Date.now();
      runtime.consecutiveFailures = 0;
      runtime.cooldownUntil = 0;
      runtime.disabledUntil = 0;
      runtime.successes++;
      runtime.averageLatencyMs = runtime.averageLatencyMs
        ? (runtime.averageLatencyMs + result.latencyMs) / 2
        : result.latencyMs;
      runtime.lastLatencyMs = result.latencyMs;
    } else {
      runtime.healthState = "DEGRADED";
      runtime.consecutiveFailures++;
      runtime.lastFailureAt = Date.now();
      // Set cooldown based on failure type
      runtime.cooldownUntil = Date.now() + 30000; // 30s cooldown
      runtime.failures++;
    }

    runtime.lastHealthCheck = Date.now();
    // Preserve successes/failures counts
    this.runtimes.set(id, runtime);

    return { success: result.success, healthState: runtime.healthState };
  }

  // Refresh all runtimes from repository
  refreshFromRepository(): void {
    const defs = providerRepo.getAll();
    for (const def of defs) {
      if (!this.runtimes.has(def.id)) {
        const runtime = initialState();
        runtime.definition = def;
        runtime.credential = getCredential(def.id, "api_key") || undefined;
        runtime.state = "idle";
        this.runtimes.set(def.id, runtime);
      } else {
        // Update existing runtime's definition to match repo (includes timestamps from repo)
        const runtime = this.runtimes.get(def.id)!;
        runtime.definition = def;
        this.runtimes.set(def.id, runtime);
      }
    }
    // Clean up runtimes for deleted providers
    for (const [id] of this.runtimes) {
      if (!providerRepo.getById(id)) {
        this.runtimes.delete(id);
      }
    }
  }
}

// Export singleton instance - the provider-service imports this
export const providerRuntimeManager = new ProviderRuntimeManager();