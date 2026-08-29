#!/usr/bin/env tsx
import { detectHosting, detectCapabilities } from "./hosting-detect";
import { detectFeatureCapabilities, getMigrationSteps, validateDeploymentConfig } from "./hosting-features";

const hosting = detectHosting();
const caps = detectCapabilities();
const features = detectFeatureCapabilities();
const validation = validateDeploymentConfig();
const migrateFrom = process.env.MIGRATE_FROM?.trim().toLowerCase();
const migrateTo = process.env.MIGRATE_TO?.trim().toLowerCase() || hosting.provider;

console.log("");
console.log("=== AshenAI Deployment Advisor ===");
console.log("");
console.log("> Current Environment");
console.log("  Provider:       " + hosting.provider);
console.log("  Confidence:     " + hosting.confidence);
console.log("  Runtime:        " + hosting.runtime);
console.log("  OS:             " + hosting.operatingSystem);
console.log("  Architecture:   " + hosting.architecture);
console.log("  Containerized:  " + hosting.containerized);
console.log("  Port source:    " + hosting.portSource);
console.log("  Persistent:     " + hosting.persistentStorage);
console.log("  Signals:        " + (hosting.signals.join(", ") || "none"));
if (hosting.warnings.length) console.log("  Warnings:       " + hosting.warnings.join("; "));
console.log("");
console.log("  > Runtime Capabilities");
for (const c of caps) {
  const icon = c.available ? "+" : c.required ? "!" : "~";
  console.log("  [" + icon + "] " + c.name + (c.version ? " " + c.version : "") + (c.reason ? " -- " + c.reason : ""));
}
console.log("");
console.log("  > Feature Availability");
for (const f of features) {
  const icon = f.status === "available" ? "+" : f.status === "degraded" ? "~" : "!";
  console.log("  [" + icon + "] " + f.feature + ": " + f.status + " -- " + f.reason);
}
console.log("");
console.log("  > Configuration");
for (const i of validation) {
  const icon = i.severity === "error" ? "!" : i.severity === "warning" ? "~" : "+";
  console.log("  [" + icon + "] " + i.name + ": " + i.status);
}
console.log("");
console.log("  build:   npm install && npm run build");
console.log("  start:   bash scripts/start.sh");
console.log("  health:  GET /api/health");
console.log("");
if (migrateFrom) {
  console.log("  > Migration: " + migrateFrom + " -> " + migrateTo);
  const steps = getMigrationSteps(migrateFrom, migrateTo);
  for (const s of steps) console.log("  [" + s.effort + "] [" + s.category + "] " + s.description);
}
console.log("");
const recs: Record<string, string> = {
  render: "Render: Dockerfile bundles Lavalink. Enable persistent disk.",
  railway: "Railway: Auto-detects Dockerfile. Enable volume.",
  "fly.io": "Fly.io: fly launch with Dockerfile. Fly volumes.",
  termux: "Termux: Development only. Music needs separate Lavalink.",
  "generic-vps": "VPS: Node.js 22+, Java 21+, FFmpeg. Use systemd.",
  local: "Local: Development only.",
  unknown: "Use generic Node.js with persistent data/ volume.",
};
console.log("  Recommendation: " + (recs[hosting.provider] || recs.unknown));
