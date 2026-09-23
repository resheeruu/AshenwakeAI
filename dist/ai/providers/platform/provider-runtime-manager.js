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
var provider_runtime_manager_exports = {};
__export(provider_runtime_manager_exports, {
  ProviderRuntimeManager: () => ProviderRuntimeManager,
  canTransitionState: () => canTransitionState,
  providerRuntimeManager: () => providerRuntimeManager
});
module.exports = __toCommonJS(provider_runtime_manager_exports);
var import_provider_repo = require("./provider-repo");
var import_credential_store = require("./credential-store");
var import__ = require("../index");
var import_logger = require("../../../logger");
var import_audit = require("../../../security/audit");
var import_nanoid = require("nanoid");
var import_connection_tester = require("./connection-tester");
var import_provider_adapter = require("./provider-adapter");
const VALID_STATE_TRANSITIONS = {
  idle: ["starting", "disabled"],
  starting: ["running", "quarantined", "idle", "disabled"],
  running: ["starting", "quarantined", "disabled"],
  quarantined: ["starting", "disabled", "idle"],
  disabled: ["starting", "idle"]
};
function canTransitionState(from, to) {
  if (from === to) return true;
  return (VALID_STATE_TRANSITIONS[from] ?? []).includes(to);
}
const QUARANTINE_FAILURE_THRESHOLD = 5;
function initialState() {
  return {
    definition: {
      id: "",
      name: "",
      displayName: "",
      providerType: "custom",
      protocol: "openai_compatible",
      enabled: false,
      priority: 100,
      defaultModel: void 0,
      timeoutMs: 15e3,
      retryMaxAttempts: 2,
      metadata: {},
      createdAt: 0,
      updatedAt: 0
    },
    credential: void 0,
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
    lastLatencyMs: void 0
  };
}
class ProviderRuntimeManager {
  runtimes = /* @__PURE__ */ new Map();
  transitionState(runtime, next) {
    if (!canTransitionState(runtime.state, next)) {
      import_logger.logger.warn(
        `\u26A0\uFE0F Invalid provider runtime transition: ${runtime.state} \u2192 ${next} (${runtime.definition.id})`
      );
      return false;
    }
    runtime.state = next;
    return true;
  }
  getRuntime(id) {
    return this.runtimes.get(id);
  }
  getAllRuntimes() {
    return this.runtimes;
  }
  getHealthState(id) {
    const runtime = this.runtimes.get(id);
    return runtime ? runtime.healthState : void 0;
  }
  isProviderAvailable(id) {
    const runtime = this.runtimes.get(id);
    return runtime ? runtime.state === "running" && runtime.healthState === "HEALTHY" : false;
  }
  // CREATE: validate → persist definition → persist credential → persist models → create runtime instance → register → verify → audit
  async createProvider(input, actorUserId, actorUserName) {
    if (!input.name || !input.displayName || !input.protocol) {
      throw new Error("Missing required provider fields: name, displayName, protocol");
    }
    if (!["openai_compatible", "anthropic", "gemini", "ollama"].includes(input.protocol)) {
      throw new Error("Invalid protocol");
    }
    if (import_provider_repo.providerRepo.exists(input.name)) {
      throw new Error(`Provider name "${input.name}" is already taken`);
    }
    const def = import_provider_repo.providerRepo.create({
      id: `dp_${(0, import_nanoid.nanoid)(12)}`,
      name: input.name,
      displayName: input.displayName,
      providerType: input.providerType ?? "custom",
      protocol: input.protocol,
      endpoint: input.endpoint,
      enabled: false,
      // Start disabled until credential is set
      priority: input.priority ?? 100,
      defaultModel: input.defaultModel,
      timeoutMs: input.timeoutMs ?? 15e3,
      retryMaxAttempts: input.retryMaxAttempts ?? 2,
      metadata: input.metadata ?? {}
    });
    if (input.apiKey) {
      (0, import_credential_store.storeCredential)(def.id, "api_key", input.apiKey);
    }
    const runtime = initialState();
    runtime.definition = def;
    runtime.credential = input.apiKey ? await (0, import_credential_store.getCredential)(def.id, "api_key") : void 0;
    runtime.state = "idle";
    this.runtimes.set(def.id, runtime);
    try {
      this.transitionState(runtime, "starting");
      await this.verifyProvider(def.id);
      const after = this.runtimes.get(def.id);
      if (after && after.state === "starting") {
        this.transitionState(after, after.healthState === "HEALTHY" ? "running" : "quarantined");
      }
    } catch {
      const after = this.runtimes.get(def.id);
      if (after && after.state === "starting") {
        this.transitionState(after, "quarantined");
      }
    }
    (0, import_audit.recordAudit)({
      who: actorUserId,
      whoName: actorUserName,
      what: `Created provider: ${input.displayName} (${input.name})`,
      where: "provider-platform",
      result: "success",
      details: `type=${input.providerType} protocol=${input.protocol}`
    });
    import_logger.logger.info(`\u2795 Provider created: ${input.displayName} (${def.id}) by ${actorUserName}`);
    return def;
  }
  // UPDATE: validate → persist → invalidate old runtime → rebuild runtime instance → replace registry entry → refresh router → audit
  async updateProvider(id, input, actorUserId, actorUserName) {
    const existing = import_provider_repo.providerRepo.getById(id);
    if (!existing) throw new Error("Provider not found");
    if (input.protocol && !["openai_compatible", "anthropic", "gemini", "ollama"].includes(input.protocol)) {
      throw new Error("Invalid protocol");
    }
    const updates = {};
    if (input.displayName !== void 0) updates.displayName = input.displayName;
    if (input.endpoint !== void 0) updates.endpoint = input.endpoint;
    if (input.enabled !== void 0) updates.enabled = input.enabled;
    if (input.priority !== void 0) updates.priority = input.priority;
    if (input.defaultModel !== void 0) updates.defaultModel = input.defaultModel;
    if (input.timeoutMs !== void 0) updates.timeoutMs = input.timeoutMs;
    if (input.retryMaxAttempts !== void 0) updates.retryMaxAttempts = input.retryMaxAttempts;
    if (input.metadata !== void 0) updates.metadata = input.metadata;
    import_provider_repo.providerRepo.update(id, updates);
    if (input.apiKey !== void 0) {
      (0, import_credential_store.storeCredential)(id, "api_key", input.apiKey);
      const runtime2 = this.runtimes.get(id);
      if (runtime2) {
        runtime2.credential = void 0;
        runtime2.healthState = "CONFIGURED";
        runtime2.state = "idle";
        runtime2.successes = 0;
        runtime2.failures = 0;
        runtime2.averageLatencyMs = 0;
        runtime2.lastLatencyMs = void 0;
      }
    }
    const runtime = this.runtimes.get(id);
    if (runtime && input.enabled !== void 0) {
      if (input.enabled) {
        await this.enableProvider(id, actorUserId, actorUserName);
      } else {
        await this.disableProvider(id, actorUserId, actorUserName);
      }
    }
    (0, import_audit.recordAudit)({
      who: actorUserId,
      whoName: actorUserName,
      what: `Updated provider: ${existing.displayName}`,
      where: "provider-platform",
      result: "success"
    });
    import_logger.logger.info(`\u270F\uFE0F Provider updated: ${existing.displayName} (${id}) by ${actorUserName}`);
  }
  // CREDENTIAL UPDATE: encrypt → persist → invalidate old provider → reload credential → rebuild runtime provider → verify
  async updateCredential(id, apiKey) {
    (0, import_credential_store.storeCredential)(id, "api_key", apiKey);
    const runtime = this.runtimes.get(id);
    if (runtime) {
      runtime.credential = void 0;
      runtime.healthState = "CONFIGURED";
      runtime.state = "idle";
      runtime.successes = 0;
      runtime.failures = 0;
      runtime.averageLatencyMs = 0;
      runtime.lastLatencyMs = void 0;
    }
    await this.verifyProvider(id);
  }
  // ENABLE: persist enabled=true → create/reload runtime provider → register → verify
  async enableProvider(id, actorUserId, actorUserName) {
    const def = import_provider_repo.providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");
    import_provider_repo.providerRepo.update(id, { enabled: true });
    const existingRuntime = this.runtimes.get(id);
    if (existingRuntime) {
      if (existingRuntime.state !== "starting") {
        if (!canTransitionState(existingRuntime.state, "starting")) {
          existingRuntime.state = "idle";
        }
        this.transitionState(existingRuntime, "starting");
      }
    }
    const provider = (0, import_provider_adapter.createDynamicProvider)({ ...def, enabled: true });
    import__.providerRegistry.register(provider, def.priority);
    await this.verifyProvider(id);
    const runtime = this.runtimes.get(id);
    if (runtime && runtime.state === "starting") {
      this.transitionState(runtime, runtime.healthState === "HEALTHY" ? "running" : "quarantined");
    } else if (runtime && runtime.state === "quarantined" && runtime.healthState === "HEALTHY") {
      this.transitionState(runtime, "running");
    }
    (0, import_audit.recordAudit)({
      who: actorUserId,
      whoName: actorUserName,
      what: `Enabled provider: ${def.displayName}`,
      where: "provider-platform",
      result: "success"
    });
    import_logger.logger.info(`\u2705 Provider enabled: ${def.displayName} (${id}) by ${actorUserName}`);
  }
  // DISABLE: persist enabled=false → unregister runtime provider → invalidate runtime instance → verify
  async disableProvider(id, actorUserId, actorUserName) {
    const def = import_provider_repo.providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");
    import__.providerRegistry.unregister(def.name);
    import_provider_repo.providerRepo.update(id, { enabled: false });
    const runtime = this.runtimes.get(id);
    if (runtime) {
      if (!canTransitionState(runtime.state, "disabled")) {
        runtime.state = "running";
      }
      this.transitionState(runtime, "disabled");
      runtime.healthState = "NOT_CONFIGURED";
      runtime.credential = void 0;
      runtime.successes = 0;
      runtime.failures = 0;
      runtime.averageLatencyMs = 0;
      runtime.lastLatencyMs = void 0;
    }
    (0, import_audit.recordAudit)({
      who: actorUserId,
      whoName: actorUserName,
      what: `Disabled provider: ${def.displayName}`,
      where: "provider-platform",
      result: "success"
    });
    import_logger.logger.info(`\u{1F6AB} Provider disabled: ${def.displayName} (${id}) by ${actorUserName}`);
  }
  // TOGGLE: enable or disable a provider by name
  async toggleProvider(id, enabled, actorUserId, actorUserName) {
    const def = import_provider_repo.providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");
    if (enabled) {
      await this.enableProvider(id, actorUserId, actorUserName);
    } else {
      await this.disableProvider(id, actorUserId, actorUserName);
    }
  }
  // DELETE: disable → unregister → destroy runtime → delete models → delete credentials → delete definition → audit
  async deleteProvider(id, actorUserId, actorUserName) {
    const existing = import_provider_repo.providerRepo.getById(id);
    if (!existing) throw new Error("Provider not found");
    await this.disableProvider(id, actorUserId, actorUserName);
    import_provider_repo.providerRepo.deleteModels(id);
    (0, import_credential_store.deleteAllCredentials)(id);
    this.runtimes.delete(id);
    (0, import_audit.recordAudit)({
      who: actorUserId,
      whoName: actorUserName,
      what: `Deleted provider: ${existing.displayName} (${existing.name})`,
      where: "provider-platform",
      result: "success"
    });
    import_logger.logger.info(`\u{1F5D1}\uFE0F Provider deleted: ${existing.displayName} (${id}) by ${actorUserName}`);
  }
  // Verify: test connection and update health state
  async verifyProvider(id) {
    const def = import_provider_repo.providerRepo.getById(id);
    if (!def) throw new Error("Provider not found");
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error("Runtime not initialized");
    const apiKey = (0, import_credential_store.getCredential)(id, "api_key");
    const result = await (0, import_connection_tester.testProviderConnection)(def.protocol, def.endpoint, apiKey, def.timeoutMs);
    if (result.success) {
      runtime.healthState = "HEALTHY";
      runtime.lastSuccessAt = Date.now();
      runtime.consecutiveFailures = 0;
      runtime.cooldownUntil = 0;
      runtime.disabledUntil = 0;
      runtime.successes++;
      runtime.averageLatencyMs = runtime.averageLatencyMs ? (runtime.averageLatencyMs + result.latencyMs) / 2 : result.latencyMs;
      runtime.lastLatencyMs = result.latencyMs;
      if (def.enabled && (runtime.state === "quarantined" || runtime.state === "starting")) {
        this.transitionState(runtime, "running");
      } else if (def.enabled && runtime.state === "idle") {
        this.transitionState(runtime, "starting");
        this.transitionState(runtime, "running");
      }
    } else {
      runtime.healthState = "DEGRADED";
      runtime.consecutiveFailures++;
      runtime.lastFailureAt = Date.now();
      runtime.cooldownUntil = Date.now() + 3e4;
      runtime.failures++;
      if (runtime.consecutiveFailures >= QUARANTINE_FAILURE_THRESHOLD && def.enabled) {
        runtime.healthState = "QUARANTINED";
        if (runtime.state === "running" || runtime.state === "starting") {
          this.transitionState(runtime, "quarantined");
        }
      } else if (runtime.state === "starting") {
        this.transitionState(runtime, "quarantined");
      }
    }
    runtime.lastHealthCheck = Date.now();
    this.runtimes.set(id, runtime);
    return { success: result.success, healthState: runtime.healthState };
  }
  // Refresh all runtimes from repository
  refreshFromRepository() {
    const defs = import_provider_repo.providerRepo.getAll();
    for (const def of defs) {
      if (!this.runtimes.has(def.id)) {
        const runtime = initialState();
        runtime.definition = def;
        runtime.credential = (0, import_credential_store.getCredential)(def.id, "api_key") || void 0;
        runtime.state = "idle";
        this.runtimes.set(def.id, runtime);
      } else {
        const runtime = this.runtimes.get(def.id);
        runtime.definition = def;
        this.runtimes.set(def.id, runtime);
      }
    }
    for (const [id] of this.runtimes) {
      if (!import_provider_repo.providerRepo.getById(id)) {
        this.runtimes.delete(id);
      }
    }
  }
}
const providerRuntimeManager = new ProviderRuntimeManager();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ProviderRuntimeManager,
  canTransitionState,
  providerRuntimeManager
});
