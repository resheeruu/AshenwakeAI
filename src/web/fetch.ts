import { Agent, fetch as undiciFetch } from "undici";
import dns from "node:dns";
import { URL } from "node:url";
import pRetry from "p-retry";
import { LRUCache } from "lru-cache";
import { logger } from "../logger";
import { isUrlAllowedByRobots } from "./robots";
import {
  MAX_REDIRECTS,
  isBlockedHostname,
  isPrivateOrReservedIP,
  validateOutboundUrl,
  validateRedirectTarget,
} from "../security/network-boundary";

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

/**
 * URL / hostname / IP validation lives in src/security/network-boundary.ts so
 * that web retrieval, provider connection tests, and media downloads share one
 * audited implementation. See docs/SECURITY-BOUNDARIES.md.
 */

/**
 * Validate a URL for SSRF safety before DNS resolution.
 * Delegates to the shared network boundary (protocol + hostname + IP checks).
 */
export function validateUrl(url: string): { valid: boolean; reason?: string } {
  const result = validateOutboundUrl(url);
  return result.valid ? { valid: true } : { valid: false, reason: result.reason };
}

/**
 * Resolve hostname and verify it does not point to a private/reserved IP.
 * Checks ALL resolved addresses to prevent DNS rebinding / multi-address SSRF.
 * Prevents SSRF against internal infrastructure.
 */
async function resolveAndValidateHost(url: string): Promise<void> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  // Pre-block known dangerous hostnames before DNS lookup
  if (isBlockedHostname(hostname)) {
    throw new Error(`Blocked: ${hostname} is not a fetchable target`);
  }

  try {
    const results = await dns.promises.lookup(hostname, { all: true });
    if (!results || results.length === 0) {
      throw new Error(`Blocked: DNS resolution returned no addresses for ${hostname}`);
    }

    for (const result of results) {
      if (isPrivateOrReservedIP(result.address)) {
        logger.warn(`🌐 SSRF blocked: ${hostname} has private/reserved address ${result.address}`);
        throw new Error(`Blocked: ${hostname} resolves to a private/reserved IP address`);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Blocked")) {
      throw error;
    }
    // DNS resolution failure — block for safety (fail-closed)
    // Prevents TOCTOU: if DNS fails now but resolves to a private IP
    // at the HTTP client level, the request would reach internal infrastructure.
    throw new Error(`Blocked: DNS resolution failed for ${hostname}`);
  }
}

/**
 * Perform one request without following redirects.
 * Redirects are resolved and validated manually (see requestWithValidatedRedirects)
 * so a public host cannot bounce the request into internal infrastructure.
 */
type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>;

function requestOnce(url: string, timeoutMs: number): Promise<FetchResponse> {
  return undiciFetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "manual",
    dispatcher: agent,
  });
}

/**
 * Follow redirects manually, validating every hop before it is requested:
 *   1. the hop URL (protocol / hostname / IP literal) via validateRedirectTarget
 *   2. the DNS-resolved addresses of that hop via resolveAndValidateHost
 *
 * This closes the SSRF gap of `redirect: "follow"`, where the HTTP client
 * would follow a redirect to e.g. the cloud metadata endpoint unvalidated.
 */
export async function requestWithValidatedRedirects(
  startUrl: string,
  timeoutMs: number,
): Promise<{ response: FetchResponse; finalUrl: string }> {
  const startCheck = validateOutboundUrl(startUrl);
  if (!startCheck.valid) {
    throw new Error(`Blocked: ${startCheck.reason}`);
  }

  let currentUrl = startUrl;

  for (let hop = 0; ; hop++) {
    const response = await requestOnce(currentUrl, timeoutMs);
    const location = response.headers.get("location");
    const isRedirect = response.status >= 300 && response.status < 400;

    if (!isRedirect || !location) {
      return { response, finalUrl: currentUrl };
    }

    if (hop >= MAX_REDIRECTS) {
      throw new Error(`Blocked: too many redirects for ${startUrl}`);
    }

    const target = validateRedirectTarget(location, currentUrl);
    if (!target.valid || !target.url) {
      logger.warn(`🌐 SSRF blocked: redirect target rejected (${target.reason})`);
      throw new Error(`Blocked: redirect target rejected (${target.reason})`);
    }

    await resolveAndValidateHost(target.url);
    currentUrl = target.url;
  }
}

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
    respectRobots?: boolean;
  } = {},
): Promise<FetchedPage> {
  const { timeoutMs = 15_000, maxRetries = 2, useCache = true, respectRobots = true } = options;

  if (useCache) {
    const cached = pageCache.get(url);
    if (cached) {
      logger.debug(`🌐 Page cache hit: ${url}`);
      return cached;
    }
  }

  if (respectRobots) {
    const allowed = await isUrlAllowedByRobots(url);
    if (!allowed) {
      throw new Error(`Blocked by robots.txt: ${url}`);
    }
  }

  // SSRF protection: resolve hostname and block private/reserved IPs
  await resolveAndValidateHost(url);

  const result = await pRetry(
    async () => {
      // Redirects are followed manually so every hop is validated.
      const { response, finalUrl } = await requestWithValidatedRedirects(url, timeoutMs);

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
        finalUrl,
        status: response.status,
        contentType,
        html,
        redirected: finalUrl !== url,
      };
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
