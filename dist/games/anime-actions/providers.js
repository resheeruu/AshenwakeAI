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
var providers_exports = {};
__export(providers_exports, {
  buildProviders: () => buildProviders,
  clearAnimationCache: () => clearAnimationCache,
  fetchAnimation: () => fetchAnimation,
  getAnimationCacheStats: () => getAnimationCacheStats
});
module.exports = __toCommonJS(providers_exports);
var import_lru_cache = require("lru-cache");
var import_logger = require("../../logger");
var import_media_security = require("./media-security");
var import_outbound_fetch = require("../../security/outbound-fetch");
const MAX_RESULTS_PER_ACTION = 5;
const CACHE_MAX_ENTRIES = 200;
const cache = new import_lru_cache.LRUCache({
  max: CACHE_MAX_ENTRIES,
  ttl: 30 * 60 * 1e3
});
let requestCount = 0;
let failCount = 0;
const PROVIDER_TIMEOUT_MS = 8e3;
const PROVIDER_MAX_RESPONSE_BYTES = 64 * 1024;
const PROVIDER_MAX_REDIRECTS = 3;
const MAX_ANIMATION_URL_LENGTH = 2048;
function describeFailure(error) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "TimeoutError" || name === "AbortError" || /timeout|timed out/i.test(message)) {
    return "timeout";
  }
  if (message.startsWith("Blocked")) return "blocked";
  if (/too large/i.test(message)) return "too_large";
  return "network";
}
const hardenedAnimeHttpClient = async ({ url, timeoutMs, maxBytes }) => {
  try {
    const { response } = await (0, import_outbound_fetch.hardenedFetch)(url, {
      timeoutMs,
      maxRedirects: PROVIDER_MAX_REDIRECTS,
      maxResponseBytes: maxBytes,
      policy: "public"
    });
    if (!response.ok) {
      await (0, import_outbound_fetch.readLimitedText)(response, 8 * 1024).catch(() => "");
      return { ok: false, status: response.status, body: "" };
    }
    const body = await (0, import_outbound_fetch.readLimitedText)(response, maxBytes);
    return { ok: true, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: "", failure: describeFailure(error) };
  }
};
function safeReason(reason) {
  return reason.replace(/\s+/g, "_");
}
function parseAnimationUrl(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return { error: "malformed_json" };
  }
  if (!data || typeof data !== "object") {
    return { error: "invalid_payload" };
  }
  const raw = data.url;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_ANIMATION_URL_LENGTH) {
    return { error: "invalid_payload" };
  }
  return { url: raw };
}
function interpretResponse(provider, response, startedAt) {
  const elapsedMs = Date.now() - startedAt;
  if (response.failure) {
    failCount++;
    return { provider, result: response.failure, elapsedMs, animation: null };
  }
  if (!response.ok) {
    failCount++;
    return {
      provider,
      result: `http_${response.status || "unknown"}`,
      status: response.status,
      elapsedMs,
      animation: null
    };
  }
  const parsed = parseAnimationUrl(response.body);
  if ("error" in parsed) {
    failCount++;
    return {
      provider,
      result: parsed.error,
      status: response.status,
      elapsedMs,
      animation: null
    };
  }
  const validation = (0, import_media_security.validateMediaUrl)(parsed.url);
  if (!validation.ok) {
    failCount++;
    return {
      provider,
      result: "invalid_url",
      status: response.status,
      detail: safeReason(validation.error ?? "unknown"),
      elapsedMs,
      animation: null
    };
  }
  return {
    provider,
    result: "success",
    status: response.status,
    elapsedMs,
    animation: { url: parsed.url, source: provider }
  };
}
class GifukaiProvider {
  constructor(http) {
    this.http = http;
  }
  http;
  name = "gifukai";
  baseUrl = "https://api.gifukai.com";
  async fetch(action) {
    const startedAt = Date.now();
    requestCount++;
    const response = await this.http({
      url: `${this.baseUrl}/${action}`,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      maxBytes: PROVIDER_MAX_RESPONSE_BYTES
    });
    return interpretResponse(this.name, response, startedAt);
  }
}
class OtakuGifsProvider {
  constructor(http) {
    this.http = http;
  }
  http;
  name = "otakugifs";
  baseUrl = "https://api.otakugifs.xyz";
  async fetch(action) {
    const startedAt = Date.now();
    requestCount++;
    const response = await this.http({
      url: `${this.baseUrl}/gif?reaction=${encodeURIComponent(action)}`,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      maxBytes: PROVIDER_MAX_RESPONSE_BYTES
    });
    return interpretResponse(this.name, response, startedAt);
  }
}
function buildProviders(http = hardenedAnimeHttpClient) {
  return [new GifukaiProvider(http), new OtakuGifsProvider(http)];
}
function logAttempt(action, attempt, fallback) {
  const status = attempt.status !== void 0 ? ` status=${attempt.status}` : "";
  if (attempt.result === "success") {
    import_logger.logger.info(
      `anime_action action=${action} provider=${attempt.provider} result=success${status} elapsed=${attempt.elapsedMs}ms`
    );
    return;
  }
  const detail = attempt.detail ? ` detail=${attempt.detail}` : "";
  import_logger.logger.info(
    `anime_action action=${action} provider=${attempt.provider} result=${attempt.result}${status}${detail} elapsed=${attempt.elapsedMs}ms fallback=${fallback}`
  );
}
async function fetchAnimation(action, options = {}) {
  const cacheKey = `anime:${action}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.urls.length > 0) {
    const idx = Math.floor(Math.random() * cached.urls.length);
    import_logger.logger.debug(
      `anime_action action=${action} provider=cache source=${cached.source} result=cache_hit elapsed=0ms`
    );
    return { url: cached.urls[idx], source: cached.source };
  }
  const providers = buildProviders(options.httpClient ?? hardenedAnimeHttpClient);
  const startedAt = Date.now();
  const collectedUrls = [];
  let source = "none";
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const fallback = providers[i + 1]?.name ?? "text";
    const attempt = await provider.fetch(action);
    logAttempt(action, attempt, fallback);
    if (attempt.animation) {
      collectedUrls.push(attempt.animation.url);
      source = attempt.provider;
      if (collectedUrls.length >= MAX_RESULTS_PER_ACTION) break;
    }
  }
  if (collectedUrls.length > 0) {
    const unique = [...new Set(collectedUrls)];
    cache.set(cacheKey, { urls: unique, source, timestamp: Date.now() });
    const idx = Math.floor(Math.random() * unique.length);
    return { url: unique[idx], source };
  }
  import_logger.logger.warn(
    `anime_action action=${action} provider=none result=text_fallback elapsed=${Date.now() - startedAt}ms fallback=text`
  );
  return null;
}
function clearAnimationCache() {
  cache.clear();
}
function getAnimationCacheStats() {
  return { size: cache.size, max: CACHE_MAX_ENTRIES, requests: requestCount, failures: failCount };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildProviders,
  clearAnimationCache,
  fetchAnimation,
  getAnimationCacheStats
});
