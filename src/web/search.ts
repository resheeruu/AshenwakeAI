import pRetry from "p-retry";
import pTimeout from "p-timeout";
import { LRUCache } from "lru-cache";
import { logger } from "../logger";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  language?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  queryAge?: string;
}

const searchCache = new LRUCache<string, SearchResponse>({
  max: 200,
  ttl: 1000 * 60 * 30,
});

function cacheKey(query: string, count: number): string {
  return `${query}:${count}`;
}

export async function webSearch(
  query: string,
  count = 5,
  apiKey?: string,
): Promise<SearchResponse> {
  const key = apiKey || process.env.BRAVE_SEARCH_API_KEY;

  if (!key) {
    logger.warn("⚠️ No Brave Search API key configured");
    return { query, results: [] };
  }

  const cached = searchCache.get(cacheKey(query, count));
  if (cached) {
    logger.debug(`🔍 Search cache hit: "${query}"`);
    return cached;
  }

  const results = await pRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      try {
        const params = new URLSearchParams({
          q: query,
          count: String(count),
          text_decorations: "false",
          search_lang: "en",
        });

        const response = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": key,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 429) {
            throw new Error(`Brave Search rate limited (429)`);
          }
          if (response.status >= 500) {
            throw new Error(`Brave Search server error (${response.status})`);
          }
          throw new Error(`Brave Search HTTP ${response.status}`);
        }

        const data = await response.json();
        const webResults = data.web?.results || [];

        return {
          query,
          results: webResults.map((r: any) => ({
            title: r.title || "",
            url: r.url || "",
            description: r.description || "",
            age: r.age,
            language: r.language,
          })),
          queryAge: data.web?.results?.[0]?.age,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      retries: 2,
      minTimeout: 1000,
      maxTimeout: 4000,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        logger.warn(
          `🔍 Search attempt ${attemptNumber} failed: ${error.message}. ${retriesLeft} retries left.`
        );
      },
    },
  );

  searchCache.set(cacheKey(query, count), results);

  return results;
}
