"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var provider_service_exports = {};
__export(provider_service_exports, {
  providerService: () => providerService
});
module.exports = __toCommonJS(provider_service_exports);
var import_provider_repo = require("./provider-repo");
var import_provider_runtime_manager = require("./provider-runtime-manager");
var import_credential_store = require("./credential-store");
var import_connection_tester = require("./connection-tester");
var import_provider_adapter = require("./provider-adapter");
var import__ = require("../index");
var import_logger = require("../../../logger");
var import_audit = require("../../../security/audit");
function toStatusView(def, models) {
  let endpointHostname;
  try {
    if (def.endpoint) endpointHostname = new URL(def.endpoint).hostname;
  } catch {
  }
  const runtime = import_provider_runtime_manager.providerRuntimeManager.getRuntime(def.id);
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
    models: models.map((m) => ({
      modelId: m.modelId,
      displayName: m.displayName,
      enabled: m.enabled,
      isDefault: m.isDefault,
      capabilities: m.capabilities,
      contextLength: m.contextLength,
      priority: m.priority
    })),
    health: {
      available: def.enabled,
      successes: runtime?.successes ?? 0,
      failures: runtime?.failures ?? 0,
      averageLatencyMs: runtime?.averageLatencyMs ?? 0,
      healthState,
      lastLatencyMs: runtime?.lastLatencyMs,
      lastSuccessAt: runtime?.lastSuccessAt,
      lastFailureAt: runtime?.lastFailureAt
    },
    createdAt: def.createdAt,
    updatedAt: def.updatedAt
  };
}
const providerService = {
  listProviders() {
    const defs = import_provider_repo.providerRepo.getAll();
    return defs.map((def) => {
      const models = import_provider_repo.providerRepo.getModels(def.id);
      return toStatusView(def, models);
    });
  },
  /** Authoritative model discovery source for dashboard/API consumers. */
  getAllDiscoveredModels() {
    const defs = import_provider_repo.providerRepo.getAll();
    const out = [];
    for (const def of defs) {
      for (const m of import_provider_repo.providerRepo.getModels(def.id)) {
        out.push({
          modelId: m.modelId,
          displayName: m.displayName,
          provider: def.name,
          providerId: def.id,
          enabled: m.enabled && def.enabled,
          capabilities: m.capabilities,
          contextLength: m.contextLength,
          isDefault: m.isDefault,
          priority: m.priority
        });
      }
    }
    return out;
  },
  getProvider(id) {
    const def = import_provider_repo.providerRepo.getById(id);
    if (!def) return void 0;
    const models = import_provider_repo.providerRepo.getModels(def.id);
    return toStatusView(def, models);
  },
  createProvider(input, actorUserId, actorUserName) {
    return import_provider_runtime_manager.providerRuntimeManager.createProvider(input, actorUserId, actorUserName);
  },
  async updateProvider(id, input, actorUserId, actorUserName) {
    await import_provider_runtime_manager.providerRuntimeManager.updateProvider(id, input, actorUserId, actorUserName);
  },
  async deleteProvider(id, actorUserId, actorUserName) {
    await import_provider_runtime_manager.providerRuntimeManager.deleteProvider(id, actorUserId, actorUserName);
  },
  async testConnection(id) {
    const def = import_provider_repo.providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");
    const apiKey = (0, import_credential_store.getCredential)(id, "api_key");
    return (0, import_connection_tester.testProviderConnection)(def.protocol, def.endpoint, apiKey, def.timeoutMs);
  },
  async testConnectionRaw(protocol, endpoint, apiKey, timeoutMs) {
    return (0, import_connection_tester.testProviderConnection)(protocol, endpoint, apiKey, timeoutMs).then((result) => {
      if (apiKey && result.success) {
        return { ...result, modelIds: result.modelIds, modelsDiscovered: result.modelsDiscovered };
      }
      return result;
    });
  },
  async discoverModelsForProvider(id) {
    const def = import_provider_repo.providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");
    const apiKey = (0, import_credential_store.getCredential)(def.id, "api_key");
    const result = await (0, import_connection_tester.discoverModels)(def.protocol, def.endpoint, apiKey, def.timeoutMs);
    if (result.success && result.models.length > 0) {
      import_provider_runtime_manager.providerRuntimeManager.refreshFromRepository();
    }
    if (result.success && result.models.length > 0) {
      import_provider_repo.providerRepo.deleteModels(def.id);
      for (const m of result.models) {
        import_provider_repo.providerRepo.upsertModel({
          providerId: def.id,
          modelId: m.modelId,
          displayName: m.displayName,
          contextLength: m.contextLength,
          capabilities: m.capabilities || [],
          enabled: true,
          priority: 100,
          isDefault: result.models.length === 1
        });
      }
      if (!def.defaultModel && result.models.length > 0) {
        import_provider_repo.providerRepo.update(id, { defaultModel: result.models[0].modelId });
      }
    }
    return result;
  },
  setDefaultModel(providerId, modelId, actorUserId, actorUserName) {
    const def = import_provider_repo.providerRepo.getById(providerId);
    if (!def) throw new Error("Provider not found");
    import_provider_repo.providerRepo.update(providerId, { defaultModel: modelId });
    const models = import_provider_repo.providerRepo.getModels(providerId);
    for (const m of models) {
      import_provider_repo.providerRepo.upsertModel({ ...m, isDefault: m.modelId === modelId });
    }
    (0, import_audit.recordAudit)({
      who: actorUserId,
      whoName: actorUserName,
      what: `Set default model for ${def.displayName}: ${modelId}`,
      where: "provider-platform",
      result: "success"
    });
  },
  async toggleProvider(id, enabled, actorUserId, actorUserName) {
    await import_provider_runtime_manager.providerRuntimeManager.toggleProvider(id, enabled, actorUserId, actorUserName);
  },
  syncDynamicProviders() {
    import_provider_runtime_manager.providerRuntimeManager.refreshFromRepository();
    const dynamicProviders = (0, import_provider_adapter.loadAllDynamicProviders)();
    for (const { provider, priority } of dynamicProviders) {
      if (!import__.providerRegistry.has(provider.name)) {
        import__.providerRegistry.register(provider, priority);
        import_logger.logger.info(`\u{1F504} Dynamic provider loaded: ${provider.name} (priority ${priority})`);
      }
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  providerService
});
