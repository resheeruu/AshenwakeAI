/* ================================================================
 * ANIME ANIMATION PROVIDER
 *
 * Provider abstraction for anime GIF retrieval.
 * Fallback chain: cache -> Gifukai API -> OtakuGIFs API -> text-only.
 * ================================================================ */

import { LRUCache } from "lru-cache";
import { logger } from "../../logger";

export interface AnimationResult {
  url: string;
  source: string;
}

interface CacheEntry {
  url: string;
  source: string;
}

/* ================================================================
 * CACHE
 * ================================================================ */

const cache = new LRUCache<string, CacheEntry>({
  max: 200,
  ttl: 30 * 60 * 1000,
});

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
      const response = await fetch(`${this.baseUrl}/${action}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;

      const data = await response.json() as {
        url?: string;
        action?: string;
        anime?: string;
      };

      if (data.url && typeof data.url === "string") {
        return { url: data.url, source: this.name };
      }
      return null;
    } catch {
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
      const response = await fetch(
        `${this.baseUrl}/gif?reaction=${encodeURIComponent(action)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!response.ok) return null;

      const data = await response.json() as { url?: string };
      if (data.url && typeof data.url === "string") {
        return { url: data.url, source: this.name };
      }
      return null;
    } catch {
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
  if (cached) {
    return { url: cached.url, source: cached.source };
  }

  for (const provider of providers) {
    const result = await provider.fetch(action);
    if (result) {
      cache.set(cacheKey, { url: result.url, source: result.source });
      logger.debug(`Anime animation fetched: action=${action} provider=${provider.name}`);
      return result;
    }
  }

  logger.debug(`No anime animation found for action: ${action}`);
  return null;
}

export function clearAnimationCache(): void {
  cache.clear();
}

export function getAnimationCacheStats(): { size: number; max: number } {
  return { size: cache.size, max: 200 };
}
