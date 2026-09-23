/* ================================================================
 * MEDIA SECURITY
 *
 * Validates externally supplied animation URLs before download.
 * Prevents SSRF, DNS rebinding, oversized downloads, and
 * content-type abuse. Fail-closed design.
 *
 * Actual network I/O goes through the canonical hardened outbound
 * fetch (src/security/outbound-fetch.ts) — not raw fetch().
 * ================================================================ */

import { validateOutboundUrl } from "../../security/network-boundary";
import {
  hardenedFetch,
  readLimitedBytes,
} from "../../security/outbound-fetch";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/gif",
  "image/webp",
  "image/png",
  "image/jpeg",
]);

const MAX_MEDIA_SIZE = 8 * 1024 * 1024; // 8 MB — generous for animated GIFs
const MEDIA_TIMEOUT_MS = 10_000;

export interface MediaValidationResult {
  ok: boolean;
  error?: string;
}

export function validateMediaUrl(url: string): MediaValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "invalid URL" };
  }

  /*
   * Single source of truth for outbound safety: rejects non-HTTP(S)
   * protocols, internal hostnames, metadata endpoints, and private/reserved
   * IP ranges (including IPv4-mapped IPv6 forms). See
   * src/security/network-boundary.ts.
   */
  const check = validateOutboundUrl(url, { requireHttps: true });
  if (check.valid) {
    return { ok: true };
  }

  // Report the operator-facing reason this module has always used.
  const hostname = parsed.hostname.toLowerCase();

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "only HTTPS allowed" };
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  ) {
    return { ok: false, error: "localhost blocked" };
  }

  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { ok: false, error: "internal host blocked" };
  }

  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname === "instance-data.internal"
  ) {
    return { ok: false, error: "metadata endpoint blocked" };
  }

  return { ok: false, error: "private IP blocked" };
}

export async function safeMediaFetch(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const validation = validateMediaUrl(url);
  if (!validation.ok) return null;

  try {
    const { response } = await hardenedFetch(url, {
      timeoutMs: MEDIA_TIMEOUT_MS,
      maxRedirects: 5,
      maxResponseBytes: MAX_MEDIA_SIZE,
      policy: "public",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!ALLOWED_CONTENT_TYPES.has(contentType.split(";")[0].trim().toLowerCase())) {
      return null;
    }

    const buffer = await readLimitedBytes(response, MAX_MEDIA_SIZE);
    if (buffer.byteLength > MAX_MEDIA_SIZE) return null;

    return {
      buffer,
      contentType: contentType.split(";")[0].trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

export async function followRedirectsSafe(
  url: string,
): Promise<string | null> {
  try {
    // hardenedFetch validates every hop (URL + DNS) before connecting.
    const { finalUrl } = await hardenedFetch(url, {
      method: "HEAD",
      timeoutMs: MEDIA_TIMEOUT_MS,
      maxRedirects: 5,
      policy: "public",
    });
    return finalUrl;
  } catch {
    return null;
  }
}
