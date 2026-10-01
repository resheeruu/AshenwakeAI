/* ================================================================
 * ANIME ANIMATION PROVIDER
 *
 * Provider abstraction for anime GIF retrieval with variety.
 * Fallback chain: PROVIDER FIRST -> remote provider -> download -> validate -> cache locally -> Discord
 * Local results are served from the shared local media index
 * (src/media/local-gifs.ts) ONLY as a fallback when all providers fail.
 * Each remote action stores multiple results for variety.
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
import * as crypto from "node:crypto";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { logger } from "../../logger";
import { validateMediaUrl } from "./media-security";
import { hardenedFetch, readLimitedText } from "../../security/outbound-fetch";
import { resolveLocalGif, type LocalGifAsset, initializeLocalGifs } from "../../media/local-gifs";
import { config } from "../../config/env";
import { getDataDir } from "../../config/data-dir";

/** Configuration for remote provider fallback behavior */
const ALLOW_REMOTE_FALLBACK = process.env.MEDIA_ALLOW_REMOTE_FALLBACK !== "false";

export interface AnimationResult {
  /** Remote animation URL (absent for local-only results). */
  url?: string;
  /** Validated local media asset (absent for remote results). */
  localAsset?: LocalGifAsset;
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

/** Provider health tracking */
interface ProviderHealth {
  name: string;
  requestAttempts: number;
  successfulDownloads: number;
  failedDownloads: number;
  /** Provider request timeouts (no usable response in time). */
  timeouts: number;
  /** Responses rejected as invalid (bad JSON, bad payload, bad URL). */
  invalidMedia: number;
  /** GIF download failures after a candidate URL was accepted. */
  downloadFailures: number;
  /** Successful download → validate → cache writes. */
  cacheSuccesses: number;
  /** Cumulative provider latency for averaging. */
  totalLatencyMs: number;
  lastAttempt: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  status: "unknown" | "working" | "degraded" | "failed";
}

const providerHealth = new Map<string, ProviderHealth>();

function updateProviderHealth(name: string, update: Partial<ProviderHealth>): void {
  const existing = providerHealth.get(name) || { name, requestAttempts: 0, successfulDownloads: 0, failedDownloads: 0, timeouts: 0, invalidMedia: 0, downloadFailures: 0, cacheSuccesses: 0, totalLatencyMs: 0, lastAttempt: 0, lastSuccess: null, lastFailure: null, status: "unknown" };
  providerHealth.set(name, { ...existing, ...update });
}

export function getProviderHealth(): ProviderHealth[] {
  return [...providerHealth.values()];
}

export function resetProviderHealth(): void {
  providerHealth.clear();
  circuitState.clear();
}

/* ================================================================
 * CIRCUIT BREAKER — a repeatedly failing provider is deprioritized
 * for a cooldown window instead of consuming the media deadline on
 * every request. Never permanent: after cooldown the provider is
 * probed again. Live verification showed all anime GIF APIs apply
 * short-window burst rate limiting, so this is load-bearing.
 * ================================================================ */

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;

interface CircuitEntry {
  consecutiveFailures: number;
  cooledUntil: number;
}

const circuitState = new Map<string, CircuitEntry>();

function circuitOpen(name: string): boolean {
  const entry = circuitState.get(name);
  // No cooldown timestamp means no cooldown was ever set — never open.
  // (cooledUntil is 0 until the failure threshold trips it.)
  if (!entry || entry.cooledUntil <= 0) return false;
  if (Date.now() >= entry.cooledUntil) {
    // Cooldown expired — allow a fresh probe.
    circuitState.delete(name);
    return false;
  }
  return true;
}

function recordCircuitFailure(name: string): void {
  const entry = circuitState.get(name) ?? { consecutiveFailures: 0, cooledUntil: 0 };
  entry.consecutiveFailures += 1;
  if (entry.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    entry.cooledUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    logger.warn(
      `anime_action provider=${name} result=circuit_open consecutive_failures=${entry.consecutiveFailures} cooldown_ms=${CIRCUIT_COOLDOWN_MS}`,
    );
  }
  circuitState.set(name, entry);
}

function recordCircuitSuccess(name: string): void {
  circuitState.delete(name);
}

/** Bounded provider timeout — a hung provider must never hang Discord. */
const PROVIDER_TIMEOUT_MS = 8_000;
/** Provider metadata responses are tiny JSON documents. */
const PROVIDER_MAX_RESPONSE_BYTES = 64 * 1024;
/** Bounded redirects for provider endpoints. */
const PROVIDER_MAX_REDIRECTS = 3;
/** Longest animation URL we are willing to consider. */
const MAX_ANIMATION_URL_LENGTH = 2048;
/** Global deadline for the entire media operation (provider lookup + fetch + validation). */
const MEDIA_GLOBAL_DEADLINE_MS = 12_000;

/* ================================================================
 * LOCAL CACHE MANAGEMENT
 * ================================================================ */

const LOCAL_MEDIA_ROOT = path.join(getDataDir(), "anime-gifs", "actions");

async function ensureLocalMediaDir(mediaKey: string): Promise<string> {
  const dir = path.join(LOCAL_MEDIA_ROOT, mediaKey);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function getLocalAssetHashes(mediaKey: string): Promise<Set<string>> {
  try {
    const dir = path.join(LOCAL_MEDIA_ROOT, mediaKey);
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const hashes = new Set<string>();
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".gif")) {
        const filePath = path.join(LOCAL_MEDIA_ROOT, mediaKey, entry.name);
        const buffer = await fsp.readFile(filePath);
        const hash = crypto.createHash("sha256").update(buffer).digest("hex");
        hashes.add(hash);
      }
    }
    return hashes;
  } catch {
    return new Set();
  }
}

async function downloadAndCacheRemoteGif(
  url: string,
  mediaKey: string,
  sourceProvider: string,
): Promise<{ asset: LocalGifAsset; filePath: string } | null> {
  const startedAt = Date.now();

  // 1. Download with hardened fetch
  const downloadResult = await hardenedFetch(url, {
    timeoutMs: 15_000,
    maxRedirects: 3,
    maxResponseBytes: 10 * 1024 * 1024,
    policy: "public",
  });

  if (!downloadResult.response.ok) {
    logger.warn(`anime_action provider=${sourceProvider} result=http_${downloadResult.response.status} url=${url}`);
    const prev = providerHealth.get(sourceProvider);
    updateProviderHealth(sourceProvider, { downloadFailures: (prev?.downloadFailures || 0) + 1 });
    return null;
  }

  const buffer = Buffer.from(await downloadResult.response.arrayBuffer());

  // 2. Validate GIF
  if (buffer.length < 10) {
    logger.warn(`anime_action provider=download result=invalid size=${buffer.length} url=${url}`);
    const prev = providerHealth.get(sourceProvider);
    updateProviderHealth(sourceProvider, { downloadFailures: (prev?.downloadFailures || 0) + 1 });
    return null;
  }

  const sig = buffer.toString("latin1", 0, 6);
  if (sig !== "GIF87a" && sig !== "GIF89a") {
    logger.warn(`anime_action provider=download result=invalid_signature url=${url}`);
    const prev = providerHealth.get(sourceProvider);
    updateProviderHealth(sourceProvider, { downloadFailures: (prev?.downloadFailures || 0) + 1 });
    return null;
  }

  if (buffer.length > 8 * 1024 * 1024) {
    logger.warn(`anime_action provider=download result=too_large size=${buffer.length} url=${url}`);
    const prev = providerHealth.get(sourceProvider);
    updateProviderHealth(sourceProvider, { downloadFailures: (prev?.downloadFailures || 0) + 1 });
    return null;
  }

  // 3. Calculate SHA-256
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  logger.info(
    `anime_action provider=${sourceProvider} action=${mediaKey} stage=download sha256=${hash.slice(0,16)}... bytes=${buffer.length} elapsedMs=${Date.now() - startedAt}`
  );

  // 4. Check for duplicates
  const existingHashes = await getLocalAssetHashes(mediaKey);
  if (existingHashes.has(hash)) {
    logger.info(`anime_action mediaKey=${mediaKey} result=duplicate sha256=${hash.slice(0,16)}... skipped=true`);
    return null;
  }

  // 5. Save atomically (never overwrite an existing file: probe for
  // a free sequential name so gapped numbering cannot collide).
  const dir = await ensureLocalMediaDir(mediaKey);
  const existingNames = new Set(await fsp.readdir(dir).catch(() => [] as string[]));
  let nextIndex = existingNames.size + 1;
  let fileName = `${path.basename(mediaKey)}-${String(nextIndex).padStart(3, "0")}.gif`;
  while (existingNames.has(fileName) && nextIndex < 100000) {
    nextIndex++;
    fileName = `${path.basename(mediaKey)}-${String(nextIndex).padStart(3, "0")}.gif`;
  }
  const filePath = path.join(dir, fileName);
  const tmpPath = `${filePath}.tmp-${process.pid}`;

  try {
    await fsp.writeFile(tmpPath, buffer);
    await fsp.rename(tmpPath, filePath);
  } catch (error) {
    await fsp.unlink(tmpPath).catch(() => {});
    logger.warn(`anime_action mediaKey=${mediaKey} result=save_failed error=${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  // 6. Verify the saved file
  const verifyBuffer = await fsp.readFile(filePath);
  const verifyHash = crypto.createHash("sha256").update(verifyBuffer).digest("hex");
  if (verifyHash !== hash) {
    await fsp.unlink(filePath).catch(() => {});
    logger.warn(`anime_action mediaKey=${mediaKey} result=verification_failed`);
    return null;
  }

  const stats = await fsp.stat(filePath);

  // 7. Create asset record
  const relPath = path.relative(path.join(getDataDir(), "anime-gifs"), filePath).split(path.sep).join("/");
  const asset: LocalGifAsset = {
    key: `actions:${path.basename(mediaKey)}`,
    root: path.join(getDataDir(), "anime-gifs"),
    relPath,
    sizeBytes: stats.size,
    license: "remote-cached",
    source: "remote-cache",
    sourceUrl: url,
  };

  logger.info(
    `DISCORD_MEDIA_SEND_STARTED action=${mediaKey} source=${sourceProvider} sha256=${hash.slice(0,16)}... bytes=${stats.size} contentType=image/gif`
  );

  const prevCache = providerHealth.get(sourceProvider);
  updateProviderHealth(sourceProvider, { cacheSuccesses: (prevCache?.cacheSuccesses || 0) + 1 });

  logger.info(
    `anime_action mediaKey=${mediaKey} result=cached sha256=${hash.slice(0,16)}... size=${stats.size} source=${path.basename(mediaKey)} provider=${sourceProvider} elapsed=${Date.now() - startedAt}ms`
  );

  return { asset, filePath };
}

async function cacheRemoteGifLocally(
  url: string,
  mediaKey: string,
  sourceProvider: string,
): Promise<{ asset: LocalGifAsset; filePath: string } | null> {
  // Check if already cached
  const existingHashes = await getLocalAssetHashes(mediaKey);

  // Quick check - if we have 20+ assets for this key, don't cache more
  if ((await fsp.readdir(path.join(LOCAL_MEDIA_ROOT, mediaKey)).catch(() => [])).length >= 20) {
    return null;
  }

return downloadAndCacheRemoteGif(url, mediaKey, sourceProvider);
}

/** Merge a validated remote URL into the per-mediaKey URL pool. */
function rememberRemoteUrl(cacheKey: string, url: string, source: string): void {
  const existing = cache.get(cacheKey);
  const urls = [...new Set([...(existing?.urls ?? []), url])];
  cache.set(cacheKey, { urls, source, timestamp: Date.now() });
}

/* ================================================================
 * TRANSPORT SEAM
 * ================================================================
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
  signal?: AbortSignal;
  /** Per-provider headers (e.g. identifying User-Agent required by some APIs). */
  headers?: Record<string, string>;
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

const hardenedAnimeHttpClient: AnimeHttpClient = async ({ url, timeoutMs, maxBytes, signal, headers }) => {
  try {
    const { response } = await hardenedFetch(url, {
      timeoutMs,
      maxRedirects: PROVIDER_MAX_REDIRECTS,
      maxResponseBytes: maxBytes,
      policy: "public",
      signal,
      headers,
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

/** PurrBot shape: { link: "https://cdn.purrbot.site/...", error: false, ... } */
function parseLinkUrl(body: string): { url: string } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return { error: "malformed_json" };
  }

  if (!data || typeof data !== "object") {
    return { error: "invalid_payload" };
  }

  const rec = data as { link?: unknown; error?: unknown };
  if (rec.error === true) {
    return { error: "invalid_payload" };
  }

  if (typeof rec.link !== "string" || rec.link.length === 0 || rec.link.length > MAX_ANIMATION_URL_LENGTH) {
    return { error: "invalid_payload" };
  }

  return { url: rec.link };
}

/** NekosBest shape: { results: [{ url, anime_name, ... }] } */
function parseResultsUrl(body: string): { url: string } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return { error: "malformed_json" };
  }

  if (!data || typeof data !== "object") {
    return { error: "invalid_payload" };
  }

  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) {
    return { error: "invalid_payload" };
  }

  const raw = (results[0] as { url?: unknown } | null)?.url;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_ANIMATION_URL_LENGTH) {
    return { error: "invalid_payload" };
  }

  return { url: raw };
}

function interpretResponse(
  provider: string,
  response: AnimeHttpResponse,
  startedAt: number,
  parse: (body: string) => { url: string } | { error: string } = parseAnimationUrl,
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

  const parsed = parse(response.body);
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
 * NEKOSBEST PROVIDER
 *
 * API: https://nekos.best/api/v2/{category}
 * Returns: { results: [{ anime_name, url, dimensions }] }
 * No API key required. Requires an identifying User-Agent
 * (documented at docs.nekos.best; generic Mozilla UAs get 403).
 * Live-verified 2026-09-29: hug + pat return real GIF URLs that
 * download, validate, and cache. Short-window burst rate limiting
 * observed (recovers after cooldown — circuit breaker covers this).
 *
 * Terms: free bot API, no redistribution grant located.
 * Classification: PROVIDER_CACHE (not licensed production).
 * ================================================================ */

/** Ash Action → NekosBest category. Same-word only, except the
 * documented headpat→pat alias (a headpat IS a pat; providers
 * without a headpat category serve pat GIFs for headpat actions). */
const NEKOSBEST_CATEGORIES: Record<string, string> = {
  hug: "hug",
  cuddle: "cuddle",
  pat: "pat",
  headpat: "pat", // explicit alias: no headpat category upstream
  kiss: "kiss",
  bite: "bite",
  bonk: "bonk",
  punch: "punch",
  kick: "kick",
  slap: "slap",
  shoot: "shoot",
  yeet: "yeet",
  poke: "poke",
  wave: "wave",
  highfive: "highfive",
  dance: "dance",
  laugh: "laugh",
  cry: "cry",
  blush: "blush",
  smug: "smug",
  sleep: "sleep",
};

class NekosBestProvider implements AnimeProvider {
  name = "nekosbest";
  private baseUrl = "https://nekos.best/api/v2";

  constructor(private readonly http: AnimeHttpClient) {}

  async fetch(action: string): Promise<ProviderAttempt> {
    const startedAt = Date.now();
    requestCount++;

    const category = NEKOSBEST_CATEGORIES[action];
    if (!category) {
      return { provider: this.name, result: "unsupported_action", elapsedMs: Date.now() - startedAt, animation: null };
    }

    const response = await this.http({
      url: `${this.baseUrl}/${encodeURIComponent(category)}`,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      maxBytes: PROVIDER_MAX_RESPONSE_BYTES,
      headers: { "User-Agent": "AshenAI/1.0" },
    });

    return interpretResponse(this.name, response, startedAt, parseResultsUrl);
  }
}

/* ================================================================
 * PURRBOT PROVIDER (v2 API — v1 is deprecated upstream)
 *
 * API: https://api.purrbot.site/v2/img/sfw/{category}/gif
 * Returns: { link: "https://cdn.purrbot.site/...", error: false }
 * No API key required.
 * Live-verified 2026-09-29 (HTTP 200 + real GIF URLs): hug, pat,
 * cry, kiss, slap, dance, cuddle, bite, blush, poke. Other
 * categories return HTTP 403 (no such category) and are NOT mapped.
 *
 * Terms: free bot API, no redistribution grant located.
 * Classification: PROVIDER_CACHE (not licensed production).
 * ================================================================ */

const PURRBOT_CATEGORIES: Record<string, string> = {
  hug: "hug",
  cuddle: "cuddle",
  pat: "pat",
  headpat: "pat", // explicit alias: no headpat category upstream
  kiss: "kiss",
  bite: "bite",
  slap: "slap",
  poke: "poke",
  dance: "dance",
  cry: "cry",
  blush: "blush",
};

class PurrBotProvider implements AnimeProvider {
  name = "purrbot";
  private baseUrl = "https://api.purrbot.site/v2/img/sfw";

  constructor(private readonly http: AnimeHttpClient) {}

  async fetch(action: string): Promise<ProviderAttempt> {
    const startedAt = Date.now();
    requestCount++;

    const category = PURRBOT_CATEGORIES[action];
    if (!category) {
      return { provider: this.name, result: "unsupported_action", elapsedMs: Date.now() - startedAt, animation: null };
    }

    const response = await this.http({
      url: `${this.baseUrl}/${encodeURIComponent(category)}/gif`,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      maxBytes: PROVIDER_MAX_RESPONSE_BYTES,
    });

    return interpretResponse(this.name, response, startedAt, parseLinkUrl);
  }
}

/* ================================================================
 * NEKOS.LIFE PROVIDER
 *
 * API: https://nekos.life/api/v2/img/{category}
 * Returns: { url: "https://cdn.nekos.life/..." }
 * No API key required.
 * Live-verified 2026-09-29: hug returns real GIF URLs that
 * download (GIF89a) and validate. Intermittent under burst
 * traffic (recovers after cooldown — circuit breaker covers this).
 * kiss/slap/punch/pat/cry are documented classic categories;
 * mapped but subject to live verification in the matrix.
 *
 * Terms: free bot API, no redistribution grant located.
 * Classification: PROVIDER_CACHE (not licensed production).
 * ================================================================ */

const NEKOSLIFE_CATEGORIES: Record<string, string> = {
  hug: "hug",
  pat: "pat",
  headpat: "pat", // explicit alias: no headpat category upstream
  kiss: "kiss",
  slap: "slap",
  punch: "punch",
  cry: "cry",
};

class NekosLifeProvider implements AnimeProvider {
  name = "nekoslife";
  private baseUrl = "https://nekos.life/api/v2/img";

  constructor(private readonly http: AnimeHttpClient) {}

  async fetch(action: string): Promise<ProviderAttempt> {
    const startedAt = Date.now();
    requestCount++;

    const category = NEKOSLIFE_CATEGORIES[action];
    if (!category) {
      return { provider: this.name, result: "unsupported_action", elapsedMs: Date.now() - startedAt, animation: null };
    }

    const response = await this.http({
      url: `${this.baseUrl}/${encodeURIComponent(category)}`,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      maxBytes: PROVIDER_MAX_RESPONSE_BYTES,
    });

    return interpretResponse(this.name, response, startedAt);
  }
}

/* ================================================================
 * PROVIDER CHAIN
 * ================================================================ */

/* ================================================================
 * PROVIDER CHAIN (deterministic priority)
 *
 * Order reflects live verification (availability, coverage,
 * latency, stability):
 *   1. gifukai   — widest coverage (only kill source), fast
 *   2. otakugifs — broad coverage, stable
 *   3. nekosbest — wide categories + anime_name metadata, needs UA
 *   4. purrbot    — 10 verified categories, stable
 *   5. nekoslife  — narrower, intermittent under burst (last)
 * then local cache fallback, then text fallback.
 * ================================================================ */

export function buildProviders(http: AnimeHttpClient = hardenedAnimeHttpClient): AnimeProvider[] {
  return [
    new GifukaiProvider(http),
    new OtakuGifsProvider(http),
    new NekosBestProvider(http),
    new PurrBotProvider(http),
    new NekosLifeProvider(http),
  ];
}

function logAttempt(action: string, attempt: ProviderAttempt, fallback: string): void {
  const status = attempt.status !== undefined ? ` status=${attempt.status}` : "";
  const shaInfo = attempt.animation?.url ? ` sha256=pending` : "";

  // Update provider health
  const prev = providerHealth.get(attempt.provider);
  const healthUpdate: Partial<ProviderHealth> = {
    name: attempt.provider,
    requestAttempts: (prev?.requestAttempts || 0) + 1,
    totalLatencyMs: (prev?.totalLatencyMs || 0) + attempt.elapsedMs,
    lastAttempt: Date.now(),
  };

  if (attempt.result === "success") {
    healthUpdate.successfulDownloads = (prev?.successfulDownloads || 0) + 1;
    healthUpdate.lastSuccess = Date.now();
    healthUpdate.status = "working";
    recordCircuitSuccess(attempt.provider);

    logger.info(
      `anime_action action=${action} provider=${attempt.provider} result=success${status} elapsed=${attempt.elapsedMs}ms${shaInfo}`,
    );
  } else {
    // unsupported_action is a mapping skip, not an outage: it must
    // never trip the circuit breaker or pollute failure health.
    if (attempt.result === "unsupported_action") {
      const detail = attempt.detail ? ` detail=${attempt.detail}` : "";
      logger.debug(
        `anime_action action=${action} provider=${attempt.provider} result=unsupported_action${detail} elapsed=${attempt.elapsedMs}ms fallback=${fallback}`,
      );
      updateProviderHealth(attempt.provider, healthUpdate);
      return;
    }
    healthUpdate.failedDownloads = (prev?.failedDownloads || 0) + 1;
    healthUpdate.lastFailure = Date.now();
    if (attempt.result === "timeout") {
      healthUpdate.timeouts = (prev?.timeouts || 0) + 1;
    }
    if (
      attempt.result === "malformed_json" ||
      attempt.result === "invalid_payload" ||
      attempt.result === "invalid_url"
    ) {
      healthUpdate.invalidMedia = (prev?.invalidMedia || 0) + 1;
    }
    const attempts = healthUpdate.requestAttempts || 0;
    const successes = prev?.successfulDownloads || 0;
    if (attempts >= 3 && successes === 0) {
      healthUpdate.status = "failed";
    } else if ((prev?.failedDownloads || 0) + 1 >= 2) {
      healthUpdate.status = "degraded";
    }
    recordCircuitFailure(attempt.provider);

    const detail = attempt.detail ? ` detail=${attempt.detail}` : "";
    logger.info(
      `anime_action action=${action} provider=${attempt.provider} result=${attempt.result}${status}${detail} elapsed=${attempt.elapsedMs}ms fallback=${fallback}`,
    );
  }

  updateProviderHealth(attempt.provider, healthUpdate);
}

/** Deterministic local media resolver (same shape as resolveLocalGif). */
export interface LocalGifSource {
  resolve(key: string): Promise<LocalGifAsset | null>;
}

export interface FetchAnimationOptions {
  /** Deterministic transport override (tests). Defaults to the hardened boundary. */
  httpClient?: AnimeHttpClient;
  /**
   * Local provider override.
   *  - undefined → shared singleton local provider (default)
   *  - null      → local lookup disabled (remote-chain tests)
   *  - object    → injected resolver (deterministic tests)
   */
  localGifs?: LocalGifSource | null;
}

export async function fetchAnimation(
  action: string,
  options: FetchAnimationOptions = {},
): Promise<AnimationResult | null> {
  const ac = new AbortController();
  const deadline = setTimeout(() => ac.abort(), MEDIA_GLOBAL_DEADLINE_MS);
  const mediaKey = action;
  const startedAt = Date.now();

  try {
    // 1) LOCAL CACHE FIRST — check local filesystem before any provider calls
    // This ensures cached media works even when providers are unavailable
    if (ALLOW_REMOTE_FALLBACK && options.localGifs !== null) {
      try {
        const resolver = options.localGifs?.resolve ?? resolveLocalGif;
        const local = await resolver(`actions:${action}`);
        if (local) {
          logger.info(
            `ANIME_MEDIA_CACHE_HIT action=${action} provider=local license=${local.license} elapsed=${Date.now() - startedAt}ms`
          );
          return { localAsset: local, source: "local" };
        }
      } catch (error) {
        // Local provider failure must never break the chain.
        logger.warn(
          `anime_action action=${action} provider=local result=local_error detail=${error instanceof Error ? error.message : "unknown"} fallback=provider`
        );
      }
    }

    // 2) REMOTE URL CACHE — validated remote URLs survive local-cache
    // failures and short-circuit the provider chain (zero HTTP on hit).
    const cacheKey = `anime:${action}`;
    const cachedUrl = cache.get(cacheKey);
    if (cachedUrl && cachedUrl.urls.length > 0) {
      const idx = Math.floor(Math.random() * cachedUrl.urls.length);
      logger.debug(
        `anime_action action=${action} provider=cache source=${cachedUrl.source} result=cache_hit elapsed=0ms`,
      );
      return { url: cachedUrl.urls[idx], source: cachedUrl.source };
    }

    // 3) REMOTE PROVIDER CHAIN — fetch, download, validate, cache locally
    const httpClient = options.httpClient ?? ((req: AnimeHttpRequest) => hardenedAnimeHttpClient({ ...req, signal: ac.signal }));
    const providers = buildProviders(httpClient);
    const providerChainStartedAt = Date.now();

    for (let i = 0; i < providers.length; i++) {
      if (ac.signal.aborted) break;
      const provider = providers[i];
      const fallback = providers[i + 1]?.name ?? "local";

      // Circuit breaker: skip a repeatedly failing provider until its
      // cooldown expires instead of burning the media deadline on it.
      if (circuitOpen(provider.name)) {
        logger.info(
          `anime_action action=${action} provider=${provider.name} result=circuit_open skipped=true fallback=${fallback}`,
        );
        continue;
      }

      const attempt = await provider.fetch(action);
      logAttempt(action, attempt, fallback);

      if (attempt.animation?.url) {
        const remoteUrl = attempt.animation.url;
        // The URL already passed provider-level validation (length,
        // HTTPS, outbound/SSRF boundary). Remember it BEFORE attempting
        // the local cache so a failed download never loses the result.
        rememberRemoteUrl(cacheKey, remoteUrl, attempt.provider);

        // Remote success — download, validate, cache locally.
        // A cache failure (DNS, SSRF block, bad bytes, disk) must never
        // break the chain: fall through to the URL pool below.
        let cached: { asset: LocalGifAsset; filePath: string } | null = null;
        try {
          cached = await cacheRemoteGifLocally(remoteUrl, action, attempt.provider);
        } catch (error) {
          logger.warn(
            `anime_action action=${action} provider=${attempt.provider} result=cache_error detail=${error instanceof Error ? error.message : "unknown"}`
          );
        }
        if (cached) {
          logger.info(
            `anime_action action=${action} provider=${attempt.provider} result=remote_cached sha256=${cached.asset.relPath} size=${cached.asset.sizeBytes} elapsed=${Date.now() - providerChainStartedAt}ms`
          );
          return { localAsset: cached.asset, source: attempt.provider };
        }
        // Could not cache locally — keep the URL as fallback, try the
        // next provider for a downloadable result.
        logger.warn(
          `anime_action action=${action} provider=${attempt.provider} result=cache_failed fallback=${fallback}`
        );
      }
    }

    // 4) At least one validated remote URL was seen but could not be
    // cached locally — serve it from the URL pool.
    const remembered = cache.get(cacheKey);
    if (remembered && remembered.urls.length > 0) {
      const idx = Math.floor(Math.random() * remembered.urls.length);
      logger.warn(
        `anime_action action=${action} provider=${remembered.source} result=remote_url_fallback elapsed=${Date.now() - providerChainStartedAt}ms`
      );
      return { url: remembered.urls[idx], source: remembered.source };
    }

    // 5) ALL PROVIDERS FAILED — Local cache fallback (if enabled)
    if (ALLOW_REMOTE_FALLBACK && options.localGifs !== null) {
      try {
        const resolver = options.localGifs?.resolve ?? resolveLocalGif;
        const local = await resolver(`actions:${action}`);
        if (local) {
          logger.info(
            `anime_action action=${action} provider=local result=local_fallback license=${local.license} elapsed=${Date.now() - startedAt}ms`
          );
          return { localAsset: local, source: "local" };
        }
      } catch (error) {
        // Local provider failure must never break the chain.
        logger.warn(
          `anime_action action=${action} provider=local result=local_error detail=${error instanceof Error ? error.message : "unknown"} fallback=text`
        );
      }
    }

    /*
     * Every provider failed. The engine still returns a deterministic
     * text response — Discord must never receive an empty reply.
     */
    logger.warn(
      `anime_action action=${action} provider=none result=text_fallback elapsed=${Date.now() - startedAt}ms fallback=text`
    );
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

export function clearAnimationCache(): void {
  cache.clear();
  // Test-isolation hook (no production callers): a cleared URL cache
  // must not leave stale circuit-breaker state behind either.
  // Cumulative health counters are intentionally preserved.
  circuitState.clear();
}

export function getAnimationCacheStats(): { size: number; max: number; requests: number; failures: number } {
  return { size: cache.size, max: CACHE_MAX_ENTRIES, requests: requestCount, failures: failCount };
}
