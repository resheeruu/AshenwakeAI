import fs from "fs";
import path from "path";
import pTimeout from "p-timeout";
import PQueue from "p-queue";
import { logger } from "../logger";
import { redact } from "../security/redact";
import { startTrace, endSpan, endSpanError } from "./traces";

import {
  AIProvider,
  AIRequest,
  AIResponse,
} from "./types";
import {
  getCachedResponse,
  setCachedResponse,
} from "./response-cache";

interface ProviderHealth {
  failures: number;
  successes: number;
  totalLatencyMs: number;
  cooldownUntil: number;
  lastLatencyMs: number | null;
  lastSuccessAt: number;
  lastFailureAt: number;

  /*
   * Temporary cooldown = retry later.
   * Disabled/quarantined = do not spend API requests normally.
   */
  disabledUntil: number;
  disabledReason?: string;

  /*
   * Controls when a disabled provider may be tested again.
   */
  recoveryProbeAt: number;
  consecutiveFailures: number;

  /*
   * Prevents repeated recovery probes from wasting API calls.
   */
  lastRecoveryProbeAt: number;

  lastError?: string;
}

interface SavedProviderHealth {
  successes: number;
  failures: number;
  totalLatencyMs: number;
  lastLatencyMs: number | null;
  lastSuccessAt: number;

  disabledUntil?: number;
  disabledReason?: string;
  recoveryProbeAt?: number;
  consecutiveFailures?: number;
  lastRecoveryProbeAt?: number;
  lastFailureAt?: number;
  lastError?: string;
}

const DATA_DIR = path.join(
  process.cwd(),
  "data"
);

const HEALTH_FILE = path.join(
  DATA_DIR,
  "provider-health.json"
);

const REQUEST_TIMEOUT_MS = 15_000;

const FAILURE_COOLDOWN_MS =
  30_000;

const RATE_LIMIT_COOLDOWN_MS =
  60_000;

const CREDIT_COOLDOWN_MS =
  30 * 60_000;

const MAX_COOLDOWN_MS =
  5 * 60_000;

/*
 * API USAGE OPTIMIZATION
 *
 * Providers with persistent problems are skipped instead of
 * consuming another API request on every user message.
 *
 * Recovery is deliberately infrequent so a broken/empty provider
 * does not waste API calls.
 */
const CREDIT_RECOVERY_MS =
  6 * 60 * 60_000;

const AUTH_RECOVERY_MS =
  6 * 60 * 60_000;

const PERSISTENT_FAILURE_THRESHOLD =
  3;

const FAILURE_QUARANTINE_MS =
  5 * 60_000;

const PERSISTENT_RECOVERY_PROBE_MS =
  5 * 60_000;

const RECOVERY_PROBE_ENABLED =
  true;

/*
 * Set to 0 to disable random provider exploration.
 * This saves API requests.
 */
const EXPLORATION_RATE =
  0;

const UNKNOWN_PROVIDER_SCORE =
  3_000;

/*
 * How often an untested provider gets
 * a chance during normal requests.
 *
 * 0.20 = 20% chance.
 *
 * This only happens when there is an
 * untested provider available.
 */

export class AIRouter {
  private readonly providers: AIProvider[];

  private readonly health =
    new Map<string, ProviderHealth>();

  private readonly persistentHealth: boolean;

  private readonly healthQueue = new PQueue({ concurrency: 1 });

  constructor(
    providers: AIProvider[],
    options: {
      persistentHealth?: boolean;
    } = {}
  ) {
    this.providers = providers;

    this.persistentHealth =
      options.persistentHealth !== false;

    if (this.persistentHealth) {
      this.loadHealth();
    }

    /*
     * Ensure every configured provider has a health record.
     * This allows newly added providers to participate in
     * cooldowns, quarantine, recovery probes, and scoring.
     */
    for (const provider of this.providers) {
      if (!this.health.has(provider.name)) {
        this.health.set(provider.name, {
          failures: 0,
          successes: 0,
          totalLatencyMs: 0,
          cooldownUntil: 0,
          lastLatencyMs: null,
          lastSuccessAt: 0,
          lastFailureAt: 0,
          disabledUntil: 0,
          disabledReason: undefined,
          recoveryProbeAt: 0,
          consecutiveFailures: 0,
          lastRecoveryProbeAt: 0,
          lastError: undefined,
        });
      }
    }

  }

  /* =========================
     PERSISTENT HISTORY
  ========================= */

  private loadHealth(): void {
    try {
      if (
        !fs.existsSync(
          HEALTH_FILE
        )
      ) {
        return;
      }

      const raw =
        fs.readFileSync(
          HEALTH_FILE,
          "utf8"
        );

      const saved =
        JSON.parse(
          raw
        ) as Record<
          string,
          SavedProviderHealth
        >;

      for (
        const [name, data]
        of Object.entries(saved)
      ) {
        this.health.set(
          name,
          {
            failures:
              data.failures ?? 0,

            successes:
              data.successes ?? 0,

            totalLatencyMs:
              data.totalLatencyMs ?? 0,

            cooldownUntil: 0,

            lastLatencyMs:
              data.lastLatencyMs ?? null,

            lastSuccessAt:
              data.lastSuccessAt ?? 0,

            lastFailureAt:
              data.lastFailureAt ?? 0,

            disabledUntil:
              data.disabledUntil ?? 0,
            disabledReason:
              data.disabledReason,
            recoveryProbeAt:
              data.recoveryProbeAt ?? 0,
            consecutiveFailures:
              data.consecutiveFailures ?? 0,
            lastRecoveryProbeAt:
              data.lastRecoveryProbeAt ?? 0,
            lastError:
              data.lastError,
          }
        );
      }

      logger.info(
        "💾 Provider performance history loaded."
      );
    } catch (error) {
      console.warn(
        "⚠️ Could not load provider history:",
        error instanceof Error
          ? error.message
          : error
      );
    }
  }

  private healthSavePending = false;

  /**
   * Fire-and-forget health persistence.
   * Debounced: rapid consecutive calls coalesce into one disk write.
   */
  private saveHealth(): void {
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

  private flushHealthSync(): void {
    if (!this.persistentHealth) {
      return;
    }

    try {
      fs.mkdirSync(
        DATA_DIR,
        {
          recursive: true,
        }
      );

      const saved:
        Record<
          string,
          SavedProviderHealth
        > = {};

      for (
        const [name, state]
        of this.health
      ) {
        saved[name] = {
          successes:
            state.successes,

          failures:
            state.failures,

          totalLatencyMs:
            state.totalLatencyMs,

          lastLatencyMs:
            state.lastLatencyMs,

          lastSuccessAt:
            state.lastSuccessAt,
          lastFailureAt:
            state.lastFailureAt,
          disabledUntil:
            state.disabledUntil,
          disabledReason:
            state.disabledReason,
          recoveryProbeAt:
            state.recoveryProbeAt,
          consecutiveFailures:
            state.consecutiveFailures,
          lastRecoveryProbeAt:
            state.lastRecoveryProbeAt,
          lastError:
            state.lastError,
        };
      }

      const tmpPath = HEALTH_FILE + ".tmp";
      fs.writeFileSync(
        tmpPath,
        JSON.stringify(
          saved,
          null,
          2
        ),
        "utf8"
      );
      fs.renameSync(tmpPath, HEALTH_FILE);
    } catch (error) {
      console.warn(
        "⚠️ Could not save provider history:",
        error instanceof Error
          ? error.message
          : error
      );
    }
  }

  /* =========================
     AVAILABLE PROVIDERS
  ========================= */

  getAvailableProviders():
    AIProvider[] {
    const now = Date.now();

    return this.providers.filter((provider) => {
      if (!provider.isAvailable()) {
        return false;
      }

      const state = this.health.get(provider.name);

      if (!state) {
        return true;
      }

      /*
       * Normal cooldown.
       */
      if (state.cooldownUntil > now) {
        return false;
      }

      /*
       * Provider is quarantined.
       *
       * Once the quarantine expires, allow exactly one
       * controlled recovery probe. The probe timestamp
       * prevents every incoming request from probing it.
       */
      if (state.disabledUntil > now) {
        return false;
      }

      if (
        state.disabledUntil > 0 &&
        state.disabledUntil <= now
      ) {
        if (
          !RECOVERY_PROBE_ENABLED ||
          state.recoveryProbeAt > now
        ) {
          return false;
        }

        state.recoveryProbeAt =
          now + PERSISTENT_RECOVERY_PROBE_MS;

        state.lastRecoveryProbeAt = now;

        this.saveHealth();

        logger.debug(
          `🔎 Recovery probe scheduled for ${provider.name}`
        );

        return true;
      }

      return true;
    });
  }

  /* =========================
     TIMEOUT
  ========================= */

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs =
      REQUEST_TIMEOUT_MS
  ): Promise<T> {
    return pTimeout(promise, {
      milliseconds: timeoutMs,
      message: `Provider request timed out after ${timeoutMs}ms`,
    });
  }

  /* =========================
     ERROR DETECTION
  ========================= */

  private errorText(
    error: unknown
  ): string {
    return (
      error instanceof Error
        ? error.message
        : String(error)
    ).toLowerCase();
  }

  private isRateLimitError(
    error: unknown
  ): boolean {
    const value =
      this.errorText(error);

    return (
      value.includes("429") ||
      value.includes(
        "rate limit"
      ) ||
      value.includes(
        "rate_limit"
      ) ||
      value.includes(
        "too many requests"
      ) ||
      value.includes(
        "resource exhausted"
      )
    );
  }

  private isCreditError(
    error: unknown
  ): boolean {
    const value =
      this.errorText(error);

    return (
      value.includes(
        "insufficient_quota"
      ) ||
      value.includes(
        "credit_balance_exhausted"
      ) ||
      value.includes(
        "no credits remaining"
      ) ||
      value.includes(
        "credit balance is too low"
      ) ||
      value.includes(
        "insufficient credits"
      ) ||
      value.includes(
        "quota exceeded"
      ) ||
      value.includes(
        "billing"
      )
    );
  }

  /* =========================
     HEALTH
  ========================= */

  private recordSuccess(
    provider: AIProvider,
    latencyMs: number
  ): void {
    const state = this.health.get(provider.name);

    if (!state) {
      return;
    }

    state.successes++;
    state.totalLatencyMs += latencyMs;
    state.lastLatencyMs = latencyMs;
    state.lastSuccessAt = Date.now();

    // A successful request proves the provider is usable again.
    state.failures = 0;
    state.consecutiveFailures = 0;
    state.cooldownUntil = 0;
    state.disabledUntil = 0;
    state.recoveryProbeAt = 0;
    state.lastRecoveryProbeAt = 0;
    state.disabledReason = undefined;
    state.lastError = undefined;

    this.saveHealth();
  }

  private isAuthError(error: unknown): boolean {
    const value = this.errorText(error);

    return (
      value.includes("401") ||
      value.includes("403") ||
      value.includes("unauthorized") ||
      value.includes("authentication failed") ||
      value.includes("permission-denied") ||
      value.includes("permission denied") ||
      value.includes("invalid api key") ||
      value.includes("invalid_api_key") ||
      value.includes("api key is invalid")
    );
  }

  private sanitizeError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return String(redact(raw)).slice(0, 200);
  }

  private recordFailure(
    provider: AIProvider,
    error: unknown
  ): void {
    const state = this.health.get(provider.name);

    if (!state) {
      return;
    }

    const now = Date.now();

    state.failures++;
    state.consecutiveFailures++;
    state.lastFailureAt = now;

    state.lastError = this.sanitizeError(error);

    /*
     * Credit/billing failures are unlikely to recover by themselves
     * during the current request cycle. Quarantine them for 6 hours
     * instead of repeatedly spending API calls.
     */
    if (this.isCreditError(error)) {
      state.disabledUntil =
        now + CREDIT_RECOVERY_MS;

      state.recoveryProbeAt =
        state.disabledUntil;

      state.disabledReason =
        "credits/billing";

      this.saveHealth();

      logger.warn(
        `💳 ${provider.name} quarantined for 6 hours (credits/billing).`
      );

      return;
    }

    /*
     * Authentication/permission failures also should not be retried
     * on every user request.
     */
    if (this.isAuthError(error)) {
      state.disabledUntil =
        now + AUTH_RECOVERY_MS;

      state.recoveryProbeAt =
        state.disabledUntil;

      state.disabledReason =
        "authentication/permission";

      this.saveHealth();

      logger.warn(
        `🔐 ${provider.name} quarantined for 6 hours (authentication/permission).`
      );

      return;
    }

    /*
     * Rate limits are temporary. Keep the shorter cooldown because
     * the provider may become usable again soon.
     */
    if (this.isRateLimitError(error)) {
      state.cooldownUntil =
        now + RATE_LIMIT_COOLDOWN_MS;

      this.saveHealth();

      logger.warn(
        `⏳ ${provider.name} rate-limited for 60 seconds.`
      );

      return;
    }

    /*
     * Repeated ordinary failures indicate that the provider is
     * probably unavailable. Quarantine after three consecutive
     * failures to prevent API waste.
     */
    if (
      state.consecutiveFailures >=
      PERSISTENT_FAILURE_THRESHOLD
    ) {
      state.disabledUntil =
        now + FAILURE_QUARANTINE_MS;

      state.recoveryProbeAt =
        state.disabledUntil;

      state.disabledReason =
        `persistent failures (${state.consecutiveFailures})`;

      this.saveHealth();

      logger.warn(
        `🚫 ${provider.name} quarantined for 6 hours after ${state.consecutiveFailures} consecutive failures.`
      );

      return;
    }

    /*
     * Normal temporary failure.
     */
    state.cooldownUntil =
      now +
      Math.min(
        state.consecutiveFailures *
          FAILURE_COOLDOWN_MS,
        MAX_COOLDOWN_MS
      );

    this.saveHealth();
  }

  /* =========================
     SMART SCORE
  ========================= */

  private providerScore(
    provider: AIProvider
  ): number {
    const state = this.health.get(provider.name);

    if (!state || state.successes === 0) {
      return UNKNOWN_PROVIDER_SCORE;
    }

    const successes = state.successes;
    const failures = state.failures;
    const totalRequests = successes + failures;

    const averageLatency =
      successes > 0
        ? state.totalLatencyMs / successes
        : UNKNOWN_PROVIDER_SCORE;

    const successRate =
      totalRequests > 0
        ? successes / totalRequests
        : 1;

    /*
     * V4 ADAPTIVE SCORING
     *
     * Lower score = better provider.
     *
     * Factors:
     * 1. Average latency
     * 2. Recent latency
     * 3. Reliability
     * 4. Repeated failures
     * 5. Experience bonus
     */

    let score = 0;

    // Average performance.
    score += averageLatency * 0.50;

    // Recent performance matters more when a provider changes speed.
    if (state.lastLatencyMs !== null) {
      score += state.lastLatencyMs * 0.30;
    } else {
      score += averageLatency * 0.20;
    }

    // Reliability penalty.
    score += (1 - successRate) * 4000;

    // Repeated failures are strongly penalized.
    score += Math.min(failures * 750, 5000);

    /*
     * Experience bonus.
     *
     * A provider that has successfully served several
     * requests becomes more trusted, but the bonus is capped.
     */
    const experienceBonus =
      Math.min(successes, 10) * 75;

    score -= experienceBonus;

    /*
     * Very reliable providers get a small additional bonus.
     */
    if (successRate >= 0.95 && successes >= 3) {
      score -= 500;
    } else if (successRate >= 0.90 && successes >= 2) {
      score -= 250;
    }

    return Math.max(
      1,
      Math.round(score)
    );
  }

  /* =========================
     PROVIDER ORDER V4
  ========================= */

  private orderedProviders(): AIProvider[] {
    const available =
      this.getAvailableProviders();

    if (available.length <= 1) {
      return available;
    }

    /*
     * Separate experienced and untested providers.
     */
    const untested =
      available.filter((provider) => {
        const state =
          this.health.get(provider.name);

        return (
          !state ||
          state.successes === 0
        );
      });

    /*
     * Rank every available provider by
     * adaptive score.
     */
    const ranked =
      [...available].sort(
        (a, b) =>
          this.providerScore(a) -
          this.providerScore(b)
      );

    /*
     * V4 exploration:
     *
     * Test untested providers occasionally instead
     * of permanently trusting the first successful
     * provider.
     *
     * More untested providers = more exploration.
     */
    if (untested.length > 0) {
      const explorationRate =
        untested.length >= 8
          ? 0.10
          : untested.length >= 4
            ? 0.07
            : 0.05;

      if (Math.random() < explorationRate) {
        const randomIndex =
          Math.floor(
            Math.random() *
            untested.length
          );

        const explorer =
          untested[randomIndex];

        logger.debug(
          `🧪 V4 exploration: testing ${explorer.name}`
        );

        return [
          explorer,
          ...ranked.filter(
            (provider) =>
              provider.name !==
              explorer.name
          ),
        ];
      }
    }

    /*
     * Occasionally compare the best provider with
     * another experienced provider.
     *
     * This prevents AshenAI from becoming permanently
     * locked onto one provider.
     */
    const experienced =
      ranked.filter((provider) => {
        const state =
          this.health.get(provider.name);

        return (
          state &&
          state.successes > 0
        );
      });

    if (
      experienced.length >= 2 &&
      Math.random() < 0.10
    ) {
      const alternateIndex =
        Math.min(
          1 +
            Math.floor(
              Math.random() *
              Math.min(
                experienced.length - 1,
                2
              )
            ),
          experienced.length - 1
        );

      const alternate =
        experienced[alternateIndex];

      logger.debug(
        `🔬 V4 comparison: ${alternate.name} selected for adaptive testing`
      );

      return [
        alternate,
        ...ranked.filter(
          (provider) =>
            provider.name !==
            alternate.name
        ),
      ];
    }

    return ranked;
  }

  /* =========================
     GENERATE
  ========================= */

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {
    const t0 = Date.now();

    const traceCtx = startTrace("ai-generate", "ai", {
      model: request.model,
      guildId: request.guildId,
      userId: request.userId,
      messageCount: request.messages.length,
    });

    // Check response cache first
    const systemPrompt = request.messages.find(m => m.role === "system")?.content || "";
    const chatMessages = request.messages.filter(m => m.role !== "system");
    const modelName = request.model || "default";

    const cached = getCachedResponse(systemPrompt, chatMessages, modelName, request.guildId, request.userId);
    if (cached) {
      logger.debug(`🧠 Cache hit — returning cached response for model=${modelName}`);
      endSpan(traceCtx.spanId);
      return {
        text: cached,
        model: modelName,
        provider: "cache",
        latencyMs: Date.now() - t0,
      };
    }

    const providers =
      this.orderedProviders();
    const orderedMs = Date.now() - t0;

    if (
      providers.length === 0
    ) {
      endSpanError(traceCtx.spanId, "No configured AI providers are available");
      throw new Error(
        "No configured AI providers are available."
      );
    }

    let lastError: unknown;

    const attemptedProviders = new Set<string>();

    /*
     * Allow enough fallback attempts to reach healthy providers.
     * The router already filters unavailable/quarantined providers,
     * so increasing this does not waste requests on disabled providers.
     */
    const maxAttempts = Math.min(providers.length, 6);
    let attempts = 0;

    logger.debug(
      `🧠 Smart router: ${providers.length} provider(s) available (ordered in ${orderedMs}ms)`
    );

    for (
      const provider of providers
    ) {
      if (attempts >= maxAttempts) {
        logger.warn(
          `🛑 Provider attempt limit reached (${maxAttempts}).`
        );
        break;
      }

      if (attemptedProviders.has(provider.name)) {
        continue;
      }

      attemptedProviders.add(provider.name);
      attempts++;

      const score =
        this.providerScore(
          provider
        );

      logger.debug(
        `🤖 Trying ${provider.name} (score ${score}ms, attempt ${attempts}/${maxAttempts})...`
      );

      const startedAt =
        Date.now();

      try {
        const response =
          await this.withTimeout(
            provider.generate(
              request
            )
          );

        const measuredLatency =
          Date.now() -
          startedAt;

        const latency =
          response.latencyMs ??
          measuredLatency;

        const saveStart = Date.now();
        this.recordSuccess(
          provider,
          latency
        );
        const saveMs = Date.now() - saveStart;

        logger.debug(
          `✅ ${provider.name} responded in ${latency}ms (saveHealth ${saveMs}ms, ordered ${orderedMs}ms)`
        );

        // Cache successful response for identical future requests
        setCachedResponse(
          systemPrompt,
          chatMessages,
          response.model || modelName,
          response.text,
          0,
          undefined,
          request.guildId,
          request.userId,
        );

        endSpan(traceCtx.spanId);
        return response;
      } catch (error) {
        lastError =
          error;

        const saveStart = Date.now();
        this.recordFailure(
          provider,
          error
        );
        const saveMs = Date.now() - saveStart;

        if (
          this.isCreditError(
            error
          )
        ) {
          logger.warn(
            `💳 ${provider.name}: credits/billing unavailable.`
          );
        } else if (
          this.isRateLimitError(
            error
          )
        ) {
          logger.warn(
            `⏳ ${provider.name}: rate limited.`
          );
        } else {
          logger.warn(
            `⚠️ ${provider.name} failed.`
          );
        }

        logger.warn(
          "➡️ Smart router switching provider..."
        );
      }
    }

    endSpanError(traceCtx.spanId, lastError instanceof Error ? lastError.message : String(lastError));
    throw new Error(
      `All AI providers failed. Last error: ${
        lastError instanceof Error
          ? lastError.message
          : String(lastError)
      }`
    );
  }

  /* =========================
     HEALTH API
  ========================= */

  getHealth() {
    return this.providers.map(
      (provider) => {
        const state =
          this.health.get(
            provider.name
          );

        const total =
          (state?.successes ?? 0) +
          (state?.failures ?? 0);

        const successRate =
          total > 0
            ? Math.round(
                (
                  (state?.successes ??
                    0) /
                  total
                ) *
                  100
              )
            : null;

        return {
          provider:
            provider.name,

          available:
            provider.isAvailable(),

          successes:
            state?.successes ?? 0,

          failures:
            state?.failures ?? 0,

          successRate,

          averageLatencyMs:
            state &&
            state.successes > 0
              ? Math.round(
                  state.totalLatencyMs /
                    state.successes
                )
              : null,

          lastLatencyMs:
            state?.lastLatencyMs ??
            null,

          score:
            this.providerScore(
              provider
            ),

          cooldownUntil:
            state?.cooldownUntil ??
            0,

          disabledUntil:
            state?.disabledUntil ??
            0,

          disabledReason:
            state?.disabledReason ??
            null,

          lastError:
            state?.lastError ??
            null,
        };
      }
    );
  }
}
