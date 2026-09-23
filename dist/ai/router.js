"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var router_exports = {};
__export(router_exports, {
  AIRouter: () => AIRouter,
  restoreHealthStateFromLegacyJson: () => restoreHealthStateFromLegacyJson
});
module.exports = __toCommonJS(router_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_crypto = __toESM(require("crypto"));
var import_p_timeout = __toESM(require("p-timeout"));
var import_p_queue = __toESM(require("p-queue"));
var import_logger = require("../logger");
var import_redact = require("../security/redact");
var import_traces = require("./traces");
var import_ai_usage_repo = require("../database/ai-usage-repo");
var import_types = require("./types");
var import_response_cache = require("./response-cache");
const LEGACY_RESTORED_HEALTHY_STATES = /* @__PURE__ */ new Set([
  import_types.HealthState.HEALTHY,
  import_types.HealthState.CONFIGURED
]);
const LEGACY_PERSISTENT_FAILURE_STATES = /* @__PURE__ */ new Set([
  import_types.HealthState.AUTH_FAILED,
  import_types.HealthState.NO_CREDITS,
  import_types.HealthState.QUARANTINED,
  import_types.HealthState.NOT_CONFIGURED
]);
const LEGACY_TRANSIENT_STATES = /* @__PURE__ */ new Set([
  import_types.HealthState.DEGRADED,
  import_types.HealthState.TIMEOUT,
  import_types.HealthState.NETWORK_ERROR,
  import_types.HealthState.RATE_LIMITED,
  import_types.HealthState.RECOVERING
]);
function restoreHealthStateFromLegacyJson(data) {
  const persisted = data.healthState;
  const knownPersisted = typeof persisted === "string" && (LEGACY_RESTORED_HEALTHY_STATES.has(persisted) || LEGACY_PERSISTENT_FAILURE_STATES.has(persisted) || LEGACY_TRANSIENT_STATES.has(persisted));
  if (knownPersisted && LEGACY_PERSISTENT_FAILURE_STATES.has(persisted)) {
    return persisted;
  }
  if (knownPersisted && LEGACY_RESTORED_HEALTHY_STATES.has(persisted)) {
    return persisted;
  }
  if (data.successes > 0) {
    return import_types.HealthState.HEALTHY;
  }
  return import_types.HealthState.CONFIGURED;
}
const DATA_DIR = import_path.default.join(
  process.cwd(),
  "data"
);
const HEALTH_FILE = import_path.default.join(
  DATA_DIR,
  "provider-health.json"
);
const REQUEST_TIMEOUT_MS = 15e3;
const FAILURE_COOLDOWN_MS = 3e4;
const RATE_LIMIT_COOLDOWN_MS = 6e4;
const CREDIT_COOLDOWN_MS = 30 * 6e4;
const MAX_COOLDOWN_MS = 5 * 6e4;
const CREDIT_RECOVERY_MS = 6 * 60 * 6e4;
const AUTH_RECOVERY_MS = 6 * 60 * 6e4;
const PERSISTENT_FAILURE_THRESHOLD = 3;
const FAILURE_QUARANTINE_MS = 5 * 6e4;
const PERSISTENT_RECOVERY_PROBE_MS = 5 * 6e4;
const RECOVERY_PROBE_ENABLED = true;
const EXPLORATION_RATE = 0;
const UNKNOWN_PROVIDER_SCORE = 3e3;
class AIRouter {
  providers;
  health = /* @__PURE__ */ new Map();
  persistentHealth;
  healthQueue = new import_p_queue.default({ concurrency: 1 });
  constructor(providers, options = {}) {
    this.providers = providers;
    this.persistentHealth = options.persistentHealth !== false;
    if (this.persistentHealth) {
      this.loadHealth();
    }
    for (const provider of this.providers) {
      const existing = this.health.get(provider.name);
      if (!existing) {
        this.health.set(provider.name, {
          failures: 0,
          successes: 0,
          totalLatencyMs: 0,
          cooldownUntil: 0,
          lastLatencyMs: null,
          lastSuccessAt: 0,
          lastFailureAt: 0,
          disabledUntil: 0,
          disabledReason: void 0,
          recoveryProbeAt: 0,
          consecutiveFailures: 0,
          lastRecoveryProbeAt: 0,
          lastError: void 0,
          healthState: provider.isAvailable() ? import_types.HealthState.CONFIGURED : import_types.HealthState.NOT_CONFIGURED,
          modelHealth: /* @__PURE__ */ new Map()
        });
      } else if (provider.isAvailable() && existing.healthState === import_types.HealthState.NOT_CONFIGURED && existing.successes === 0 && existing.failures === 0) {
        existing.healthState = import_types.HealthState.CONFIGURED;
      }
    }
  }
  /* =========================
     PERSISTENT HISTORY
  ========================= */
  loadHealth() {
    try {
      if (!import_fs.default.existsSync(
        HEALTH_FILE
      )) {
        return;
      }
      const raw = import_fs.default.readFileSync(
        HEALTH_FILE,
        "utf8"
      );
      const saved = JSON.parse(
        raw
      );
      for (const [name, data] of Object.entries(saved)) {
        const modelHealth = /* @__PURE__ */ new Map();
        if (data.modelHealth) {
          for (const [modelName, mh] of Object.entries(data.modelHealth)) {
            modelHealth.set(modelName, {
              successes: mh.successes ?? 0,
              failures: mh.failures ?? 0,
              consecutiveFailures: mh.consecutiveFailures ?? 0,
              lastError: mh.lastError,
              lastFailureAt: mh.lastFailureAt ?? 0,
              lastSuccessAt: mh.lastSuccessAt ?? 0
            });
          }
        }
        this.health.set(
          name,
          {
            failures: data.failures ?? 0,
            successes: data.successes ?? 0,
            totalLatencyMs: data.totalLatencyMs ?? 0,
            cooldownUntil: 0,
            lastLatencyMs: data.lastLatencyMs ?? null,
            lastSuccessAt: data.lastSuccessAt ?? 0,
            lastFailureAt: data.lastFailureAt ?? 0,
            disabledUntil: data.disabledUntil ?? 0,
            disabledReason: data.disabledReason,
            recoveryProbeAt: data.recoveryProbeAt ?? 0,
            consecutiveFailures: data.consecutiveFailures ?? 0,
            lastRecoveryProbeAt: data.lastRecoveryProbeAt ?? 0,
            lastError: data.lastError,
            healthState: restoreHealthStateFromLegacyJson(data),
            modelHealth,
            lastHttpStatus: data.lastHttpStatus
          }
        );
      }
      import_logger.logger.info(
        "\u{1F4BE} Provider performance history loaded."
      );
    } catch (error) {
      console.warn(
        "\u26A0\uFE0F Could not load provider history:",
        error instanceof Error ? error.message : error
      );
    }
  }
  healthSavePending = false;
  /**
   * Fire-and-forget health persistence.
   * Debounced: rapid consecutive calls coalesce into one disk write.
   */
  saveHealth() {
    if (!this.persistentHealth) {
      return;
    }
    if (this.healthSavePending) {
      return;
    }
    this.healthSavePending = true;
    this.healthQueue.add(() => {
      this.healthSavePending = false;
      this.flushHealthSync();
    });
  }
  flushHealthSync() {
    if (!this.persistentHealth) {
      return;
    }
    try {
      import_fs.default.mkdirSync(
        DATA_DIR,
        {
          recursive: true
        }
      );
      const saved = {};
      for (const [name, state] of this.health) {
        const modelHealthObj = {};
        for (const [modelName, mh] of state.modelHealth) {
          modelHealthObj[modelName] = {
            successes: mh.successes,
            failures: mh.failures,
            consecutiveFailures: mh.consecutiveFailures,
            lastError: mh.lastError,
            lastFailureAt: mh.lastFailureAt,
            lastSuccessAt: mh.lastSuccessAt
          };
        }
        saved[name] = {
          successes: state.successes,
          failures: state.failures,
          totalLatencyMs: state.totalLatencyMs,
          lastLatencyMs: state.lastLatencyMs,
          lastSuccessAt: state.lastSuccessAt,
          lastFailureAt: state.lastFailureAt,
          disabledUntil: state.disabledUntil,
          disabledReason: state.disabledReason,
          recoveryProbeAt: state.recoveryProbeAt,
          consecutiveFailures: state.consecutiveFailures,
          lastRecoveryProbeAt: state.lastRecoveryProbeAt,
          lastError: state.lastError,
          healthState: state.healthState,
          lastHttpStatus: state.lastHttpStatus,
          modelHealth: Object.keys(modelHealthObj).length > 0 ? modelHealthObj : void 0
        };
      }
      const tmpPath = HEALTH_FILE + ".tmp";
      import_fs.default.writeFileSync(
        tmpPath,
        JSON.stringify(
          saved,
          null,
          2
        ),
        "utf8"
      );
      import_fs.default.renameSync(tmpPath, HEALTH_FILE);
    } catch (error) {
      console.warn(
        "\u26A0\uFE0F Could not save provider history:",
        error instanceof Error ? error.message : error
      );
    }
  }
  /* =========================
     AVAILABLE PROVIDERS
  ========================= */
  getAvailableProviders() {
    const now = Date.now();
    return this.providers.filter((provider) => {
      if (!provider.isAvailable()) {
        return false;
      }
      const state = this.health.get(provider.name);
      if (!state) {
        return true;
      }
      if (state.cooldownUntil > now) {
        return false;
      }
      if (state.disabledUntil > now) {
        return false;
      }
      if (state.disabledUntil > 0 && state.disabledUntil <= now) {
        if (!RECOVERY_PROBE_ENABLED || state.recoveryProbeAt > now) {
          return false;
        }
        state.recoveryProbeAt = now + PERSISTENT_RECOVERY_PROBE_MS;
        state.lastRecoveryProbeAt = now;
        this.saveHealth();
        import_logger.logger.debug(
          `\u{1F50E} Recovery probe scheduled for ${provider.name}`
        );
        return true;
      }
      return true;
    });
  }
  /* =========================
     TIMEOUT
  ========================= */
  async withTimeout(promise, timeoutMs = REQUEST_TIMEOUT_MS) {
    return (0, import_p_timeout.default)(promise, {
      milliseconds: timeoutMs,
      message: `Provider request timed out after ${timeoutMs}ms`
    });
  }
  /* =========================
     ERROR DETECTION
  ========================= */
  errorText(error) {
    return (error instanceof Error ? error.message : String(error)).toLowerCase();
  }
  isRateLimitError(error) {
    const value = this.errorText(error);
    return value.includes("429") || value.includes(
      "rate limit"
    ) || value.includes(
      "rate_limit"
    ) || value.includes(
      "too many requests"
    ) || value.includes(
      "resource exhausted"
    );
  }
  isCreditError(error) {
    const value = this.errorText(error);
    return value.includes(
      "insufficient_quota"
    ) || value.includes(
      "credit_balance_exhausted"
    ) || value.includes(
      "no credits remaining"
    ) || value.includes(
      "credit balance is too low"
    ) || value.includes(
      "insufficient credits"
    ) || value.includes(
      "quota exceeded"
    ) || value.includes(
      "billing"
    );
  }
  isTimeoutError(error) {
    const value = this.errorText(error);
    return value.includes("timeout") || value.includes("timed out") || value.includes("deadline exceeded") || value.includes("aborterror") || value.includes("econnreset") || value.includes("etimedout");
  }
  isNetworkError(error) {
    const value = this.errorText(error);
    return value.includes("econnrefused") || value.includes("enotfound") || value.includes("enetunreach") || value.includes("econnreset") || value.includes("epipe") || value.includes("socket hang up") || value.includes("network") || value.includes("fetch failed") || value.includes("request failed");
  }
  extractHttpStatus(error) {
    const text = error instanceof Error ? error.message : String(error);
    const match = text.match(/[:\s](\d{3})\b/) || text.match(/\bstatus[:\s]*(\d{3})\b/i) || text.match(/\bhttp[:\s]*(\d{3})\b/i);
    if (match) {
      const code = parseInt(match[1], 10);
      if (code >= 100 && code < 600) {
        return code;
      }
    }
    return void 0;
  }
  /* =========================
     HEALTH
  ========================= */
  recordSuccess(provider, latencyMs, modelName) {
    const state = this.health.get(provider.name);
    if (!state) {
      return;
    }
    state.successes++;
    state.totalLatencyMs += latencyMs;
    state.lastLatencyMs = latencyMs;
    state.lastSuccessAt = Date.now();
    state.failures = 0;
    state.consecutiveFailures = 0;
    state.cooldownUntil = 0;
    state.disabledUntil = 0;
    state.recoveryProbeAt = 0;
    state.lastRecoveryProbeAt = 0;
    state.disabledReason = void 0;
    state.lastError = void 0;
    if (state.healthState === import_types.HealthState.CONFIGURED || state.healthState === import_types.HealthState.RECOVERING || state.healthState === import_types.HealthState.DEGRADED) {
      state.healthState = import_types.HealthState.HEALTHY;
    }
    if (modelName) {
      let mh = state.modelHealth.get(modelName);
      if (!mh) {
        mh = {
          successes: 0,
          failures: 0,
          consecutiveFailures: 0,
          lastFailureAt: 0,
          lastSuccessAt: 0
        };
        state.modelHealth.set(modelName, mh);
      }
      mh.successes++;
      mh.consecutiveFailures = 0;
      mh.lastSuccessAt = Date.now();
    }
    this.saveHealth();
  }
  isAuthError(error) {
    const value = this.errorText(error);
    return value.includes("401") || value.includes("403") || value.includes("unauthorized") || value.includes("authentication failed") || value.includes("permission-denied") || value.includes("permission denied") || value.includes("invalid api key") || value.includes("invalid_api_key") || value.includes("api key is invalid");
  }
  sanitizeError(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return String((0, import_redact.redact)(raw)).slice(0, 200);
  }
  recordFailure(provider, error, modelName) {
    const state = this.health.get(provider.name);
    if (!state) {
      return;
    }
    const now = Date.now();
    state.failures++;
    state.consecutiveFailures++;
    state.lastFailureAt = now;
    state.lastError = this.sanitizeError(error);
    if (modelName) {
      let mh = state.modelHealth.get(modelName);
      if (!mh) {
        mh = {
          successes: 0,
          failures: 0,
          consecutiveFailures: 0,
          lastFailureAt: 0,
          lastSuccessAt: 0
        };
        state.modelHealth.set(modelName, mh);
      }
      mh.failures++;
      mh.consecutiveFailures++;
      mh.lastFailureAt = now;
      mh.lastError = this.sanitizeError(error);
    }
    const httpStatus = this.extractHttpStatus(error);
    if (httpStatus) {
      state.lastHttpStatus = httpStatus;
    }
    if (this.isCreditError(error)) {
      state.disabledUntil = now + CREDIT_RECOVERY_MS;
      state.recoveryProbeAt = state.disabledUntil;
      state.disabledReason = "credits/billing";
      state.healthState = import_types.HealthState.NO_CREDITS;
      this.saveHealth();
      import_logger.logger.warn(
        `\u{1F4B3} ${provider.name} quarantined for 6 hours (credits/billing).`
      );
      return;
    }
    if (this.isAuthError(error)) {
      state.disabledUntil = now + AUTH_RECOVERY_MS;
      state.recoveryProbeAt = state.disabledUntil;
      state.disabledReason = "authentication/permission";
      state.healthState = import_types.HealthState.AUTH_FAILED;
      this.saveHealth();
      import_logger.logger.warn(
        `\u{1F510} ${provider.name} quarantined for 6 hours (authentication/permission).`
      );
      return;
    }
    if (this.isRateLimitError(error)) {
      state.cooldownUntil = now + RATE_LIMIT_COOLDOWN_MS;
      state.healthState = import_types.HealthState.RATE_LIMITED;
      this.saveHealth();
      import_logger.logger.warn(
        `\u23F3 ${provider.name} rate-limited for 60 seconds.`
      );
      return;
    }
    if (this.isTimeoutError(error)) {
      state.cooldownUntil = now + Math.min(
        state.consecutiveFailures * FAILURE_COOLDOWN_MS,
        MAX_COOLDOWN_MS
      );
      state.healthState = import_types.HealthState.TIMEOUT;
      this.saveHealth();
      import_logger.logger.warn(
        `\u23F1\uFE0F ${provider.name} timed out.`
      );
      return;
    }
    if (this.isNetworkError(error)) {
      state.cooldownUntil = now + Math.min(
        state.consecutiveFailures * FAILURE_COOLDOWN_MS,
        MAX_COOLDOWN_MS
      );
      state.healthState = import_types.HealthState.NETWORK_ERROR;
      this.saveHealth();
      import_logger.logger.warn(
        `\u{1F310} ${provider.name} network error.`
      );
      return;
    }
    if (state.consecutiveFailures >= PERSISTENT_FAILURE_THRESHOLD) {
      state.disabledUntil = now + FAILURE_QUARANTINE_MS;
      state.recoveryProbeAt = state.disabledUntil;
      state.disabledReason = `persistent failures (${state.consecutiveFailures})`;
      state.healthState = import_types.HealthState.QUARANTINED;
      this.saveHealth();
      import_logger.logger.warn(
        `\u{1F6AB} ${provider.name} quarantined for 5 minutes after ${state.consecutiveFailures} consecutive failures.`
      );
      return;
    }
    state.cooldownUntil = now + Math.min(
      state.consecutiveFailures * FAILURE_COOLDOWN_MS,
      MAX_COOLDOWN_MS
    );
    if (state.healthState === import_types.HealthState.HEALTHY || state.healthState === import_types.HealthState.CONFIGURED) {
      state.healthState = import_types.HealthState.DEGRADED;
    }
    this.saveHealth();
  }
  /* =========================
     SMART SCORE
  ========================= */
  providerScore(provider) {
    const state = this.health.get(provider.name);
    if (!state || state.successes === 0) {
      return UNKNOWN_PROVIDER_SCORE;
    }
    const successes = state.successes;
    const failures = state.failures;
    const totalRequests = successes + failures;
    const averageLatency = successes > 0 ? state.totalLatencyMs / successes : UNKNOWN_PROVIDER_SCORE;
    const successRate = totalRequests > 0 ? successes / totalRequests : 1;
    let score = 0;
    score += averageLatency * 0.5;
    if (state.lastLatencyMs !== null) {
      score += state.lastLatencyMs * 0.3;
    } else {
      score += averageLatency * 0.2;
    }
    score += (1 - successRate) * 4e3;
    score += Math.min(failures * 750, 5e3);
    const experienceBonus = Math.min(successes, 10) * 75;
    score -= experienceBonus;
    if (successRate >= 0.95 && successes >= 3) {
      score -= 500;
    } else if (successRate >= 0.9 && successes >= 2) {
      score -= 250;
    }
    switch (state.healthState) {
      case import_types.HealthState.DEGRADED:
        score += 1e3;
        break;
      case import_types.HealthState.TIMEOUT:
        score += 2e3;
        break;
      case import_types.HealthState.NETWORK_ERROR:
        score += 2500;
        break;
      case import_types.HealthState.RATE_LIMITED:
        score += 1500;
        break;
      case import_types.HealthState.HEALTHY:
        score -= 200;
        break;
    }
    return Math.max(
      1,
      Math.round(score)
    );
  }
  /* =========================
     PROVIDER ORDER V4
  ========================= */
  orderedProviders() {
    const available = this.getAvailableProviders();
    if (available.length <= 1) {
      return available;
    }
    const untested = available.filter((provider) => {
      const state = this.health.get(provider.name);
      return !state || state.successes === 0;
    });
    const ranked = [...available].sort(
      (a, b) => this.providerScore(a) - this.providerScore(b)
    );
    if (untested.length > 0) {
      const explorationRate = untested.length >= 8 ? 0.1 : untested.length >= 4 ? 0.07 : 0.05;
      if (Math.random() < explorationRate) {
        const randomIndex = Math.floor(
          Math.random() * untested.length
        );
        const explorer = untested[randomIndex];
        import_logger.logger.debug(
          `\u{1F9EA} V4 exploration: testing ${explorer.name}`
        );
        return [
          explorer,
          ...ranked.filter(
            (provider) => provider.name !== explorer.name
          )
        ];
      }
    }
    const experienced = ranked.filter((provider) => {
      const state = this.health.get(provider.name);
      return state && state.successes > 0;
    });
    if (experienced.length >= 2 && Math.random() < 0.1) {
      const alternateIndex = Math.min(
        1 + Math.floor(
          Math.random() * Math.min(
            experienced.length - 1,
            2
          )
        ),
        experienced.length - 1
      );
      const alternate = experienced[alternateIndex];
      import_logger.logger.debug(
        `\u{1F52C} V4 comparison: ${alternate.name} selected for adaptive testing`
      );
      return [
        alternate,
        ...ranked.filter(
          (provider) => provider.name !== alternate.name
        )
      ];
    }
    return ranked;
  }
  /* =========================
     GENERATE
  ========================= */
  async generate(request) {
    const t0 = Date.now();
    const requestId = request.userId ? import_crypto.default.randomUUID() : void 0;
    const traceCtx = (0, import_traces.startTrace)("ai-generate", "ai", {
      model: request.model,
      guildId: request.guildId,
      userId: request.userId,
      messageCount: request.messages.length
    });
    const systemPrompt = request.messages.find((m) => m.role === "system")?.content || "";
    const chatMessages = request.messages.filter((m) => m.role !== "system");
    const modelName = request.model || "default";
    const cached = (0, import_response_cache.getCachedResponse)(systemPrompt, chatMessages, modelName, request.guildId, request.userId);
    if (cached) {
      import_logger.logger.debug(`\u{1F9E0} Cache hit \u2014 returning cached response for model=${modelName}`);
      if (requestId && request.userId) {
        (0, import_ai_usage_repo.insertAIUsageDB)({
          requestId,
          userId: request.userId,
          guildId: request.guildId || "",
          channelId: request.channelId || "",
          source: "cache",
          provider: "cache",
          model: modelName,
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          success: true,
          latencyMs: Date.now() - t0,
          createdAt: Math.floor(Date.now() / 1e3)
        });
      }
      (0, import_traces.endSpan)(traceCtx.spanId);
      return {
        text: cached,
        model: modelName,
        provider: "cache",
        latencyMs: Date.now() - t0
      };
    }
    const providers = this.orderedProviders();
    const orderedMs = Date.now() - t0;
    if (providers.length === 0) {
      (0, import_traces.endSpanError)(traceCtx.spanId, "No configured AI providers are available");
      throw new Error(
        "No configured AI providers are available."
      );
    }
    let lastError;
    const attemptedProviders = /* @__PURE__ */ new Set();
    const maxAttempts = Math.min(providers.length, 6);
    let attempts = 0;
    import_logger.logger.debug(
      `\u{1F9E0} Smart router: ${providers.length} provider(s) available (ordered in ${orderedMs}ms)`
    );
    for (const provider of providers) {
      if (attempts >= maxAttempts) {
        import_logger.logger.warn(
          `\u{1F6D1} Provider attempt limit reached (${maxAttempts}).`
        );
        break;
      }
      if (attemptedProviders.has(provider.name)) {
        continue;
      }
      attemptedProviders.add(provider.name);
      attempts++;
      const score = this.providerScore(
        provider
      );
      import_logger.logger.debug(
        `\u{1F916} Trying ${provider.name} (score ${score}ms, attempt ${attempts}/${maxAttempts})...`
      );
      const startedAt = Date.now();
      try {
        const response = await this.withTimeout(
          provider.generate(
            request
          )
        );
        const measuredLatency = Date.now() - startedAt;
        const latency = response.latencyMs ?? measuredLatency;
        const saveStart = Date.now();
        this.recordSuccess(
          provider,
          latency,
          response.model || modelName
        );
        const saveMs = Date.now() - saveStart;
        import_logger.logger.debug(
          `\u2705 ${provider.name} responded in ${latency}ms (saveHealth ${saveMs}ms, ordered ${orderedMs}ms)`
        );
        (0, import_response_cache.setCachedResponse)(
          systemPrompt,
          chatMessages,
          response.model || modelName,
          response.text,
          0,
          void 0,
          request.guildId,
          request.userId
        );
        if (requestId && request.userId) {
          (0, import_ai_usage_repo.insertAIUsageDB)({
            requestId,
            userId: request.userId,
            guildId: request.guildId || "",
            channelId: request.channelId || "",
            source: request.source || "ai",
            provider: response.provider || provider.name,
            model: response.model || modelName,
            inputTokens: response.inputTokens ?? null,
            outputTokens: response.outputTokens ?? null,
            totalTokens: response.totalTokens ?? null,
            success: true,
            latencyMs: latency,
            createdAt: Math.floor(Date.now() / 1e3)
          });
        }
        (0, import_traces.endSpan)(traceCtx.spanId);
        return response;
      } catch (error) {
        lastError = error;
        const saveStart = Date.now();
        this.recordFailure(
          provider,
          error,
          modelName
        );
        const saveMs = Date.now() - saveStart;
        if (this.isCreditError(
          error
        )) {
          import_logger.logger.warn(
            `\u{1F4B3} ${provider.name}: credits/billing unavailable.`
          );
        } else if (this.isRateLimitError(
          error
        )) {
          import_logger.logger.warn(
            `\u23F3 ${provider.name}: rate limited.`
          );
        } else {
          import_logger.logger.warn(
            `\u26A0\uFE0F ${provider.name} failed.`
          );
        }
        import_logger.logger.warn(
          "\u27A1\uFE0F Smart router switching provider..."
        );
      }
    }
    (0, import_traces.endSpanError)(traceCtx.spanId, lastError instanceof Error ? lastError.message : String(lastError));
    throw new Error(
      `All AI providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }
  /* =========================
     HEALTH API
  ========================= */
  getHealth() {
    return this.providers.map(
      (provider) => {
        const state = this.health.get(
          provider.name
        );
        const total = (state?.successes ?? 0) + (state?.failures ?? 0);
        const successRate = total > 0 ? Math.round(
          (state?.successes ?? 0) / total * 100
        ) : null;
        const modelHealthObj = {};
        if (state?.modelHealth) {
          for (const [modelName, mh] of state.modelHealth) {
            modelHealthObj[modelName] = {
              successes: mh.successes,
              failures: mh.failures,
              consecutiveFailures: mh.consecutiveFailures,
              lastError: mh.lastError,
              lastFailureAt: mh.lastFailureAt,
              lastSuccessAt: mh.lastSuccessAt
            };
          }
        }
        return {
          provider: provider.name,
          available: provider.isAvailable(),
          healthState: state?.healthState ?? import_types.HealthState.NOT_CONFIGURED,
          successes: state?.successes ?? 0,
          failures: state?.failures ?? 0,
          successRate,
          averageLatencyMs: state && state.successes > 0 ? Math.round(
            state.totalLatencyMs / state.successes
          ) : null,
          lastLatencyMs: state?.lastLatencyMs ?? null,
          score: this.providerScore(
            provider
          ),
          cooldownUntil: state?.cooldownUntil ?? 0,
          disabledUntil: state?.disabledUntil ?? 0,
          disabledReason: state?.disabledReason ?? null,
          lastError: state?.lastError ?? null,
          lastHttpStatus: state?.lastHttpStatus ?? null,
          modelHealth: Object.keys(modelHealthObj).length > 0 ? modelHealthObj : void 0
        };
      }
    );
  }
  /* =========================
     HEALTH PROBING
  ========================= */
  /**
   * Lightweight active health probe for a single provider.
   * Uses minimal tokens, short timeout, no Discord interaction.
   * Respects quarantine/cooldown — will not probe disabled providers.
   */
  async probeProvider(providerName, options = {}) {
    const provider = this.providers.find(
      (p) => p.name === providerName
    );
    if (!provider) {
      return {
        provider: providerName,
        healthy: false,
        latencyMs: 0,
        error: "Provider not registered",
        healthState: import_types.HealthState.NOT_CONFIGURED
      };
    }
    if (!provider.isAvailable()) {
      return {
        provider: providerName,
        healthy: false,
        latencyMs: 0,
        error: "Provider not configured (missing API key)",
        healthState: import_types.HealthState.NOT_CONFIGURED
      };
    }
    const state = this.health.get(providerName);
    const now = Date.now();
    if (!options.force) {
      if (state && state.disabledUntil > now) {
        return {
          provider: providerName,
          healthy: false,
          latencyMs: 0,
          error: `Quarantined until ${new Date(state.disabledUntil).toISOString()}`,
          healthState: state.healthState
        };
      }
      if (state && state.cooldownUntil > now) {
        return {
          provider: providerName,
          healthy: false,
          latencyMs: 0,
          error: `Cooldown until ${new Date(state.cooldownUntil).toISOString()}`,
          healthState: state.healthState
        };
      }
    }
    const probeRequest = {
      messages: [
        {
          role: "user",
          content: "Hello"
        }
      ],
      maxTokens: 5,
      source: "health-probe"
    };
    const timeoutMs = options.timeoutMs ?? 1e4;
    const t0 = Date.now();
    try {
      const response = await this.withTimeout(
        provider.generate(probeRequest),
        timeoutMs
      );
      const latencyMs = Date.now() - t0;
      this.recordSuccess(provider, latencyMs, response.model);
      return {
        provider: providerName,
        healthy: true,
        latencyMs,
        healthState: import_types.HealthState.HEALTHY
      };
    } catch (error) {
      const latencyMs = Date.now() - t0;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.recordFailure(provider, error);
      return {
        provider: providerName,
        healthy: false,
        latencyMs,
        error: errorMsg.slice(0, 200),
        healthState: state?.healthState ?? import_types.HealthState.DEGRADED
      };
    }
  }
  /**
   * Probe all available providers in parallel.
   * Returns a summary report useful for diagnostics and startup verification.
   */
  async probeAllProviders(options = {}) {
    const available = this.providers.filter(
      (p) => p.isAvailable()
    );
    const results = await Promise.all(
      available.map(
        (p) => this.probeProvider(p.name, options)
      )
    );
    const healthy = results.filter((r) => r.healthy).length;
    const unhealthy = results.length - healthy;
    return {
      healthy,
      unhealthy,
      total: results.length,
      results
    };
  }
  /* =========================
     HEALTH REPORT
  ========================= */
  /**
   * Structured health report for diagnostics, self-healer, and tests.
   * Does not expose secrets or raw error messages.
   */
  getHealthReport() {
    const providers = this.providers.map((provider) => {
      const state = this.health.get(provider.name);
      const configured = provider.isAvailable();
      const total = (state?.successes ?? 0) + (state?.failures ?? 0);
      const successRate = total > 0 ? Math.round((state?.successes ?? 0) / total * 100) : null;
      const averageLatencyMs = state && state.successes > 0 ? Math.round(state.totalLatencyMs / state.successes) : null;
      let worstModelState = null;
      if (state?.modelHealth) {
        for (const [, mh] of state.modelHealth) {
          if (mh.consecutiveFailures >= PERSISTENT_FAILURE_THRESHOLD) {
            worstModelState = import_types.HealthState.QUARANTINED;
            break;
          } else if (mh.failures > 0 && worstModelState === null) {
            worstModelState = import_types.HealthState.DEGRADED;
          }
        }
      }
      return {
        name: provider.name,
        configured,
        healthState: state?.healthState ?? import_types.HealthState.NOT_CONFIGURED,
        successes: state?.successes ?? 0,
        failures: state?.failures ?? 0,
        successRate,
        averageLatencyMs,
        score: this.providerScore(provider),
        quarantined: (state?.disabledUntil ?? 0) > Date.now(),
        lastError: state?.lastError ?? null,
        modelCount: state?.modelHealth?.size ?? 0,
        worstModelState
      };
    });
    const healthyProviders = providers.filter(
      (p) => p.healthState === import_types.HealthState.HEALTHY
    ).length;
    const degradedProviders = providers.filter(
      (p) => p.healthState === import_types.HealthState.DEGRADED
    ).length;
    const quarantinedProviders = providers.filter(
      (p) => p.quarantined
    ).length;
    const untestedProviders = providers.filter(
      (p) => p.configured && p.successes === 0 && p.failures === 0
    ).length;
    return {
      totalProviders: this.providers.length,
      configuredProviders: providers.filter((p) => p.configured).length,
      healthyProviders,
      degradedProviders,
      quarantinedProviders,
      untestedProviders,
      providers
    };
  }
  /**
   * Startup verification — logs summary without probing.
   * Safe to call during initialization.
   */
  logStartupSummary() {
    const report = this.getHealthReport();
    import_logger.logger.info(
      `\u{1F3E5} Provider health summary: ${report.healthyProviders} healthy, ${report.degradedProviders} degraded, ${report.quarantinedProviders} quarantined, ${report.untestedProviders} untested out of ${report.configuredProviders} configured`
    );
    for (const p of report.providers) {
      if (!p.configured) continue;
      const icon = p.healthState === import_types.HealthState.HEALTHY ? "\u2705" : p.healthState === import_types.HealthState.DEGRADED ? "\u26A0\uFE0F" : p.quarantined ? "\u{1F6AB}" : p.successes === 0 ? "\u{1F195}" : "\u2753";
      import_logger.logger.info(
        `  ${icon} ${p.name}: ${p.healthState} (${p.successes} ok, ${p.failures} fail, score=${p.score})`
      );
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AIRouter,
  restoreHealthStateFromLegacyJson
});
