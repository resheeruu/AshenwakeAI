import type { TestConnectionResult, DiscoverModelsResult, ProviderProtocol } from "./types";
import { logger } from "../../../logger";
import { validateOutboundUrl } from "../../../security/network-boundary";

/*
 * Provider endpoints must never target private, loopback, link-local,
 * metadata, or otherwise reserved infrastructure.
 *
 * The rule lives in src/security/network-boundary.ts (shared with web
 * retrieval and media downloads). This function is exported and covered by
 * the Provider Lifecycle and Provider Platform suites — its semantics
 * (http/https only, no private/reserved targets, fail-closed on malformed
 * input) are intentionally preserved.
 */
function isSafeEndpoint(urlStr: string): boolean {
  return validateOutboundUrl(urlStr).valid;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: "manual" });
    /*
     * SSRF protection: prevent redirects to private/internal addresses.
     * validate the response URL after the request to ensure no redirect
     * bypassed the endpoint validation.
     */
    const responseUrl = response.url;
    if (responseUrl && responseUrl !== url && !isSafeEndpoint(responseUrl)) {
      throw new Error(`Redirect blocked: ${responseUrl} is not a safe endpoint`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function testOpenAICompatible(
  endpoint: string,
  apiKey: string,
  timeoutMs: number,
): Promise<{ success: boolean; latencyMs: number; models: string[]; error?: string }> {
  const started = Date.now();
  const base = endpoint.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  try {
    const modelsResponse = await fetchWithTimeout(`${base}/models`, {
      method: "GET",
      headers,
    }, timeoutMs);

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

    const data = await modelsResponse.json() as any;
    const models: string[] = [];
    if (Array.isArray(data?.data)) {
      for (const m of data.data) {
        if (typeof m.id === "string") models.push(m.id);
      }
    }

    return { success: true, latencyMs, models };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      return { success: false, latencyMs, models: [], error: "Connection timeout" };
    }
    return { success: false, latencyMs, models: [], error: msg.slice(0, 200) };
  }
}

async function testAnthropic(
  endpoint: string,
  apiKey: string,
  timeoutMs: number,
): Promise<{ success: boolean; latencyMs: number; models: string[]; error?: string }> {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(`${endpoint}/v1/models`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    }, timeoutMs);

    const latencyMs = Date.now() - started;

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        return { success: false, latencyMs, models: [], error: "Authentication failed" };
      }
      return { success: false, latencyMs, models: [], error: `HTTP ${status}` };
    }

    const data = await response.json() as any;
    const models: string[] = [];
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

async function testGemini(
  endpoint: string,
  apiKey: string,
  timeoutMs: number,
): Promise<{ success: boolean; latencyMs: number; models: string[]; error?: string }> {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(
      `${endpoint}/v1beta/models?key=${apiKey}`,
      { method: "GET" },
      timeoutMs
    );

    const latencyMs = Date.now() - started;

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        return { success: false, latencyMs, models: [], error: "Authentication failed" };
      }
      return { success: false, latencyMs, models: [], error: `HTTP ${status}` };
    }

    const data = await response.json() as any;
    const models: string[] = [];
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

async function testOllama(
  endpoint: string,
  timeoutMs: number,
): Promise<{ success: boolean; latencyMs: number; models: string[]; error?: string }> {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(`${endpoint}/api/tags`, {
      method: "GET",
    }, timeoutMs);

    const latencyMs = Date.now() - started;

    if (!response.ok) {
      return { success: false, latencyMs, models: [], error: `HTTP ${response.status}` };
    }

    const data = await response.json() as any;
    const models: string[] = [];
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

export async function testProviderConnection(
  protocol: ProviderProtocol,
  endpoint: string | undefined,
  apiKey: string | undefined,
  timeoutMs: number = 15000,
): Promise<TestConnectionResult> {
  const providerName = protocol;
  const effectiveApiKey = apiKey || "";

  if (endpoint && !isSafeEndpoint(endpoint)) {
    return {
      success: false, latencyMs: 0, providerName,
      modelsDiscovered: 0, modelIds: [],
      error: "Endpoint blocked: private/internal network addresses are not allowed",
    };
  }

  const effectiveEndpoint = endpoint || getDefaultEndpoint(protocol);
  if (!effectiveEndpoint) {
    return {
      success: false, latencyMs: 0, providerName,
      modelsDiscovered: 0, modelIds: [],
      error: "No endpoint configured",
    };
  }

  let result: { success: boolean; latencyMs: number; models: string[]; error?: string };

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
    error: result.error,
  };
}

export async function discoverModels(
  protocol: ProviderProtocol,
  endpoint: string | undefined,
  apiKey: string | undefined,
  timeoutMs: number = 15000,
): Promise<DiscoverModelsResult> {
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
    models: testResult.modelIds.map(id => ({
      modelId: id,
      displayName: id,
    })),
  };
}

function getDefaultEndpoint(protocol: ProviderProtocol): string | undefined {
  switch (protocol) {
    case "openai_compatible": return "https://api.openai.com/v1";
    case "anthropic": return "https://api.anthropic.com";
    case "gemini": return "https://generativelanguage.googleapis.com";
    case "ollama": return "http://localhost:11434";
    default: return undefined;
  }
}

export { isSafeEndpoint };
