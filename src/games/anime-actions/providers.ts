/* ================================================================
 * ANIME ANIMATION PROVIDER
 *
 * Provider abstraction for anime GIF retrieval with variety.
 * Fallback chain: cache -> Gifukai API -> OtakuGIFs API -> text-only.
 * Each action stores multiple results for variety.
 * ================================================================ */

import { LRUCache } from "lru-cache";
import { logger } from "../../logger";
import { validateMediaUrl } from "./media-security";

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
const cache = new LRUCache<string, CacheEntry>({
  max: 200,
  ttl: 30 * 60 * 1000,
});

let requestCount = 0;
let failCount = 0;

/* ================================================================
 * PROVIDER INTERFACE
 * ================================================================ */

interface AnimeProvider {
  name: string;
  fetch(action: string): Promise<AnimationResult | null>;
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

  async fetch(action: string): Promise<AnimationResult | null> {
    try {
      requestCount++;
      const response = await fetch(`${this.baseUrl}/${action}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        failCount++;
        return null;
      }

      const data = await response.json() as {
        url?: string;
        action?: string;
        anime?: string;
      };

      if (data.url && typeof data.url === "string") {
        const validation = validateMediaUrl(data.url);
        if (!validation.ok) {
          logger.debug(`Gifukai URL rejected: ${validation.error}`);
          failCount++;
          return null;
        }
        return { url: data.url, source: this.name };
      }
      failCount++;
      return null;
    } catch {
      failCount++;
      return null;
    }
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

  async fetch(action: string): Promise<AnimationResult | null> {
    try {
      requestCount++;
      const response = await fetch(
        `${this.baseUrl}/gif?reaction=${encodeURIComponent(action)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!response.ok) {
        failCount++;
        return null;
      }

      const data = await response.json() as { url?: string };
      if (data.url && typeof data.url === "string") {
        const validation = validateMediaUrl(data.url);
        if (!validation.ok) {
          logger.debug(`OtakuGifs URL rejected: ${validation.error}`);
          failCount++;
          return null;
        }
        return { url: data.url, source: this.name };
      }
      failCount++;
      return null;
    } catch {
      failCount++;
      return null;
    }
  }
}

/* ================================================================
 * PROVIDER CHAIN
 * ================================================================ */

const providers: AnimeProvider[] = [
  new GifukaiProvider(),
  new OtakuGifsProvider(),
];

export async function fetchAnimation(
  action: string,
): Promise<AnimationResult | null> {
  const cacheKey = `anime:${action}`;
  const cached = cache.get(cacheKey);

  // Return a random URL from the cached pool for variety
  if (cached && cached.urls.length > 0) {
    const idx = Math.floor(Math.random() * cached.urls.length);
    return { url: cached.urls[idx], source: cached.source };
  }

  // Fetch from providers and collect results
  const collectedUrls: string[] = [];
  let source = "none";

  for (const provider of providers) {
    const result = await provider.fetch(action);
    if (result) {
      collectedUrls.push(result.url);
      source = provider.name;
      if (collectedUrls.length >= MAX_RESULTS_PER_ACTION) break;
    }
  }

  if (collectedUrls.length > 0) {
    const unique = [...new Set(collectedUrls)];
    cache.set(cacheKey, { urls: unique, source, timestamp: Date.now() });
    const idx = Math.floor(Math.random() * unique.length);
    logger.debug(`Anime animation fetched: action=${action} provider=${source} results=${unique.length}`);
    return { url: unique[idx], source };
  }

  logger.debug(`No anime animation found for action: ${action}`);
  return null;
}

export function clearAnimationCache(): void {
  cache.clear();
}

export function getAnimationCacheStats(): { size: number; max: number; requests: number; failures: number } {
  return { size: cache.size, max: 200, requests: requestCount, failures: failCount };
}
