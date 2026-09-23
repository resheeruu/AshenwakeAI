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
var outbound_fetch_exports = {};
__export(outbound_fetch_exports, {
  closeOutboundAgents: () => closeOutboundAgents,
  hardenedFetch: () => hardenedFetch,
  readLimitedBytes: () => readLimitedBytes,
  readLimitedText: () => readLimitedText,
  resolveAndValidateHost: () => resolveAndValidateHost
});
module.exports = __toCommonJS(outbound_fetch_exports);
var import_node_dns = __toESM(require("node:dns"));
var import_node_net = __toESM(require("node:net"));
var import_undici = require("undici");
var import_network_boundary = require("./network-boundary");
var import_logger = require("../logger");
const DEFAULT_TIMEOUT_MS = 15e3;
const DEFAULT_MAX_REDIRECTS = import_network_boundary.MAX_REDIRECTS;
function policyValidate(url, policy) {
  return policy === "trusted-local" ? (0, import_network_boundary.validateTrustedLocalProviderUrl)(url) : (0, import_network_boundary.validateOutboundUrl)(url);
}
async function resolveAndValidateHost(rawUrl, policy = "public") {
  const parsed = new URL(String(rawUrl));
  const hostname = parsed.hostname;
  if ((0, import_network_boundary.isBlockedHostname)(hostname) && policy === "public") {
    throw new Error(`Blocked: ${hostname} is not a fetchable target`);
  }
  if (import_node_net.default.isIP(hostname) !== 0) {
    if (policy === "public" && (0, import_network_boundary.isPrivateOrReservedIP)(hostname)) {
      throw new Error(`Blocked: ${hostname} is a private/reserved IP address`);
    }
    return [hostname.replace(/^\[/, "").replace(/\]$/, "")];
  }
  if (policy === "public" && (0, import_network_boundary.isBlockedHostname)(hostname)) {
    throw new Error(`Blocked: ${hostname} is not a fetchable target`);
  }
  try {
    const results = await import_node_dns.default.promises.lookup(hostname, { all: true });
    if (!results || results.length === 0) {
      throw new Error(`Blocked: DNS resolution returned no addresses for ${hostname}`);
    }
    for (const result of results) {
      if (policy === "public" && (0, import_network_boundary.isPrivateOrReservedIP)(result.address)) {
        import_logger.logger.warn(
          `\u{1F310} SSRF blocked: ${hostname} has private/reserved address ${result.address}`
        );
        throw new Error(
          `Blocked: ${hostname} resolves to a private/reserved IP address`
        );
      }
      if (policy === "trusted-local") {
        const check = (0, import_network_boundary.validateTrustedLocalProviderUrl)(
          `http://${result.address.includes(":") ? `[${result.address}]` : result.address}/`
        );
        if (!check.valid) {
          throw new Error(
            `Blocked: ${hostname} resolves to a disallowed address for local providers`
          );
        }
      }
    }
    return results.map((r) => r.address);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Blocked")) {
      throw error;
    }
    throw new Error(`Blocked: DNS resolution failed for ${hostname}`);
  }
}
function createValidatingLookup(policy) {
  return function validatingLookup(hostname, options, callback) {
    const opts = (typeof options === "function" ? {} : options) || {};
    const cb = typeof options === "function" ? options : callback;
    if (import_node_net.default.isIP(hostname) !== 0) {
      const ip = hostname.replace(/^\[/, "").replace(/\]$/, "");
      if (policy === "public" && (0, import_network_boundary.isPrivateOrReservedIP)(ip)) {
        cb(new Error(`Blocked: ${ip} is a private/reserved IP`));
        return;
      }
      if (opts.all) {
        cb(null, [{ address: ip, family: import_node_net.default.isIP(ip) }]);
      } else {
        cb(null, ip, import_node_net.default.isIP(ip));
      }
      return;
    }
    if (policy === "public" && (0, import_network_boundary.isBlockedHostname)(hostname)) {
      cb(new Error(`Blocked: ${hostname}`));
      return;
    }
    import_node_dns.default.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
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
          return !(0, import_network_boundary.isPrivateOrReservedIP)(a.address);
        }
        const check = (0, import_network_boundary.validateTrustedLocalProviderUrl)(
          `http://${a.address.includes(":") ? `[${a.address}]` : a.address}/`
        );
        return check.valid;
      });
      if (safe.length === 0) {
        cb(new Error(`Blocked: ${hostname} resolves to a blocked address`));
        return;
      }
      if (safe.length !== addresses.length && policy === "public") {
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
const agents = /* @__PURE__ */ new Map();
function getAgent(policy) {
  let agent = agents.get(policy);
  if (!agent) {
    agent = new import_undici.Agent({
      keepAliveTimeout: 3e4,
      keepAliveMaxTimeout: 6e4,
      connections: 10,
      pipelining: 1,
      connect: {
        lookup: createValidatingLookup(policy)
      }
    });
    agents.set(policy, agent);
  }
  return agent;
}
function closeOutboundAgents() {
  for (const agent of agents.values()) {
    void agent.close().catch(() => {
    });
  }
  agents.clear();
}
async function requestOnce(url, init, policy) {
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; AshenAI/1.0; +https://github.com/AshenAI)",
    ...init.headers
  };
  return (0, import_undici.fetch)(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    redirect: "manual",
    dispatcher: getAgent(policy)
  });
}
async function hardenedFetch(startUrl, init = {}) {
  const policy = init.policy ?? "public";
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const startCheck = policyValidate(startUrl, policy);
  if (!startCheck.valid || !startCheck.url) {
    throw new Error(`Blocked: ${startCheck.reason ?? "invalid URL"}`);
  }
  await resolveAndValidateHost(startCheck.url.toString(), policy);
  let currentUrl = startCheck.url.toString();
  for (let hop = 0; ; hop++) {
    const response = await requestOnce(currentUrl, init, policy);
    if (init.maxResponseBytes !== void 0) {
      const contentLength = Number(response.headers.get("content-length") || "0");
      if (Number.isFinite(contentLength) && contentLength > init.maxResponseBytes) {
        try {
          await response.body?.cancel?.();
        } catch {
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
    const target = (0, import_network_boundary.validateRedirectTarget)(location, currentUrl);
    if (!target.valid || !target.url) {
      import_logger.logger.warn(`\u{1F310} SSRF blocked: redirect target rejected (${target.reason})`);
      throw new Error(`Blocked: redirect target rejected (${target.reason})`);
    }
    const recheck = policyValidate(target.url, policy);
    if (!recheck.valid) {
      throw new Error(`Blocked: redirect target rejected (${recheck.reason})`);
    }
    await resolveAndValidateHost(target.url, policy);
    currentUrl = target.url;
  }
}
async function readLimitedText(response, maxBytes) {
  const chunks = [];
  let total = 0;
  if (response.body) {
    const decoder = new TextDecoder();
    let received = "";
    for await (const chunk of response.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        try {
          await response.body?.cancel?.();
        } catch {
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
async function readLimitedBytes(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      try {
        await response.body.cancel?.();
      } catch {
      }
      throw new Error(`Response too large: exceeded ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  closeOutboundAgents,
  hardenedFetch,
  readLimitedBytes,
  readLimitedText,
  resolveAndValidateHost
});
