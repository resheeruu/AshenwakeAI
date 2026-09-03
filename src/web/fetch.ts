import { Agent, fetch as undiciFetch } from "undici";
import dns from "node:dns";
import { URL } from "node:url";
import pRetry from "p-retry";
import { LRUCache } from "lru-cache";
import { logger } from "../logger";
import { isUrlAllowedByRobots } from "./robots";

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
 * Check if an IP address is in a private/reserved range.
 * Blocks SSRF against cloud metadata, loopback, and internal networks.
 */
function isPrivateIP(ip: string): boolean {
  // IPv4 private/reserved ranges
  if (/^127\./.test(ip)) return true;           // Loopback
  if (/^10\./.test(ip)) return true;             // Class A private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;  // Class B private
  if (/^192\.168\./.test(ip)) return true;       // Class C private
  if (/^169\.254\./.test(ip)) return true;       // Link-local
  if (/^0\./.test(ip)) return true;              // Current network
  if (/^100\.6[4-9]\./.test(ip)) return true;    // Carrier-grade NAT (100.64.0.0/10)
  if (/^100\.(?:7\d|8\d|9\d|1[01]\d|11[0-9]|12[0-7])\./.test(ip)) return true; // Extended CGNAT
  if (/^192\.0\.0\./.test(ip)) return true;      // IETF protocol assignments
  if (/^192\.0\.2\./.test(ip)) return true;      // Documentation TEST-NET-1
  if (/^198\.51\.100\./.test(ip)) return true;   // Documentation TEST-NET-2
  if (/^203\.0\.113\./.test(ip)) return true;    // Documentation TEST-NET-3
  if (/^224\./.test(ip)) return true;            // Multicast
  if (/^240\./.test(ip)) return true;            // Reserved
  // IPv6 private/reserved
  if (/^::1$/.test(ip)) return true;             // Loopback
  if (/^fc00:/.test(ip)) return true;            // ULA
  if (/^fd00:/.test(ip)) return true;            // ULA
  if (/^fe80:/.test(ip)) return true;            // Link-local
  if (/^::ffff:127\./.test(ip)) return true;     // IPv4-mapped loopback
  if (/^::ffff:10\./.test(ip)) return true;      // IPv4-mapped private
  if (/^::ffff:172\./.test(ip)) return true;     // IPv4-mapped private
  if (/^::ffff:192\.168\./.test(ip)) return true; // IPv4-mapped private
  if (/^::ffff:169\.254\./.test(ip)) return true; // IPv4-mapped link-local
  if (/^0:0:0:0:0:ffff:/.test(ip)) return true;  // IPv4-compatible IPv6
  if (/^fd00:ec2::/.test(ip)) return true;        // AWS EC2 metadata IPv6
  return false;
}

/**
 * Resolve hostname and verify it does not point to a private/reserved IP.
 * Checks ALL resolved addresses to prevent DNS rebinding / multi-address SSRF.
 * Prevents SSRF against internal infrastructure.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
  "instance-metadata",
  "azure-metadata",
  "dscloud.metadata",
]);

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal") || lower.endsWith(".localhost")) return true;
  return false;
}

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
      if (isPrivateIP(result.address)) {
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
