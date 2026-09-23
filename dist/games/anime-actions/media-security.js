"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var media_security_exports = {};
__export(media_security_exports, {
  followRedirectsSafe: () => followRedirectsSafe,
  safeMediaFetch: () => safeMediaFetch,
  validateMediaUrl: () => validateMediaUrl
});
module.exports = __toCommonJS(media_security_exports);
var import_network_boundary = require("../../security/network-boundary");
var import_outbound_fetch = require("../../security/outbound-fetch");
const ALLOWED_CONTENT_TYPES = /* @__PURE__ */ new Set([
  "image/gif",
  "image/webp",
  "image/png",
  "image/jpeg"
]);
const MAX_MEDIA_SIZE = 8 * 1024 * 1024;
const MEDIA_TIMEOUT_MS = 1e4;
function validateMediaUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "invalid URL" };
  }
  const check = (0, import_network_boundary.validateOutboundUrl)(url, { requireHttps: true });
  if (check.valid) {
    return { ok: true };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "only HTTPS allowed" };
  }
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    return { ok: false, error: "localhost blocked" };
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { ok: false, error: "internal host blocked" };
  }
  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal" || hostname === "instance-data.internal") {
    return { ok: false, error: "metadata endpoint blocked" };
  }
  return { ok: false, error: "private IP blocked" };
}
async function safeMediaFetch(url) {
  const validation = validateMediaUrl(url);
  if (!validation.ok) return null;
  try {
    const { response } = await (0, import_outbound_fetch.hardenedFetch)(url, {
      timeoutMs: MEDIA_TIMEOUT_MS,
      maxRedirects: 5,
      maxResponseBytes: MAX_MEDIA_SIZE,
      policy: "public"
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!ALLOWED_CONTENT_TYPES.has(contentType.split(";")[0].trim().toLowerCase())) {
      return null;
    }
    const buffer = await (0, import_outbound_fetch.readLimitedBytes)(response, MAX_MEDIA_SIZE);
    if (buffer.byteLength > MAX_MEDIA_SIZE) return null;
    return {
      buffer,
      contentType: contentType.split(";")[0].trim().toLowerCase()
    };
  } catch {
    return null;
  }
}
async function followRedirectsSafe(url) {
  try {
    const { finalUrl } = await (0, import_outbound_fetch.hardenedFetch)(url, {
      method: "HEAD",
      timeoutMs: MEDIA_TIMEOUT_MS,
      maxRedirects: 5,
      policy: "public"
    });
    return finalUrl;
  } catch {
    return null;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  followRedirectsSafe,
  safeMediaFetch,
  validateMediaUrl
});
