#!/usr/bin/env node
/* ================================================================
 * LEGACY PROVIDER HEALTH CHILD
 *
 * Runs in an isolated cwd (see test-provider-lifecycle.ts) so that
 * src/ai/router.ts resolves data/provider-health.json from a
 * temporary directory. Prints the restored HealthState of each
 * provider as a single RESULT_JSON line.
 * ================================================================ */

import { AIRouter } from "../src/ai/router";
import { AIProvider, AIResponse } from "../src/ai/types";

const providers: AIProvider[] = [
  "legacy-untouched",
  "legacy-historic",
  "legacy-auth",
  "legacy-quota",
  "legacy-newkey",
].map((name) => ({
  name,
  isAvailable: () => true,
  generate: async (): Promise<AIResponse> => ({
    text: "ok",
    provider: name,
    model: "legacy-model",
    latencyMs: 1,
  }),
}));

// Persistent health enabled (default) so the legacy file is loaded.
const router = new AIRouter(providers);

const states: Record<string, string> = {};
for (const entry of router.getHealthReport().providers) {
  states[entry.name] = entry.healthState;
}

console.log(`RESULT_JSON:${JSON.stringify(states)}`);

/*
 * Mixed lifecycle subset: legacy-auth is a TESTED failure (persisted
 * failures > 0), legacy-untouched has never completed a request.
 * The parent asserts this is DEGRADED but never a total failure.
 */
const mixedRouter = new AIRouter(
  providers.filter(
    (p) => p.name === "legacy-auth" || p.name === "legacy-untouched",
  ),
);

const mixedReport = mixedRouter.getHealthReport();
console.log(
  `RESULT_MIXED_JSON:${JSON.stringify({
    configuredProviders: mixedReport.configuredProviders,
    healthyProviders: mixedReport.healthyProviders,
    degradedProviders: mixedReport.degradedProviders,
    quarantinedProviders: mixedReport.quarantinedProviders,
    untestedProviders: mixedReport.untestedProviders,
    authState: mixedReport.providers.find((p) => p.name === "legacy-auth")
      ?.healthState,
    untouchedState: mixedReport.providers.find(
      (p) => p.name === "legacy-untouched",
    )?.healthState,
  })}`,
);

