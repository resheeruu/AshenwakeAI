import fs from "node:fs";
import { detectCapabilities } from "./hosting-detect";

export interface FeatureCapability {
  feature: string;
  status: "available" | "degraded" | "unavailable";
  reason: string;
  configurationRequired: string[];
}

export interface MigrationStep {
  category: string;
  description: string;
  effort: "none" | "low" | "medium" | "high";
}

export function detectFeatureCapabilities(): FeatureCapability[] {
  const caps = detectCapabilities();
  const has = (name: string) => caps.find((c) => c.name === name)?.available ?? false;
  const smtpVars = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
  const smtpOk = smtpVars.every((v) => process.env[v]?.trim());

  return [
    { feature: "discord-bot", status: has("node.js") && has("websocket") && has("external-network") ? "available" : "unavailable", reason: "Discord Gateway", configurationRequired: ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"] },
    { feature: "web-dashboard", status: has("http-server") ? "available" : "unavailable", reason: "Express web server", configurationRequired: ["PORT", "SESSION_SECRET"] },
    { feature: "ai-providers", status: has("external-network") ? "available" : "unavailable", reason: "Outbound HTTPS required", configurationRequired: ["At least one *_API_KEY"] },
    { feature: "conversation-memory", status: has("persistent-filesystem") ? "available" : "degraded", reason: has("persistent-filesystem") ? "Persisted to data/" : "In-memory only", configurationRequired: [] },
    { feature: "persistent-accounts", status: has("persistent-filesystem") ? "available" : "degraded", reason: has("persistent-filesystem") ? "Persisted to data/accounts.json" : "In-memory", configurationRequired: ["Owner credentials"] },
    { feature: "guild-configuration", status: has("persistent-filesystem") ? "available" : "degraded", reason: has("persistent-filesystem") ? "Persisted to data/ai-guilds/" : "Defaults only", configurationRequired: [] },
    { feature: "authentication", status: "available", reason: "Password-based with sessions", configurationRequired: ["SESSION_SECRET"] },
    { feature: "oauth", status: has("external-network") ? "available" : "unavailable", reason: "Requires redirect to providers", configurationRequired: ["DISCORD_OAUTH_CLIENT_ID", "AUTH_BASE_URL"] },
    { feature: "email-password-reset", status: smtpOk ? "available" : "degraded", reason: smtpOk ? "SMTP configured" : "No SMTP — dev mode only", configurationRequired: ["SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM"] },
    { feature: "mfa", status: "available", reason: "TOTP-based with recovery codes", configurationRequired: [] },
    { feature: "agent", status: "available", reason: "Autonomous agent", configurationRequired: [] },
    { feature: "self-healer", status: "available", reason: "Source watcher", configurationRequired: [] },
    { feature: "background-tasks", status: "available", reason: "Task engine", configurationRequired: [] },
    { feature: "analytics", status: has("persistent-filesystem") ? "available" : "degraded", reason: has("persistent-filesystem") ? "Persisted" : "In-memory only", configurationRequired: [] },
    { feature: "audit-logging", status: has("persistent-filesystem") ? "available" : "degraded", reason: has("persistent-filesystem") ? "Persisted to data/audit-log.json" : "In-memory", configurationRequired: [] },
  ];
}

export function getMigrationSteps(from: string, to: string): MigrationStep[] {
  const steps: MigrationStep[] = [
    { category: "core", description: "Core bot code (src/) remains unchanged", effort: "none" },
    { category: "core", description: "Auth, AI providers, Discord integration unchanged", effort: "none" },
    { category: "environment", description: "Same env vars required (DISCORD_TOKEN, etc.)", effort: "none" },
    { category: "storage", description: "data/ directory must be persistent on new host", effort: to === "docker" ? "medium" : "low" },
  ];

  if (from === "render" && to === "docker") {
    steps.push({ category: "deployment", description: "Use Dockerfile. Docker bundles AshenAI.", effort: "low" });
    steps.push({ category: "storage", description: "Mount Docker volume for data/", effort: "low" });
    steps.push({ category: "environment", description: "Pass env via --env-file or docker-compose", effort: "low" });
  }
  if (from === "docker" && to === "render") {
    steps.push({ category: "deployment", description: "Render auto-detects Dockerfile", effort: "low" });
    steps.push({ category: "storage", description: "Enable persistent disk on Render", effort: "medium" });
  }
  if (from === "render" && to === "railway") {
    steps.push({ category: "deployment", description: "Railway detects Dockerfile", effort: "low" });
    steps.push({ category: "storage", description: "Railway volumes for data/", effort: "low" });
  }
  if (from === "render" && to === "fly.io") {
    steps.push({ category: "deployment", description: "fly launch with Dockerfile", effort: "medium" });
    steps.push({ category: "storage", description: "Fly volumes for data/", effort: "medium" });
  }
  if (from === "render" && to === "generic-vps") {
    steps.push({ category: "deployment", description: "Install Node.js 22+, FFmpeg", effort: "medium" });
    steps.push({ category: "process", description: "Use systemd or pm2", effort: "medium" });
  }
  if (from === "termux" && to === "docker") {
    steps.push({ category: "deployment", description: "Docker bundles everything", effort: "low" });
  }
  if (from === "docker" && to === "generic-vps") {
    steps.push({ category: "deployment", description: "Install Node.js 22+, FFmpeg", effort: "medium" });
    steps.push({ category: "process", description: "Use systemd", effort: "medium" });
  }
  if (from !== to) {
    steps.push({ category: "oauth", description: "Update OAuth callback URLs if AUTH_BASE_URL changes", effort: "low" });
  }
  return steps;
}

export function validateDeploymentConfig(): Array<{ severity: "error" | "warning" | "info"; name: string; status: string; message: string }> {
  const issues: Array<{ severity: "error" | "warning" | "info"; name: string; status: string; message: string }> = [];
  const has = (n: string) => Boolean(process.env[n]?.trim());

  for (const [name, msg] of [["DISCORD_TOKEN", "Required"], ["DISCORD_CLIENT_ID", "Required"]] as const) {
    issues.push(has(name) ? { severity: "info", name, status: "present", message: "OK" } : { severity: "error", name, status: "missing", message: msg });
  }
  if (process.env.NODE_ENV === "production") {
    issues.push(has("SESSION_SECRET") ? { severity: "info", name: "SESSION_SECRET", status: "present", message: "OK" } : { severity: "error", name: "SESSION_SECRET", status: "missing", message: "Required in production" });
  }
  for (const [name, msg] of [["PORT", "Defaults to 3000"], ["AUTH_BASE_URL", "OAuth/password reset"]] as const) {
    issues.push(has(name) ? { severity: "info", name, status: "present", message: "OK" } : { severity: "warning", name, status: "not set", message: msg });
  }
  const port = parseInt(process.env.PORT || "3000", 10);
  if (isNaN(port) || port < 1 || port > 65535) issues.push({ severity: "error", name: "PORT", status: "malformed", message: `Invalid: ${process.env.PORT}` });
  if (has("DISCORD_OAUTH_CLIENT_ID") && !has("DISCORD_CLIENT_SECRET")) issues.push({ severity: "warning", name: "DISCORD_CLIENT_SECRET", status: "missing", message: "OAuth configured but secret missing" });
  return issues;
}
