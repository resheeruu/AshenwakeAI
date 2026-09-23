"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var network_boundary_exports = {};
__export(network_boundary_exports, {
  MAX_REDIRECTS: () => MAX_REDIRECTS,
  isBlockedHostname: () => isBlockedHostname,
  isPrivateOrReservedIP: () => isPrivateOrReservedIP,
  validateOutboundUrl: () => validateOutboundUrl,
  validateRedirectTarget: () => validateRedirectTarget,
  validateTrustedLocalProviderUrl: () => validateTrustedLocalProviderUrl
});
module.exports = __toCommonJS(network_boundary_exports);
var import_node_net = __toESM(require("node:net"));
const BLOCKED_HOSTNAMES = /* @__PURE__ */ new Set([
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
  "169.254.169.254"
]);
const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa"];
const ALLOWED_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:"]);
const MAX_REDIRECTS = 5;
function parseIPv4(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet >>> 0;
  }
  return value >>> 0;
}
const BLOCKED_IPV4_BLOCKS = [
  ["0.0.0.0", 8],
  // "this network"
  ["10.0.0.0", 8],
  // RFC1918
  ["100.64.0.0", 10],
  // CGNAT
  ["127.0.0.0", 8],
  // loopback
  ["169.254.0.0", 16],
  // link-local (cloud metadata)
  ["172.16.0.0", 12],
  // RFC1918
  ["192.0.0.0", 24],
  // IETF protocol assignments
  ["192.0.2.0", 24],
  // TEST-NET-1
  ["192.88.99.0", 24],
  // 6to4 relay anycast
  ["192.168.0.0", 16],
  // RFC1918
  ["198.18.0.0", 15],
  // benchmarking
  ["198.51.100.0", 24],
  // TEST-NET-2
  ["203.0.113.0", 24],
  // TEST-NET-3
  ["224.0.0.0", 4],
  // multicast
  ["240.0.0.0", 4]
  // reserved (includes 255.255.255.255)
];
function ipv4InBlock(value, base, bits) {
  const baseValue = parseIPv4(base);
  if (baseValue === null) return false;
  if (bits === 0) return true;
  const mask = 4294967295 << 32 - bits >>> 0;
  return (value & mask) === (baseValue & mask);
}
function isBlockedIPv4(value) {
  return BLOCKED_IPV4_BLOCKS.some(([base, bits]) => ipv4InBlock(value, base, bits));
}
function parseIPv6Groups(rawIp) {
  let ip = rawIp.toLowerCase();
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":");
    const ipv4Part = ip.slice(lastColon + 1);
    const value = parseIPv4(ipv4Part);
    if (value === null) return null;
    const hi = (value >>> 16 & 65535).toString(16);
    const lo = (value & 65535).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const total = head.length + tail.length;
  let groups;
  if (halves.length === 2) {
    if (total > 7) return null;
    groups = [...head, ...Array(8 - total).fill("0"), ...tail];
  } else {
    if (total !== 8) return null;
    groups = head;
  }
  const parsed = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    parsed.push(parseInt(group, 16));
  }
  return parsed.length === 8 ? parsed : null;
}
function isBlockedIPv6(groups) {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const embeddedIPv4 = (hi, lo) => (hi << 16 | lo) >>> 0;
  if (groups.every((g) => g === 0)) return true;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) {
    return true;
  }
  if ((g0 & 65024) === 64512) return true;
  if ((g0 & 65472) === 65152) return true;
  if ((g0 & 65280) === 65280) return true;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 65535) {
    return isBlockedIPv4(embeddedIPv4(g6, g7));
  }
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && (g6 !== 0 || g7 !== 0)) {
    return isBlockedIPv4(embeddedIPv4(g6, g7));
  }
  if (g0 === 100 && g1 === 65435 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isBlockedIPv4(embeddedIPv4(g6, g7));
  }
  if (g0 === 8194) {
    return isBlockedIPv4(embeddedIPv4(g1, g2));
  }
  return false;
}
function isPrivateOrReservedIP(rawIp) {
  const ip = String(rawIp ?? "").trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!ip) return true;
  const version = import_node_net.default.isIP(ip);
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
function normalizeHostname(rawHostname) {
  return String(rawHostname ?? "").trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}
function isBlockedHostname(rawHostname) {
  const hostname = normalizeHostname(rawHostname);
  if (!hostname) return true;
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  if (import_node_net.default.isIP(hostname) !== 0) return isPrivateOrReservedIP(hostname);
  return false;
}
function validateOutboundUrl(rawUrl, options = {}) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl ?? ""));
  } catch {
    return { valid: false, reason: "Invalid URL" };
  }
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
  if (import_node_net.default.isIP(hostname) !== 0 && isPrivateOrReservedIP(hostname)) {
    return { valid: false, reason: `Blocked private/reserved IP: ${hostname}` };
  }
  return { valid: true, url: parsed };
}
function validateTrustedLocalProviderUrl(rawUrl) {
  let parsed;
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
  const alwaysBlockedHostnames = /* @__PURE__ */ new Set([
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
    "instance-metadata",
    "azure-metadata",
    "dscloud.metadata",
    "169.254.169.254",
    "0.0.0.0",
    "::"
  ]);
  if (alwaysBlockedHostnames.has(hostname)) {
    return { valid: false, reason: `Blocked hostname: ${hostname}` };
  }
  if ([".internal", ".localhost", ".home.arpa"].some((s) => hostname.endsWith(s))) {
    return { valid: false, reason: `Blocked internal hostname: ${hostname}` };
  }
  if (import_node_net.default.isIP(hostname) !== 0) {
    const ip = hostname.replace(/^\[/, "").replace(/\]$/, "");
    const version = import_node_net.default.isIP(ip);
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
      if ((g0 & 65472) === 65152) {
        return { valid: false, reason: `Blocked link-local IP: ${ip}` };
      }
      if ((g0 & 65280) === 65280) {
        return { valid: false, reason: `Blocked multicast IP: ${ip}` };
      }
      if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 65535) {
        const hi = (groups[6] << 16 | groups[7]) >>> 0;
        const b1 = hi >>> 24 & 255;
        const b2 = hi >>> 16 & 255;
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
function validateRedirectTarget(location, baseUrl) {
  let resolved;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MAX_REDIRECTS,
  isBlockedHostname,
  isPrivateOrReservedIP,
  validateOutboundUrl,
  validateRedirectTarget,
  validateTrustedLocalProviderUrl
});
