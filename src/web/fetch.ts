import { Agent, fetch as undiciFetch } from "undici";
import pRetry from "p-retry";
import pTimeout from "p-timeout";
import { LRUCache } from "lru-cache";
import { logger } from "../logger";

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  redirected: boolean;
}

const pageCache = new LRUCache<string, FetchedPage>({
  max: 100,
  ttl: 1000 * 60 * 15,
});

const MAX_PAGE_SIZE = 5 * 1024 * 1024;

const USER_AGENT =
  "Mozilla/5.0 (compatible; AshenAI/1.0; +https://github.com/AshenAI)";

const agent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 10,
  pipelining: 1,
});

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("500") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("socket hang up") ||
    msg.includes("network")
  );
}

export async function fetchPage(
  url: string,
  options: {
    timeoutMs?: number;
    maxRetries?: number;
    useCache?: boolean;
  } = {},
): Promise<FetchedPage> {
  const { timeoutMs = 15_000, maxRetries = 2, useCache = true } = options;

  if (useCache) {
    const cached = pageCache.get(url);
    if (cached) {
      logger.debug(`🌐 Page cache hit: ${url}`);
      return cached;
    }
  }

  const result = await pRetry(
    async () => {
      return pTimeout(
        (async () => {
          const response = await undiciFetch(url, {
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
            },
            signal: AbortSignal.timeout(timeoutMs),
            redirect: "follow",
            dispatcher: agent,
          });

          const contentType = response.headers.get("content-type") || "";
          const contentLength = Number(response.headers.get("content-length") || "0");

          if (contentLength > MAX_PAGE_SIZE) {
            throw new Error(`Page too large: ${contentLength} bytes`);
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
          }

          let html = await response.text();

          if (html.length > MAX_PAGE_SIZE) {
            html = html.slice(0, MAX_PAGE_SIZE);
          }

          return {
            url,
            finalUrl: response.url || url,
            status: response.status,
            contentType,
            html,
            redirected: response.redirected,
          };
        })(),
        { milliseconds: timeoutMs, message: `Fetch timeout for ${url}` },
      );
    },
    {
      retries: maxRetries,
      minTimeout: 1000,
      maxTimeout: 5000,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        if (isRetryableError(error)) {
          logger.warn(
            `🌐 Fetch attempt ${attemptNumber} failed for ${url}: ${error.message}. ${retriesLeft} retries left.`
          );
        }
      },
      shouldRetry: (error) => isRetryableError(error),
    },
  );

  if (useCache) {
    pageCache.set(url, result);
  }

  return result;
}

export function clearPageCache(): void {
  pageCache.clear();
}
