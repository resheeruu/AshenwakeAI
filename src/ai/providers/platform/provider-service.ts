import { providerRepo } from "./provider-repo";
import { storeCredential, getCredential, deleteAllCredentials } from "./credential-store";
import { testProviderConnection, discoverModels } from "./connection-tester";
import { createDynamicProvider, loadAllDynamicProviders } from "./provider-adapter";
import { providerRegistry } from "../index";
import type {
  ProviderDefinition,
  ProviderStatusView,
  CreateProviderInput,
  UpdateProviderInput,
  TestConnectionResult,
  DiscoverModelsResult,
} from "./types";
import { logger } from "../../../logger";
import { recordAudit } from "../../../security/audit";
import { nanoid } from "nanoid";

function toStatusView(def: ProviderDefinition, modelCount: number): ProviderStatusView {
  let endpointHostname: string | undefined;
  try {
    if (def.endpoint) endpointHostname = new URL(def.endpoint).hostname;
  } catch { /* ignore */ }

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
    modelCount,
    health: {
      available: def.enabled,
      successes: 0,
      failures: 0,
      averageLatencyMs: 0,
      healthState: def.enabled ? "HEALTHY" : "NOT_CONFIGURED",
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
      return toStatusView(def, models.length);
    });
  },

  getProvider(id: string): ProviderStatusView | undefined {
    const def = providerRepo.getById(id);
    if (!def) return undefined;
    const models = providerRepo.getModels(def.id);
    return toStatusView(def, models.length);
  },

  createProvider(input: CreateProviderInput, actorUserId: string, actorUserName: string): ProviderDefinition {
    const id = `dp_${nanoid(12)}`;

    if (providerRepo.exists(input.name)) {
      throw new Error(`Provider name "${input.name}" is already taken`);
    }

    const def = providerRepo.create({
      id,
      name: input.name,
      displayName: input.displayName,
      providerType: input.providerType,
      protocol: input.protocol,
      endpoint: input.endpoint,
      enabled: true,
      priority: input.priority ?? 100,
      defaultModel: input.defaultModel,
      timeoutMs: input.timeoutMs ?? 15000,
      retryMaxAttempts: input.retryMaxAttempts ?? 2,
      metadata: input.metadata ?? {},
    });

    if (input.apiKey) {
      storeCredential(id, "api_key", input.apiKey);
    }

    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Created provider: ${input.displayName} (${input.name})`,
      where: "provider-platform",
      result: "success",
      details: `type=${input.providerType} protocol=${input.protocol}`,
    });

    logger.info(`➕ Provider created: ${input.displayName} (${id}) by ${actorUserName}`);
    return def;
  },

  updateProvider(id: string, input: UpdateProviderInput, actorUserId: string, actorUserName: string): void {
    const existing = providerRepo.getById(id);
    if (!existing) throw new Error("Provider not found");

    providerRepo.update(id, input);

    if (input.apiKey !== undefined) {
      storeCredential(id, "api_key", input.apiKey);
    }

    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Updated provider: ${existing.displayName}`,
      where: "provider-platform",
      result: "success",
    });

    logger.info(`✏️ Provider updated: ${existing.displayName} (${id}) by ${actorUserName}`);
  },

  deleteProvider(id: string, actorUserId: string, actorUserName: string): void {
    const existing = providerRepo.getById(id);
    if (!existing) throw new Error("Provider not found");

    deleteAllCredentials(id);
    providerRepo.deleteModels(id);
    providerRepo.delete(id);

    providerRegistry.unregister(existing.name);

    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `Deleted provider: ${existing.displayName} (${existing.name})`,
      where: "provider-platform",
      result: "success",
    });

    logger.info(`🗑️ Provider deleted: ${existing.displayName} (${id}) by ${actorUserName}`);
  },

  async testConnection(id: string): Promise<TestConnectionResult> {
    const def = providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");

    const apiKeyEncrypted = getCredential(id, "api_key");
    return testProviderConnection(def.protocol, def.endpoint, apiKeyEncrypted, def.timeoutMs);
  },

  async testConnectionRaw(
    protocol: string,
    endpoint: string | undefined,
    apiKey: string | undefined,
    timeoutMs?: number,
  ): Promise<TestConnectionResult> {
    const encrypted = apiKey ? undefined : undefined;
    return testProviderConnection(protocol as any, endpoint, undefined, timeoutMs).then(result => {
      if (apiKey && result.success) {
        return { ...result, modelIds: result.modelIds, modelsDiscovered: result.modelsDiscovered };
      }
      return result;
    });
  },

  async discoverModelsForProvider(id: string): Promise<DiscoverModelsResult> {
    const def = providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");

    const apiKeyEncrypted = getCredential(def.id, "api_key");
    const result = await discoverModels(def.protocol, def.endpoint, apiKeyEncrypted, def.timeoutMs);

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

  toggleProvider(id: string, enabled: boolean, actorUserId: string, actorUserName: string): void {
    const def = providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");

    providerRepo.update(id, { enabled });

    if (enabled) {
      const provider = createDynamicProvider({ ...def, enabled });
      providerRegistry.register(provider, def.priority);
    } else {
      providerRegistry.unregister(def.name);
    }

    recordAudit({
      who: actorUserId,
      whoName: actorUserName,
      what: `${enabled ? "Enabled" : "Disabled"} provider: ${def.displayName}`,
      where: "provider-platform",
      result: "success",
    });

    logger.info(`${enabled ? "✅" : "🚫"} Provider ${def.displayName} ${enabled ? "enabled" : "disabled"} by ${actorUserName}`);
  },

  syncDynamicProviders(): void {
    const dynamicProviders = loadAllDynamicProviders();
    for (const { provider, priority } of dynamicProviders) {
      if (!providerRegistry.has(provider.name)) {
        providerRegistry.register(provider, priority);
        logger.info(`🔄 Dynamic provider loaded: ${provider.name} (priority ${priority})`);
      }
    }
  },
};
