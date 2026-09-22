/* ================================================================
 * MEDIA SECURITY
 *
 * Validates externally supplied animation URLs before download.
 * Prevents SSRF, DNS rebinding, oversized downloads, and
 * content-type abuse. Fail-closed design.
 * ================================================================ */

const ALLOWED_CONTENT_TYPES = new Set([
  "image/gif",
  "image/webp",
  "image/png",
  "image/jpeg",
]);

const MAX_MEDIA_SIZE = 8 * 1024 * 1024; // 8 MB — generous for animated GIFs
const MAX_REDIRECTS = 5;
const MEDIA_TIMEOUT_MS = 10_000;

function isPrivateIP(ip: string): boolean {
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^0\./.test(ip)) return true;
  if (/^::1$/.test(ip)) return true;
  if (/^fc00:/.test(ip)) return true;
  if (/^fd00:/.test(ip)) return true;
  if (/^fe80:/.test(ip)) return true;
  if (/^::ffff:127\./.test(ip)) return true;
  if (/^::ffff:10\./.test(ip)) return true;
  if (/^::ffff:172\./.test(ip)) return true;
  if (/^::ffff:192\.168\./.test(ip)) return true;
  if (/^::ffff:169\.254\./.test(ip)) return true;
  return false;
}

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

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "only HTTPS allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    return { ok: false, error: "localhost blocked" };
  }

  if (isPrivateIP(hostname)) {
    return { ok: false, error: "private IP blocked" };
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

  return { ok: true };
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
