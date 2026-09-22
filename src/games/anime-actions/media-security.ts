/* ================================================================
 * MEDIA SECURITY
 *
 * Validates externally supplied animation URLs before download.
 * Prevents SSRF, DNS rebinding, oversized downloads, and
 * content-type abuse. Fail-closed design.
 * ================================================================ */

import { validateOutboundUrl } from "../../security/network-boundary";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/gif",
  "image/webp",
  "image/png",
  "image/jpeg",
]);

const MAX_MEDIA_SIZE = 8 * 1024 * 1024; // 8 MB — generous for animated GIFs
const MAX_REDIRECTS = 5;
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
    const response = await fetch(url, {
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
      redirect: "manual",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!ALLOWED_CONTENT_TYPES.has(contentType.split(";")[0].trim().toLowerCase())) {
      return null;
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_MEDIA_SIZE) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_MEDIA_SIZE) return null;

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: contentType.split(";")[0].trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

export async function followRedirectsSafe(
  url: string,
): Promise<string | null> {
  let current = url;
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const validation = validateMediaUrl(current);
    if (!validation.ok) return null;

    try {
      const response = await fetch(current, {
        method: "HEAD",
        signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
        redirect: "manual",
      });

      const location = response.headers.get("location");
      if (!location) return current;

      let nextUrl: string;
      try {
        nextUrl = new URL(location, current).toString();
      } catch {
        return null;
      }

      const nextValidation = validateMediaUrl(nextUrl);
      if (!nextValidation.ok) return null;

      current = nextUrl;
    } catch {
      return null;
    }
  }
  return null; // too many redirects
}
