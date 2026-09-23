import { providerRepo } from "./provider-repo";
import { providerRuntimeManager } from "./provider-runtime-manager";
import { storeCredential, getCredential, deleteAllCredentials } from "./credential-store";
import { testProviderConnection, discoverModels } from "./connection-tester";
import { createDynamicProvider, loadAllDynamicProviders } from "./provider-adapter";
import { providerRegistry } from "../index";
import type {
  ProviderDefinition,
  ProviderModel,
  ProviderStatusView,
  CreateProviderInput,
  UpdateProviderInput,
  TestConnectionResult,
  DiscoverModelsResult,
} from "./types";
import { logger } from "../../../logger";
import { recordAudit } from "../../../security/audit";
import { nanoid } from "nanoid";

function toStatusView(def: ProviderDefinition, models: ProviderModel[]): ProviderStatusView {
  let endpointHostname: string | undefined;
  try {
    if (def.endpoint) endpointHostname = new URL(def.endpoint).hostname;
  } catch { /* ignore */ }

  const runtime = providerRuntimeManager.getRuntime(def.id);
  const healthState = runtime?.healthState ?? (def.enabled ? "CONFIGURED" : "NOT_CONFIGURED");

  return {
    id: def.id,
    name: def.name,
    displayName: def.displayName,
    providerType: def.providerType,
    protocol: def.protocol,
    endpointHostname,
    enabled: def.enabled,
    priority: def.priority,
    defaultModel: def.defaultModel,
    modelCount: models.length,
    models: models.map(m => ({
      modelId: m.modelId,
      displayName: m.displayName,
      enabled: m.enabled,
      isDefault: m.isDefault,
      capabilities: m.capabilities,
      contextLength: m.contextLength,
      priority: m.priority,
    })),
    health: {
      available: def.enabled,
      successes: runtime?.successes ?? 0,
      failures: runtime?.failures ?? 0,
      averageLatencyMs: runtime?.averageLatencyMs ?? 0,
      healthState,
      lastLatencyMs: runtime?.lastLatencyMs,
      lastSuccessAt: runtime?.lastSuccessAt,
      lastFailureAt: runtime?.lastFailureAt,
    },
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

export const providerService = {
  listProviders(): ProviderStatusView[] {
    const defs = providerRepo.getAll();
    return defs.map(def => {
      const models = providerRepo.getModels(def.id);
      return toStatusView(def, models);
    });
  },

  /** Authoritative model discovery source for dashboard/API consumers. */
  getAllDiscoveredModels(): Array<{
    modelId: string;
    displayName?: string;
    provider: string;
    providerId: string;
    enabled: boolean;
    capabilities: string[];
    contextLength?: number;
    isDefault: boolean;
    priority: number;
  }> {
    const defs = providerRepo.getAll();
    const out: Array<{
      modelId: string;
      displayName?: string;
      provider: string;
      providerId: string;
      enabled: boolean;
      capabilities: string[];
      contextLength?: number;
      isDefault: boolean;
      priority: number;
    }> = [];
    for (const def of defs) {
      for (const m of providerRepo.getModels(def.id)) {
        out.push({
          modelId: m.modelId,
          displayName: m.displayName,
          provider: def.name,
          providerId: def.id,
          enabled: m.enabled && def.enabled,
          capabilities: m.capabilities,
          contextLength: m.contextLength,
          isDefault: m.isDefault,
          priority: m.priority,
        });
      }
    }
    return out;
  },

  getProvider(id: string): ProviderStatusView | undefined {
    const def = providerRepo.getById(id);
    if (!def) return undefined;
    const models = providerRepo.getModels(def.id);
    return toStatusView(def, models);
  },

  createProvider(input: CreateProviderInput, actorUserId: string, actorUserName: string): Promise<ProviderDefinition> {
    return providerRuntimeManager.createProvider(input, actorUserId, actorUserName);
  },

  async updateProvider(id: string, input: UpdateProviderInput, actorUserId: string, actorUserName: string): Promise<void> {
    await providerRuntimeManager.updateProvider(id, input, actorUserId, actorUserName);
  },

  async deleteProvider(id: string, actorUserId: string, actorUserName: string): Promise<void> {
    await providerRuntimeManager.deleteProvider(id, actorUserId, actorUserName);
  },

  async testConnection(id: string): Promise<TestConnectionResult> {
    const def = providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");

    const apiKey = getCredential(id, "api_key");
    return testProviderConnection(def.protocol, def.endpoint, apiKey, def.timeoutMs);
  },

  async testConnectionRaw(
    protocol: string,
    endpoint: string | undefined,
    apiKey: string | undefined,
    timeoutMs?: number,
  ): Promise<TestConnectionResult> {
    return testProviderConnection(protocol as any, endpoint, apiKey, timeoutMs).then(result => {
      if (apiKey && result.success) {
        return { ...result, modelIds: result.modelIds, modelsDiscovered: result.modelsDiscovered };
      }
      return result;
    });
  },

  async discoverModelsForProvider(id: string): Promise<DiscoverModelsResult> {
    const def = providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");

    const apiKey = getCredential(def.id, "api_key");
    const result = await discoverModels(def.protocol, def.endpoint, apiKey, def.timeoutMs);

    if (result.success && result.models.length > 0) {
      providerRuntimeManager.refreshFromRepository();
    }

    if (result.success && result.models.length > 0) {
      providerRepo.deleteModels(def.id);
      for (const m of result.models) {
        providerRepo.upsertModel({
          providerId: def.id,
          modelId: m.modelId,
          displayName: m.displayName,
          contextLength: m.contextLength,
          capabilities: m.capabilities || [],
          enabled: true,
          priority: 100,
          isDefault: result.models.length === 1,
        });
      }

      if (!def.defaultModel && result.models.length > 0) {
        providerRepo.update(id, { defaultModel: result.models[0].modelId });
      }
    }

    return result;
  },

  setDefaultModel(providerId: string, modelId: string, actorUserId: string, actorUserName: string): void {
    const def = providerRepo.getById(providerId);
    if (!def) throw new Error("Provider not found");

    providerRepo.update(providerId, { defaultModel: modelId });

    const models = providerRepo.getModels(providerId);
    for (const m of models) {
      providerRepo.upsertModel({ ...m, isDefault: m.modelId === modelId });
    }

    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Set default model for ${def.displayName}: ${modelId}`,
      where: "provider-platform",
      result: "success",
    });
  },

  async toggleProvider(id: string, enabled: boolean, actorUserId: string, actorUserName: string): Promise<void> {
    await providerRuntimeManager.toggleProvider(id, enabled, actorUserId, actorUserName);
  },

  syncDynamicProviders(): void {
    providerRuntimeManager.refreshFromRepository();
    const dynamicProviders = loadAllDynamicProviders();
    for (const { provider, priority } of dynamicProviders) {
      if (!providerRegistry.has(provider.name)) {
        providerRegistry.register(provider, priority);
        logger.info(`🔄 Dynamic provider loaded: ${provider.name} (priority ${priority})`);
      }
    }
  },
};
