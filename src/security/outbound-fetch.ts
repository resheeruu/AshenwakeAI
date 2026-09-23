/**
 * AshenAI Hardened Outbound Fetch
 *
 * Canonical server-side HTTP client for user/admin/provider-controlled URLs.
 * Every request:
 *   1. validates protocol / hostname / IP literals (network-boundary)
 *   2. resolves DNS and classifies every resolved address
 *   3. rejects blocked/private/reserved/link-local/metadata destinations
 *   4. re-validates every redirect hop (URL + DNS)
 *   5. fails closed on DNS errors
 *   6. enforces timeout and optional response-size limits
 *
 * DNS rebinding: connections use a validating lookup that only returns
 * addresses that pass IP classification at connect time (fail-closed).
 *
 * Reuses src/security/network-boundary.ts — does not fork a second SSRF
 * implementation.
 */

import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from "undici";
import {
  MAX_REDIRECTS,
  isBlockedHostname,
  isPrivateOrReservedIP,
  validateOutboundUrl,
  validateTrustedLocalProviderUrl,
  validateRedirectTarget,
} from "./network-boundary";
import { logger } from "../logger";

export type OutboundPolicy = "public" | "trusted-local";

export interface HardenedFetchRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
  policy?: OutboundPolicy;
}

export interface HardenedFetchResult {
  response: UndiciResponse;
  finalUrl: string;
  /** Cumulative bytes streamed when maxResponseBytes was enforced. */
  bytesRead?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = MAX_REDIRECTS;

function policyValidate(url: string, policy: OutboundPolicy) {
  return policy === "trusted-local"
    ? validateTrustedLocalProviderUrl(url)
    : validateOutboundUrl(url);
}

/**
 * Resolve hostname and verify every resolved address for the active policy.
 * Throws (fail-closed) on blocked hostnames, empty DNS, private IPs, or DNS errors.
 * Returns the validated addresses for optional pinning.
 */
export async function resolveAndValidateHost(
  rawUrl: string,
  policy: OutboundPolicy = "public",
): Promise<string[]> {
  const parsed = new URL(String(rawUrl));
  const hostname = parsed.hostname;

  if (isBlockedHostname(hostname) && policy === "public") {
    throw new Error(`Blocked: ${hostname} is not a fetchable target`);
  }

  // IP literals: already validated by validateOutboundUrl / trusted-local
  if (net.isIP(hostname) !== 0) {
    if (policy === "public" && isPrivateOrReservedIP(hostname)) {
      throw new Error(`Blocked: ${hostname} is a private/reserved IP address`);
    }
    return [hostname.replace(/^\[/, "").replace(/\]$/, "")];
  }

  if (policy === "public" && isBlockedHostname(hostname)) {
    throw new Error(`Blocked: ${hostname} is not a fetchable target`);
  }

  try {
    const results = await dns.promises.lookup(hostname, { all: true });
    if (!results || results.length === 0) {
      throw new Error(`Blocked: DNS resolution returned no addresses for ${hostname}`);
    }

    for (const result of results) {
      if (policy === "public" && isPrivateOrReservedIP(result.address)) {
        logger.warn(
          `🌐 SSRF blocked: ${hostname} has private/reserved address ${result.address}`,
        );
        throw new Error(
          `Blocked: ${hostname} resolves to a private/reserved IP address`,
        );
      }
      if (policy === "trusted-local") {
        // trusted-local still blocks link-local / metadata / multicast / unspecified
        const check = validateTrustedLocalProviderUrl(
          `http://${result.address.includes(":") ? `[${result.address}]` : result.address}/`,
        );
        if (!check.valid) {
          throw new Error(
            `Blocked: ${hostname} resolves to a disallowed address for local providers`,
          );
        }
      }
    }

    return results.map((r) => r.address);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Blocked")) {
      throw error;
    }
    // Fail closed: DNS failure must not allow a later TOCTOU rebind.
    throw new Error(`Blocked: DNS resolution failed for ${hostname}`);
  }
}

/**
 * Validating dns.lookup used at connect time so a hostname cannot rebind
 * between pre-validation and the TCP connect.
 */
function createValidatingLookup(policy: OutboundPolicy) {
  return function validatingLookup(
    hostname: string,
    options: unknown,
    callback?: unknown,
  ): void {
    // Normalize Node dns.lookup overloads
    const opts = (typeof options === "function" ? {} : (options as { all?: boolean })) || {};
    const cb = (typeof options === "function" ? options : callback) as (
      err: Error | null,
      address?: string | dns.LookupAddress[],
      family?: number,
    ) => void;

    if (net.isIP(hostname) !== 0) {
      const ip = hostname.replace(/^\[/, "").replace(/\]$/, "");
      if (policy === "public" && isPrivateOrReservedIP(ip)) {
        cb(new Error(`Blocked: ${ip} is a private/reserved IP`));
        return;
      }
      if (opts.all) {
        cb(null, [{ address: ip, family: net.isIP(ip) }]);
      } else {
        cb(null, ip, net.isIP(ip));
      }
      return;
    }

    if (policy === "public" && isBlockedHostname(hostname)) {
      cb(new Error(`Blocked: ${hostname}`));
      return;
    }

    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) {
        cb(err);
        return;
      }
      if (!addresses || addresses.length === 0) {
        cb(new Error(`Blocked: no addresses for ${hostname}`));
        return;
      }

      const safe = addresses.filter((a) => {
        if (policy === "public") {
          return !isPrivateOrReservedIP(a.address);
        }
        const check = validateTrustedLocalProviderUrl(
          `http://${a.address.includes(":") ? `[${a.address}]` : a.address}/`,
        );
        return check.valid;
      });

      if (safe.length === 0) {
        cb(new Error(`Blocked: ${hostname} resolves to a blocked address`));
        return;
      }
      if (safe.length !== addresses.length && policy === "public") {
        // Fail closed if ANY address is blocked (multi-address SSRF).
        cb(new Error(`Blocked: ${hostname} has mixed safe/unsafe addresses`));
        return;
      }

      if (opts.all) {
        cb(null, safe);
      } else {
        cb(null, safe[0].address, safe[0].family);
      }
    });
  };
}

const agents = new Map<OutboundPolicy, Agent>();

function getAgent(policy: OutboundPolicy): Agent {
  let agent = agents.get(policy);
  if (!agent) {
    agent = new Agent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connections: 10,
      pipelining: 1,
      connect: {
        lookup: createValidatingLookup(policy),
      },
    });
    agents.set(policy, agent);
  }
  return agent;
}

/** Close pooled agents (used by tests / shutdown). */
export function closeOutboundAgents(): void {
  for (const agent of agents.values()) {
    void agent.close().catch(() => {});
  }
  agents.clear();
}

async function requestOnce(
  url: string,
  init: HardenedFetchRequest,
  policy: OutboundPolicy,
): Promise<UndiciResponse> {
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (compatible; AshenAI/1.0; +https://github.com/AshenAI)",
    ...init.headers,
  };

  return undiciFetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    redirect: "manual",
    dispatcher: getAgent(policy),
  });
}

/**
 * Perform a hardened outbound HTTP request with validated redirects.
 * Never issues a network request before URL validation + DNS + IP checks.
 */
export async function hardenedFetch(
  startUrl: string,
  init: HardenedFetchRequest = {},
): Promise<HardenedFetchResult> {
  const policy = init.policy ?? "public";
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  const startCheck = policyValidate(startUrl, policy);
  if (!startCheck.valid || !startCheck.url) {
    throw new Error(`Blocked: ${startCheck.reason ?? "invalid URL"}`);
  }

  // Pre-resolve + validate before the first connection attempt.
  await resolveAndValidateHost(startCheck.url.toString(), policy);

  let currentUrl = startCheck.url.toString();

  for (let hop = 0; ; hop++) {
    const response = await requestOnce(currentUrl, init, policy);

    // Enforce size limit while reading is the caller's job; check header early.
    if (init.maxResponseBytes !== undefined) {
      const contentLength = Number(response.headers.get("content-length") || "0");
      if (Number.isFinite(contentLength) && contentLength > init.maxResponseBytes) {
        try {
          await response.body?.cancel?.();
        } catch {
          // ignore
        }
        throw new Error(`Response too large: ${contentLength} bytes`);
      }
    }

    const location = response.headers.get("location");
    const isRedirect = response.status >= 300 && response.status < 400;

    if (!isRedirect || !location) {
      return { response, finalUrl: currentUrl };
    }

    if (hop >= maxRedirects) {
      throw new Error(`Blocked: too many redirects for ${startUrl}`);
    }

    const target = validateRedirectTarget(location, currentUrl);
    if (!target.valid || !target.url) {
      logger.warn(`🌐 SSRF blocked: redirect target rejected (${target.reason})`);
      throw new Error(`Blocked: redirect target rejected (${target.reason})`);
    }

    // Trusted-local redirects must still honor the local policy.
    const recheck = policyValidate(target.url, policy);
    if (!recheck.valid) {
      throw new Error(`Blocked: redirect target rejected (${recheck.reason})`);
    }

    await resolveAndValidateHost(target.url, policy);
    currentUrl = target.url;
  }
}

/**
 * Read a response body as text with a hard byte cap (fail-closed).
 */
export async function readLimitedText(
  response: UndiciResponse,
  maxBytes: number,
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;

  if (response.body) {
    const decoder = new TextDecoder();
    let received = "";
    for await (const chunk of response.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike);
      total += buf.length;
      if (total > maxBytes) {
        try {
          await response.body?.cancel?.();
        } catch {
          // ignore
        }
        throw new Error(`Response too large: exceeded ${maxBytes} bytes`);
      }
      chunks.push(buf);
      received += decoder.decode(buf, { stream: true });
    }
    received += decoder.decode();
    return received;
  }

  return "";
}

/**
 * Read a response body as bytes with a hard byte cap.
 */
export async function readLimitedBytes(
  response: UndiciResponse,
  maxBytes: number,
): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of response.body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike);
    total += buf.length;
    if (total > maxBytes) {
      try {
        await response.body.cancel?.();
      } catch {
        // ignore
      }
      throw new Error(`Response too large: exceeded ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}
