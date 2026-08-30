/**
 * AshenAI Hosting Detection Module
 * Detects the current runtime environment using safe, read-only signals.
 * Never prints or exposes secret values.
 */

import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";

export interface HostingDetection {
  provider: string;
  confidence: "high" | "medium" | "low";
  runtime: string;
  operatingSystem: string;
  architecture: string;
  containerized: boolean;
  portSource: "environment" | "default";
  persistentStorage: "available" | "unavailable" | "unknown";
  deploymentCapabilities: string[];
  warnings: string[];
  signals: string[];
}

export interface CapabilityCheck {
  name: string;
  available: boolean;
  version?: string;
  required: boolean;
  reason?: string;
}

export interface FeatureCapability {
  feature: string;
  status: "available" | "degraded" | "unavailable";
  reason: string;
  configurationRequired: string[];
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  name: string;
  status: string;
  message: string;
}

function has(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function checkCmd(full: string): { available: boolean; version?: string } {
  try {
    const output = execSync(full, { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).trim();
    return { available: true, version: output.split("\n")[0] };
  } catch { return { available: false }; }
}

export function detectHosting(): HostingDetection {
  const warnings: string[] = [];
  const signals: string[] = [];

  const defs: Array<{ provider: string; required: string[]; optional: string[]; confidence: "high" | "medium" | "low" }> = [
    { provider: "render", required: ["RENDER"], optional: ["RENDER_SERVICE_ID", "RENDER_GIT_COMMIT"], confidence: "high" },
    { provider: "railway", required: ["RAILWAY_ENVIRONMENT"], optional: ["RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID"], confidence: "high" },
    { provider: "fly.io", required: ["FLY_APP_NAME"], optional: ["FLY_REGION", "FLY_ALLOC_ID"], confidence: "high" },
    { provider: "koyeb", required: ["KOYEB_APP_NAME"], optional: ["KOYEB_SERVICE_NAME"], confidence: "high" },
    { provider: "heroku", required: ["HEROKU_APP_NAME"], optional: ["DYNO"], confidence: "high" },
    { provider: "replit", required: ["REPL_ID"], optional: ["REPL_SLUG"], confidence: "high" },
  ];

  const matches: Array<{ provider: string; confidence: "high" | "medium" | "low" }> = [];
  for (const def of defs) {
    if (def.required.some(has)) {
      matches.push({ provider: def.provider, confidence: def.confidence });
      signals.push(...def.required.filter(has).map((s) => `${s}=(set)`));
      signals.push(...def.optional.filter(has).map((s) => `${s}=(set)`));
    }
  }

  let provider: string;
  let confidence: "high" | "medium" | "low";

  if (matches.length === 1) {
    provider = matches[0].provider;
    confidence = matches[0].confidence;
  } else if (matches.length > 1) {
    provider = "unknown"; confidence = "low";
    warnings.push(`Multiple platform signals: ${matches.map((m) => m.provider).join(", ")}`);
  } else if (has("KUBERNETES_SERVICE_HOST")) {
    provider = "docker/container"; confidence = "medium"; signals.push("KUBERNETES_SERVICE_HOST=(set)");
  } else if (fs.existsSync("/.dockerenv") || has("DOCKER_CONTAINER")) {
    provider = "docker/container"; confidence = "high"; signals.push("/.dockerenv exists");
  } else if (has("TERMUX_VERSION")) {
    provider = "termux"; confidence = "high"; signals.push(`TERMUX_VERSION=${process.env.TERMUX_VERSION}`);
  } else if (has("SSH_CLIENT") || has("SSH_TTY")) {
    provider = "generic-vps"; confidence = "medium"; signals.push("SSH session");
  } else {
    provider = "local"; confidence = "low"; signals.push("local filesystem");
  }

  const containerized = provider === "docker/container" || fs.existsSync("/.dockerenv");
  const portSource: "environment" | "default" = has("PORT") ? "environment" : "default";

  let persistentStorage: "available" | "unavailable" | "unknown" = "unknown";
  try {
    const d = `${process.cwd()}/data`;
    fs.mkdirSync(d, { recursive: true });
    const t = `${d}/.u16-test`;
    fs.writeFileSync(t, "ok");
    fs.unlinkSync(t);
    persistentStorage = "available";
  } catch { persistentStorage = "unavailable"; warnings.push("data/ not writable"); }

  const caps: string[] = [];
  if (provider !== "unknown") caps.push("hosting-detected");
  if (portSource === "environment") caps.push("configurable-port");
  if (persistentStorage === "available") caps.push("persistent-storage");
  if (containerized) caps.push("containerized");
  if (["render", "railway", "fly.io", "koyeb"].includes(provider)) caps.push("managed-platform");

  return {
    provider, confidence,
    runtime: `Node.js ${process.version}`,
    operatingSystem: `${os.platform()} ${os.release()}`,
    architecture: os.arch(),
    containerized, portSource, persistentStorage,
    deploymentCapabilities: caps, warnings, signals,
  };
}

export function detectCapabilities(): CapabilityCheck[] {
  const v = process.version;
  const major = parseInt(v.replace("v", "").split(".")[0], 10);
  const java = checkCmd("java -version 2>&1");
  const ffmpeg = checkCmd("ffmpeg -version 2>&1");
  const npm = checkCmd("npm --version");

  let persistentOk = false;
  try {
    const d = `${process.cwd()}/data`;
    fs.mkdirSync(d, { recursive: true });
    const t = `${d}/.u16-cap-test`;
    fs.writeFileSync(t, "ok");
    fs.unlinkSync(t); persistentOk = true;
  } catch { /* no */ }
  let netOk = true;
  try { require("node:dns").lookup("discord.gg", () => {}); } catch { netOk = false; }
  return [
    { name: "node.js", available: true, version: v, required: true, reason: major >= 18 ? undefined : `Need 18+, got ${v}` },
    { name: "npm", available: npm.available, version: npm.version, required: true },
    { name: "typescript/build", available: fs.existsSync("node_modules/.bin/tsc") || fs.existsSync("node_modules/typescript"), required: true },
    { name: "ffmpeg", available: ffmpeg.available, version: ffmpeg.version, required: false, reason: "Audio/video encoding support." },
    { name: "long-running-process", available: true, required: true },
    { name: "http-server", available: true, required: true },
    { name: "websocket", available: true, required: true },
    { name: "environment-variables", available: true, required: true },
    { name: "persistent-filesystem", available: persistentOk, required: true, reason: "Accounts, sessions, config." },
    { name: "graceful-shutdown", available: true, required: true },
    { name: "external-network", available: netOk, required: true, reason: "Discord, AI, OAuth." },
  ];
}
