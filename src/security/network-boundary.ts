/**
 * AshenAI Outbound Network Boundary
 *
 * Single source of truth for "is this outbound target safe to contact?".
 *
 * This logic was previously duplicated (with different gaps) in:
 *   - src/web/fetch.ts                               (web retrieval / AI browse)
 *   - src/ai/providers/platform/connection-tester.ts (provider endpoints)
 *   - src/games/anime-actions/media-security.ts      (media downloads)
 *
 * Design rules:
 *   - Pure functions: no DNS, no network, no I/O, no logging.
 *     DNS validation stays with the caller, which must resolve the hostname
 *     and re-validate every resolved address before connecting.
 *   - IP ranges are compared numerically, not by string prefix, so targets
 *     such as 255.255.255.255 or ::ffff:7f00:1 cannot slip through.
 *   - Fail-closed: unparseable input is treated as blocked.
 */

import net from "node:net";

/** Hostnames that must never be contacted, regardless of credentials. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "::",
  "::1",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-metadata",
  "azure-metadata",
  "dscloud.metadata",
  "169.254.169.254",
]);

/** Suffixes that indicate an internal/service-discovery name. */
const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa"];

/** Protocols allowed for outbound retrieval. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Default maximum number of redirect hops followed for one request. */
export const MAX_REDIRECTS = 5;

function parseIPv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value >>> 0;
}

/** IPv4 blocks that must never be contacted (SSRF / metadata / reserved). */
const BLOCKED_IPV4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata)
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved (includes 255.255.255.255)
];

function ipv4InBlock(value: number, base: string, bits: number): boolean {
  const baseValue = parseIPv4(base);
  if (baseValue === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

function isBlockedIPv4(value: number): boolean {
  return BLOCKED_IPV4_BLOCKS.some(([base, bits]) => ipv4InBlock(value, base, bits));
}

/**
 * Convert an IPv6 literal into eight 16-bit groups.
 * Handles "::" compression and embedded IPv4 (dotted or hex) forms.
 * Returns null when the address cannot be parsed.
 */
function parseIPv6Groups(rawIp: string): number[] | null {
  let ip = rawIp.toLowerCase();
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);

  // Embedded IPv4, e.g. "::ffff:127.0.0.1" or "2002:7f00:1::1.2.3.4"
  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":");
    const ipv4Part = ip.slice(lastColon + 1);
    const value = parseIPv4(ipv4Part);
    if (value === null) return null;
    const hi = ((value >>> 16) & 0xffff).toString(16);
    const lo = (value & 0xffff).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = ip.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const total = head.length + tail.length;

  let groups: string[];
  if (halves.length === 2) {
    if (total > 7) return null;
    groups = [...head, ...Array(8 - total).fill("0"), ...tail];
  } else {
    if (total !== 8) return null;
    groups = head;
  }

  const parsed: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    parsed.push(parseInt(group, 16));
  }
  return parsed.length === 8 ? parsed : null;
}

function isBlockedIPv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const embeddedIPv4 = (hi: number, lo: number) => ((hi << 16) | lo) >>> 0;

  // Unspecified (::) and loopback (::1)
  if (groups.every((g) => g === 0)) return true;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) {
    return true;
  }

  // Unique-local fc00::/7, link-local fe80::/10, multicast ff00::/8
  if ((g0 & 0xfe00) === 0xfc00) return true;
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xff00) === 0xff00) return true;

  // IPv4-mapped ::ffff:a.b.c.d (also covers the hex form ::ffff:7f00:1)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isBlockedIPv4(embeddedIPv4(g6, g7));
  }

  // IPv4-compatible (deprecated) ::a.b.c.d
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && (g6 !== 0 || g7 !== 0)) {
    return isBlockedIPv4(embeddedIPv4(g6, g7));
  }

  // NAT64 64:ff9b::/96
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isBlockedIPv4(embeddedIPv4(g6, g7));
  }

  // 6to4 2002::/16 — embedded IPv4 lives in groups 1 and 2
  if (g0 === 0x2002) {
    return isBlockedIPv4(embeddedIPv4(g1, g2));
  }

  return false;
}

/**
 * True when an IP literal is private, loopback, link-local, multicast,
 * reserved, or otherwise unsafe to contact from the server.
 *
 * Non-IP input returns false; callers decide how to treat hostnames.
 */
export function isPrivateOrReservedIP(rawIp: string): boolean {
  const ip = String(rawIp ?? "").trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!ip) return true;

  const version = net.isIP(ip);
  if (version === 4) {
    const value = parseIPv4(ip);
    return value === null ? true : isBlockedIPv4(value);
  }
  if (version === 6) {
    const groups = parseIPv6Groups(ip);
    return groups === null ? true : isBlockedIPv6(groups);
  }
  return false;
}

/** Strip brackets/trailing dot and lower-case a hostname for comparison. */
function normalizeHostname(rawHostname: string): string {
  return String(rawHostname ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

/**
 * True when a hostname is a blocked name or an IP literal in a blocked range.
 *
 * Hostname *names* are not resolved here — callers must resolve them and
 * re-check every resolved address before connecting (see resolveAndValidateHost
 * in src/web/fetch.ts).
 */
export function isBlockedHostname(rawHostname: string): boolean {
  const hostname = normalizeHostname(rawHostname);
  if (!hostname) return true;
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  if (net.isIP(hostname) !== 0) return isPrivateOrReservedIP(hostname);
  return false;
}

/**
 * Validate an outbound URL before any DNS resolution or connection.
 * Pure and synchronous: protocol allowlist, blocked hostnames, IP literals.
 */
export function validateOutboundUrl(
  rawUrl: string,
  options: { requireHttps?: boolean } = {},
): { valid: boolean; reason?: string; url?: URL } {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl ?? ""));
  } catch {
    return { valid: false, reason: "Invalid URL" };
  }

  // `new URL` normalizes exotic IPv4 notations (127.1, 0x7f.1, decimal) into
  // dotted-decimal, so the IP checks below cannot be bypassed by notation.
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { valid: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  if (options.requireHttps && parsed.protocol !== "https:") {
    return { valid: false, reason: "Only HTTPS is allowed" };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: "Credentials in URL are not allowed" };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    return { valid: false, reason: "Missing hostname" };
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: `Blocked hostname: ${hostname}` };
  }
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { valid: false, reason: `Blocked internal hostname: ${hostname}` };
  }
  if (net.isIP(hostname) !== 0 && isPrivateOrReservedIP(hostname)) {
    return { valid: false, reason: `Blocked private/reserved IP: ${hostname}` };
  }

  return { valid: true, url: parsed };
}

/**
 * Explicit trusted-local policy for operator-declared local LLM providers
 * (Ollama and similar). Unlike validateOutboundUrl, this permits loopback
 * and RFC1918 targets — but still fails closed on cloud metadata, link-local,
 * non-HTTP protocols, and credentials-in-URL.
 *
 * Only protocol === "ollama" (or providerType === "local") callers may use this.
 */
export function validateTrustedLocalProviderUrl(
  rawUrl: string,
): { valid: boolean; reason?: string; url?: URL } {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl ?? ""));
  } catch {
    return { valid: false, reason: "Invalid URL" };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { valid: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, reason: "Credentials in URL are not allowed" };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    return { valid: false, reason: "Missing hostname" };
  }

  // Always block cloud metadata and internal service-discovery names.
  const alwaysBlockedHostnames = new Set([
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
    "instance-metadata",
    "azure-metadata",
    "dscloud.metadata",
    "169.254.169.254",
    "0.0.0.0",
    "::",
  ]);
  if (alwaysBlockedHostnames.has(hostname)) {
    return { valid: false, reason: `Blocked hostname: ${hostname}` };
  }
  if ([".internal", ".localhost", ".home.arpa"].some((s) => hostname.endsWith(s))) {
    return { valid: false, reason: `Blocked internal hostname: ${hostname}` };
  }

  if (net.isIP(hostname) !== 0) {
    const ip = hostname.replace(/^\[/, "").replace(/\]$/, "");
    const version = net.isIP(ip);
    // Block link-local / metadata range even for trusted-local (169.254.0.0/16, fe80::/10).
    if (version === 4) {
      const value = parseIPv4(ip);
      if (value === null) return { valid: false, reason: `Blocked IP: ${ip}` };
      if (ipv4InBlock(value, "169.254.0.0", 16)) {
        return { valid: false, reason: `Blocked link-local IP: ${ip}` };
      }
      if (ipv4InBlock(value, "0.0.0.0", 8)) {
        return { valid: false, reason: `Blocked unspecified IP: ${ip}` };
      }
      if (ipv4InBlock(value, "224.0.0.0", 4) || ipv4InBlock(value, "240.0.0.0", 4)) {
        return { valid: false, reason: `Blocked reserved IP: ${ip}` };
      }
    } else if (version === 6) {
      const groups = parseIPv6Groups(ip);
      if (groups === null) return { valid: false, reason: `Blocked IP: ${ip}` };
      const [g0, g1, g2, g3, g4, g5] = groups;
      if (groups.every((g) => g === 0)) {
        return { valid: false, reason: "Blocked unspecified IP" };
      }
      if ((g0 & 0xffc0) === 0xfe80) {
        return { valid: false, reason: `Blocked link-local IP: ${ip}` };
      }
      if ((g0 & 0xff00) === 0xff00) {
        return { valid: false, reason: `Blocked multicast IP: ${ip}` };
      }
      // IPv4-mapped: re-check embedded IPv4 for link-local/metadata.
      if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
        const hi = ((groups[6] << 16) | groups[7]) >>> 0;
        const b1 = (hi >>> 24) & 0xff;
        const b2 = (hi >>> 16) & 0xff;
        if (b1 === 169 && b2 === 254) {
          return { valid: false, reason: `Blocked link-local IP: ${ip}` };
        }
        if (b1 === 0) {
          return { valid: false, reason: `Blocked unspecified IP: ${ip}` };
        }
      }
    }
  }

  return { valid: true, url: parsed };
}

/**
 * Resolve and validate a redirect target relative to the URL that produced it.
 *
 * Used to validate EVERY redirect hop (with redirect: "manual") instead of
 * letting the HTTP client follow redirects to internal targets blindly.
 */
export function validateRedirectTarget(
  location: string,
  baseUrl: string,
): { valid: boolean; reason?: string; url?: string } {
  let resolved: URL;
  try {
    resolved = new URL(String(location ?? ""), String(baseUrl ?? ""));
  } catch {
    return { valid: false, reason: "Invalid redirect target" };
  }
  const check = validateOutboundUrl(resolved.toString());
  if (!check.valid) {
    return { valid: false, reason: check.reason ?? "Redirect target rejected" };
  }
  return { valid: true, url: resolved.toString() };
}
