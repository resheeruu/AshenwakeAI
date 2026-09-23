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
var connection_tester_exports = {};
__export(connection_tester_exports, {
  discoverModels: () => discoverModels,
  isSafeEndpoint: () => isSafeEndpoint,
  isSafeEndpointForProtocol: () => isSafeEndpointForProtocol,
  testProviderConnection: () => testProviderConnection
});
module.exports = __toCommonJS(connection_tester_exports);
var import_network_boundary = require("../../../security/network-boundary");
var import_outbound_fetch = require("../../../security/outbound-fetch");
function isSafeEndpoint(urlStr) {
  return (0, import_network_boundary.validateOutboundUrl)(urlStr).valid;
}
function isSafeEndpointForProtocol(urlStr, protocol) {
  if (protocol === "ollama") {
    return (0, import_network_boundary.validateTrustedLocalProviderUrl)(urlStr).valid;
  }
  return (0, import_network_boundary.validateOutboundUrl)(urlStr).valid;
}
function policyFor(protocol) {
  return protocol === "ollama" ? "trusted-local" : "public";
}
async function fetchWithTimeout(url, options, timeoutMs, protocol = "openai_compatible") {
  try {
    const { response } = await (0, import_outbound_fetch.hardenedFetch)(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      timeoutMs,
      maxRedirects: 5,
      policy: policyFor(protocol)
    });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("Timeout") || msg.includes("timeout")) {
      throw new Error("Connection timeout");
    }
    throw err;
  }
}
async function testOpenAICompatible(endpoint, apiKey, timeoutMs) {
  const started = Date.now();
  const base = endpoint.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json"
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  try {
    const modelsResponse = await fetchWithTimeout(`${base}/models`, {
      method: "GET",
      headers
    }, timeoutMs, "openai_compatible");
    const latencyMs = Date.now() - started;
    if (!modelsResponse.ok) {
      const status = modelsResponse.status;
      if (status === 401 || status === 403) {
        return { success: false, latencyMs, models: [], error: "Authentication failed" };
      }
      if (status === 429) {
        return { success: false, latencyMs, models: [], error: "Rate limited" };
      }
      return { success: false, latencyMs, models: [], error: `HTTP ${status}` };
    }
    const data = await modelsResponse.json();
    const models = [];
    if (Array.isArray(data?.data)) {
      for (const m of data.data) {
        if (typeof m.id === "string") models.push(m.id);
      }
    }
    return { success: true, latencyMs, models };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("timeout") || msg.includes("Timeout")) {
      return { success: false, latencyMs, models: [], error: "Connection timeout" };
    }
    return { success: false, latencyMs, models: [], error: msg.slice(0, 200) };
  }
}
async function testAnthropic(endpoint, apiKey, timeoutMs) {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(`${endpoint}/v1/models`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    }, timeoutMs, "anthropic");
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        return { success: false, latencyMs, models: [], error: "Authentication failed" };
      }
      return { success: false, latencyMs, models: [], error: `HTTP ${status}` };
    }
    const data = await response.json();
    const models = [];
    if (Array.isArray(data?.data)) {
      for (const m of data.data) {
        if (typeof m.id === "string") models.push(m.id);
      }
    }
    return { success: true, latencyMs, models };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, latencyMs, models: [], error: msg.slice(0, 200) };
  }
}
async function testGemini(endpoint, apiKey, timeoutMs) {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(
      `${endpoint}/v1beta/models`,
      {
        method: "GET",
        headers: {
          "x-goog-api-key": apiKey
        }
      },
      timeoutMs,
      "gemini"
    );
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        return { success: false, latencyMs, models: [], error: "Authentication failed" };
      }
      return { success: false, latencyMs, models: [], error: `HTTP ${status}` };
    }
    const data = await response.json();
    const models = [];
    if (Array.isArray(data?.models)) {
      for (const m of data.models) {
        if (typeof m.name === "string") {
          models.push(m.name.replace("models/", ""));
        }
      }
    }
    return { success: true, latencyMs, models };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, latencyMs, models: [], error: msg.slice(0, 200) };
  }
}
async function testOllama(endpoint, timeoutMs) {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(`${endpoint}/api/tags`, {
      method: "GET"
    }, timeoutMs, "ollama");
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return { success: false, latencyMs, models: [], error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    const models = [];
    if (Array.isArray(data?.models)) {
      for (const m of data.models) {
        if (typeof m.name === "string") models.push(m.name);
      }
    }
    return { success: true, latencyMs, models };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, latencyMs, models: [], error: msg.slice(0, 200) };
  }
}
async function testProviderConnection(protocol, endpoint, apiKey, timeoutMs = 15e3) {
  const providerName = protocol;
  const effectiveApiKey = apiKey || "";
  if (endpoint && !isSafeEndpointForProtocol(endpoint, protocol)) {
    const message = protocol === "ollama" ? "Endpoint blocked: metadata/link-local/non-HTTP targets are not allowed for local providers" : "Endpoint blocked: private/internal network addresses are not allowed";
    return {
      success: false,
      latencyMs: 0,
      providerName,
      modelsDiscovered: 0,
      modelIds: [],
      error: message
    };
  }
  const effectiveEndpoint = endpoint || getDefaultEndpoint(protocol);
  if (!effectiveEndpoint) {
    return {
      success: false,
      latencyMs: 0,
      providerName,
      modelsDiscovered: 0,
      modelIds: [],
      error: "No endpoint configured"
    };
  }
  if (!isSafeEndpointForProtocol(effectiveEndpoint, protocol)) {
    return {
      success: false,
      latencyMs: 0,
      providerName,
      modelsDiscovered: 0,
      modelIds: [],
      error: "Endpoint blocked: private/internal network addresses are not allowed"
    };
  }
  let result;
  switch (protocol) {
    case "anthropic":
      result = await testAnthropic(effectiveEndpoint, effectiveApiKey, timeoutMs);
      break;
    case "gemini":
      result = await testGemini(effectiveEndpoint, effectiveApiKey, timeoutMs);
      break;
    case "ollama":
      result = await testOllama(effectiveEndpoint, timeoutMs);
      break;
    case "openai_compatible":
    default:
      result = await testOpenAICompatible(effectiveEndpoint, effectiveApiKey, timeoutMs);
      break;
  }
  return {
    success: result.success,
    latencyMs: result.latencyMs,
    providerName,
    modelsDiscovered: result.models.length,
    modelIds: result.models,
    error: result.error
  };
}
async function discoverModels(protocol, endpoint, apiKey, timeoutMs = 15e3) {
  const effectiveEndpoint = endpoint || getDefaultEndpoint(protocol);
  if (!effectiveEndpoint) {
    return { success: false, models: [], error: "No endpoint configured" };
  }
  const testResult = await testProviderConnection(protocol, effectiveEndpoint, apiKey, timeoutMs);
  if (!testResult.success) {
    return { success: false, models: [], error: testResult.error };
  }
  return {
    success: true,
    models: testResult.modelIds.map((id) => ({
      modelId: id,
      displayName: id
    }))
  };
}
function getDefaultEndpoint(protocol) {
  switch (protocol) {
    case "openai_compatible":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com";
    case "gemini":
      return "https://generativelanguage.googleapis.com";
    case "ollama":
      return "http://localhost:11434";
    default:
      return void 0;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  discoverModels,
  isSafeEndpoint,
  isSafeEndpointForProtocol,
  testProviderConnection
});
