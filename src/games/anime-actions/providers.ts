/* ================================================================
 * ANIME ANIMATION PROVIDER
 *
 * Provider abstraction for anime GIF retrieval with variety.
 * Fallback chain: cache -> Gifukai API -> OtakuGIFs API -> text-only.
 * Each action stores multiple results for variety.
 *
 * All outbound HTTP goes through the canonical hardened fetch
 * (src/security/outbound-fetch.ts) — provider APIs get the same URL,
 * DNS, redirect, timeout and size enforcement as every other
 * server-side request. Raw fetch() is never used here.
 *
 * Every provider attempt is logged for operators, e.g.
 *   anime_action action=kill provider=gifukai result=timeout elapsed=8000ms fallback=otakugifs
 * Secrets are never logged.
 * ================================================================ */

import { LRUCache } from "lru-cache";
import { logger } from "../../logger";
import { validateMediaUrl } from "./media-security";
import { hardenedFetch, readLimitedText } from "../../security/outbound-fetch";

export interface AnimationResult {
  url: string;
  source: string;
}

interface CacheEntry {
  urls: string[];
  source: string;
  timestamp: number;
}

/* ================================================================
 * CACHE — stores multiple URLs per action for variety
 * ================================================================ */

const MAX_RESULTS_PER_ACTION = 5;
const CACHE_MAX_ENTRIES = 200;
const cache = new LRUCache<string, CacheEntry>({
  max: CACHE_MAX_ENTRIES,
  ttl: 30 * 60 * 1000,
});

let requestCount = 0;
let failCount = 0;

/** Bounded provider timeout — a hung provider must never hang Discord. */
const PROVIDER_TIMEOUT_MS = 8_000;
/** Provider metadata responses are tiny JSON documents. */
const PROVIDER_MAX_RESPONSE_BYTES = 64 * 1024;
/** Bounded redirects for provider endpoints. */
const PROVIDER_MAX_REDIRECTS = 3;
/** Longest animation URL we are willing to consider. */
const MAX_ANIMATION_URL_LENGTH = 2048;

/* ================================================================
 * TRANSPORT SEAM
 *
 * The default implementation is the hardened outbound boundary.
 * Tests inject a deterministic client so provider behaviour can be
 * verified without any third-party uptime dependency.
 * ================================================================ */

export type AnimeHttpFailure = "timeout" | "network" | "blocked" | "too_large";

export interface AnimeHttpRequest {
  url: string;
  timeoutMs: number;
  maxBytes: number;
}

export interface AnimeHttpResponse {
  ok: boolean;
  /** HTTP status, or 0 when the request never completed. */
  status: number;
  body: string;
  failure?: AnimeHttpFailure;
}

export type AnimeHttpClient = (request: AnimeHttpRequest) => Promise<AnimeHttpResponse>;

function describeFailure(error: unknown): AnimeHttpFailure {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);

  if (name === "TimeoutError" || name === "AbortError" || /timeout|timed out/i.test(message)) {
    return "timeout";
  }
  if (message.startsWith("Blocked")) return "blocked";
  if (/too large/i.test(message)) return "too_large";
  return "network";
}

const hardenedAnimeHttpClient: AnimeHttpClient = async ({ url, timeoutMs, maxBytes }) => {
  try {
    const { response } = await hardenedFetch(url, {
      timeoutMs,
      maxRedirects: PROVIDER_MAX_REDIRECTS,
      maxResponseBytes: maxBytes,
      policy: "public",
    });

    if (!response.ok) {
      // Drain (bounded) so the pooled socket can be reused.
      await readLimitedText(response, 8 * 1024).catch(() => "");
      return { ok: false, status: response.status, body: "" };
    }

    const body = await readLimitedText(response, maxBytes);
    return { ok: true, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: "", failure: describeFailure(error) };
  }
};

/* ================================================================
 * PROVIDER RESULT
 * ================================================================ */

/**
 * `result` values (used verbatim in operator logs):
 *   success | timeout | network | blocked | too_large |
 *   http_<status> | malformed_json | invalid_payload | invalid_url
 */
export interface ProviderAttempt {
  provider: string;
  result: string;
  status?: number;
  detail?: string;
  elapsedMs: number;
  animation: AnimationResult | null;
}

interface AnimeProvider {
  name: string;
  fetch(action: string): Promise<ProviderAttempt>;
}

/* ================================================================
 * SAFE PARSING / VALIDATION
 * ================================================================ */

function safeReason(reason: string): string {
  return reason.replace(/\s+/g, "_");
}

function parseAnimationUrl(body: string): { url: string } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return { error: "malformed_json" };
  }

  if (!data || typeof data !== "object") {
    return { error: "invalid_payload" };
  }

  const raw = (data as { url?: unknown }).url;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_ANIMATION_URL_LENGTH) {
    return { error: "invalid_payload" };
  }

  return { url: raw };
}

function interpretResponse(
  provider: string,
  response: AnimeHttpResponse,
  startedAt: number,
): ProviderAttempt {
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
      animation: null,
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
      animation: null,
    };
  }

  const validation = validateMediaUrl(parsed.url);
  if (!validation.ok) {
    failCount++;
    return {
      provider,
      result: "invalid_url",
      status: response.status,
      detail: safeReason(validation.error ?? "unknown"),
      elapsedMs,
      animation: null,
    };
  }

  return {
    provider,
    result: "success",
    status: response.status,
    elapsedMs,
    animation: { url: parsed.url, source: provider },
  };
}

/* ================================================================
 * GIFUKAI PROVIDER
 *
 * API: https://api.gifukai.com/{action}
 * Returns: { action, pairing, anime, url, ... }
 * No API key required. Free, open source.
 * ================================================================ */

class GifukaiProvider implements AnimeProvider {
  name = "gifukai";
  private baseUrl = "https://api.gifukai.com";

  constructor(private readonly http: AnimeHttpClient) {}

  async fetch(action: string): Promise<ProviderAttempt> {
    const startedAt = Date.now();
    requestCount++;

    const response = await this.http({
      url: `${this.baseUrl}/${action}`,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      maxBytes: PROVIDER_MAX_RESPONSE_BYTES,
    });

    return interpretResponse(this.name, response, startedAt);
  }
}

/* ================================================================
 * OTAKUGIFS PROVIDER
 *
 * API: https://api.otakugifs.xyz/gif?reaction={action}
 * Returns: { url: "https://cdn.otakugifs.xyz/..." }
 * No API key required.
 * ================================================================ */

class OtakuGifsProvider implements AnimeProvider {
  name = "otakugifs";
  private baseUrl = "https://api.otakugifs.xyz";

  constructor(private readonly http: AnimeHttpClient) {}

  async fetch(action: string): Promise<ProviderAttempt> {
    const startedAt = Date.now();
    requestCount++;

    const response = await this.http({
      url: `${this.baseUrl}/gif?reaction=${encodeURIComponent(action)}`,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      maxBytes: PROVIDER_MAX_RESPONSE_BYTES,
    });

    return interpretResponse(this.name, response, startedAt);
  }
}

/* ================================================================
 * PROVIDER CHAIN
 * ================================================================ */

export function buildProviders(http: AnimeHttpClient = hardenedAnimeHttpClient): AnimeProvider[] {
  return [new GifukaiProvider(http), new OtakuGifsProvider(http)];
}

function logAttempt(action: string, attempt: ProviderAttempt, fallback: string): void {
  const status = attempt.status !== undefined ? ` status=${attempt.status}` : "";

  if (attempt.result === "success") {
    logger.info(
      `anime_action action=${action} provider=${attempt.provider} result=success${status} elapsed=${attempt.elapsedMs}ms`,
    );
    return;
  }

  const detail = attempt.detail ? ` detail=${attempt.detail}` : "";
  logger.info(
    `anime_action action=${action} provider=${attempt.provider} result=${attempt.result}${status}${detail} elapsed=${attempt.elapsedMs}ms fallback=${fallback}`,
  );
}

export interface FetchAnimationOptions {
  /** Deterministic transport override (tests). Defaults to the hardened boundary. */
  httpClient?: AnimeHttpClient;
}

export async function fetchAnimation(
  action: string,
  options: FetchAnimationOptions = {},
): Promise<AnimationResult | null> {
  const cacheKey = `anime:${action}`;
  const cached = cache.get(cacheKey);

  // Return a random URL from the cached pool for variety
  if (cached && cached.urls.length > 0) {
    const idx = Math.floor(Math.random() * cached.urls.length);
    logger.debug(
      `anime_action action=${action} provider=cache source=${cached.source} result=cache_hit elapsed=0ms`,
    );
    return { url: cached.urls[idx], source: cached.source };
  }

  const providers = buildProviders(options.httpClient ?? hardenedAnimeHttpClient);
  const startedAt = Date.now();

  // Fetch from providers and collect results
  const collectedUrls: string[] = [];
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

  /*
   * Every provider failed. The engine still returns a deterministic
   * text response — Discord must never receive an empty reply.
   */
  logger.warn(
    `anime_action action=${action} provider=none result=text_fallback elapsed=${Date.now() - startedAt}ms fallback=text`,
  );
  return null;
}

export function clearAnimationCache(): void {
  cache.clear();
}

export function getAnimationCacheStats(): { size: number; max: number; requests: number; failures: number } {
  return { size: cache.size, max: CACHE_MAX_ENTRIES, requests: requestCount, failures: failCount };
}
