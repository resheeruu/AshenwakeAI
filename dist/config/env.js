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
var env_exports = {};
__export(env_exports, {
  ConfigManager: () => ConfigManager,
  config: () => config,
  configManager: () => configManager,
  getDiscordOAuthStatus: () => getDiscordOAuthStatus,
  validateRuntime: () => validateRuntime,
  validateSecurityConfig: () => validateSecurityConfig
});
module.exports = __toCommonJS(env_exports);
var import_config = require("dotenv/config");
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
function optional(name) {
  const value = process.env[name]?.trim();
  return value || void 0;
}
function numberEnv(name, fallback, min = 0) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value < min) {
    return fallback;
  }
  return value;
}
function loadRuntimeConfig() {
  return {
    ai: {
      timeoutMs: numberEnv(
        "AI_TIMEOUT_MS",
        3e4,
        1e3
      ),
      maxRetries: numberEnv(
        "AI_MAX_RETRIES",
        2,
        0
      ),
      maxContextMessages: numberEnv(
        "AI_MAX_CONTEXT_MESSAGES",
        20,
        2
      ),
      memoryIdleMinutes: numberEnv(
        "AI_MEMORY_IDLE_MINUTES",
        30,
        1
      )
    },
    creator: {
      name: process.env.CREATOR_NAME?.trim() || "Xykel",
      discord: optional("CREATOR_DISCORD")
    },
    admin: {
      discordIds: (process.env.ADMIN_DISCORD_IDS || "").split(",").map((id) => id.trim()).filter(Boolean)
    },
    logLevel: process.env.LOG_LEVEL?.trim() || "info"
  };
}
const config = {
  discord: {
    token: optional("DISCORD_TOKEN"),
    clientId: optional("DISCORD_CLIENT_ID"),
    clientSecret: optional("DISCORD_CLIENT_SECRET"),
    redirectUri: optional("DISCORD_REDIRECT_URI"),
    guildId: optional("DISCORD_GUILD_ID")
  },
  creator: {
    name: process.env.CREATOR_NAME?.trim() || "Xykel",
    discord: optional("CREATOR_DISCORD")
  },
  admin: {
    discordIds: (process.env.ADMIN_DISCORD_IDS || "").split(",").map((id) => id.trim()).filter(Boolean)
  },
  providers: {
    gemini: optional("GEMINI_API_KEY"),
    groq: optional("GROQ_API_KEY"),
    openrouter: optional("OPENROUTER_API_KEY"),
    openai: optional("OPENAI_API_KEY"),
    anthropic: optional("ANTHROPIC_API_KEY"),
    mistral: optional("MISTRAL_API_KEY"),
    cohere: optional("COHERE_API_KEY"),
    together: optional("TOGETHER_API_KEY"),
    deepseek: optional("DEEPSEEK_API_KEY"),
    xai: optional("XAI_API_KEY"),
    huggingface: optional("HUGGINGFACE_API_KEY"),
    nvidia: optional("NVIDIA_API_KEY"),
    fireworks: optional("FIREWORKS_API_KEY"),
    cerebras: optional("CEREBRAS_API_KEY"),
    sambanova: optional("SAMBANOVA_API_KEY"),
    novita: optional("NOVITA_API_KEY")
  },
  ai: loadRuntimeConfig().ai,
  sessionSecret: optional("SESSION_SECRET"),
  web: {
    braveSearchApiKey: optional("BRAVE_SEARCH_API_KEY")
  },
  logLevel: process.env.LOG_LEVEL?.trim() || "info"
};
class ConfigManager {
  runtime = loadRuntimeConfig();
  get() {
    return this.runtime;
  }
  reload() {
    this.runtime = loadRuntimeConfig();
    Object.assign(
      config.ai,
      this.runtime.ai
    );
    Object.assign(
      config.creator,
      this.runtime.creator
    );
    Object.assign(
      config.admin,
      this.runtime.admin
    );
    config.logLevel = this.runtime.logLevel;
    return this.runtime;
  }
}
const configManager = new ConfigManager();
function hasEnv(name) {
  return Boolean(process.env[name]?.trim());
}
function getDiscordOAuthStatus() {
  const clientId = process.env.DISCORD_OAUTH_CLIENT_ID?.trim() || process.env.DISCORD_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET?.trim() || process.env.DISCORD_CLIENT_SECRET?.trim() || "";
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI?.trim() || process.env.DISCORD_REDIRECT_URI?.trim() || "";
  const anyOAuthHint = hasEnv("DISCORD_OAUTH_CLIENT_ID") || hasEnv("DISCORD_OAUTH_CLIENT_SECRET") || hasEnv("DISCORD_OAUTH_REDIRECT_URI") || hasEnv("DISCORD_CLIENT_SECRET") || hasEnv("DISCORD_REDIRECT_URI");
  const missing = [];
  if (!clientSecret) missing.push("DISCORD_CLIENT_SECRET (or DISCORD_OAUTH_CLIENT_SECRET)");
  if (!redirectUri) missing.push("DISCORD_REDIRECT_URI (or DISCORD_OAUTH_REDIRECT_URI)");
  const complete = Boolean(clientId && clientSecret && redirectUri);
  if (anyOAuthHint && !complete) {
    return { configured: true, enabled: false, missing };
  }
  return { configured: complete, enabled: complete, missing: complete ? [] : missing };
}
function validateRuntime() {
  const missing = [];
  if (!hasEnv("DISCORD_TOKEN")) {
    missing.push("DISCORD_TOKEN");
  }
  if (!hasEnv("DISCORD_CLIENT_ID")) {
    missing.push("DISCORD_CLIENT_ID");
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
  const oauth = getDiscordOAuthStatus();
  if (oauth.configured && !oauth.enabled && oauth.missing.length > 0) {
    throw new Error(
      `Incomplete Discord OAuth configuration. OAuth is optional \u2014 remove partial OAuth variables, or provide all of: ${oauth.missing.join(", ")}`
    );
  }
}
function validateSecurityConfig() {
  const log = {
    fatal: (msg) => {
      console.error(`[FATAL] ${msg}`);
    },
    warn: (msg) => {
      console.warn(`[WARN] ${msg}`);
    },
    info: (msg) => {
      console.log(`[INFO] ${msg}`);
    }
  };
  let hasOwnerInStore = false;
  try {
    const fs = require("fs");
    const path = require("path");
    const accountsFile = path.join(process.cwd(), "data", "accounts.json");
    if (fs.existsSync(accountsFile)) {
      const raw = fs.readFileSync(accountsFile, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        hasOwnerInStore = parsed.some(
          (a) => a && a.role === "owner" && a.enabled !== false
        );
      }
    }
  } catch {
  }
  const hasLegacyOwner = !!process.env.ASHENAI_OWNER_USERNAME?.trim() && !!process.env.ASHENAI_OWNER_PASSWORD_HASH?.trim() && !!process.env.ASHENAI_OWNER_PASSWORD_SALT?.trim();
  if (!hasOwnerInStore && !hasLegacyOwner) {
    log.fatal(
      "No owner account found. Provide ASHENAI_OWNER_USERNAME, ASHENAI_OWNER_PASSWORD_HASH, and ASHENAI_OWNER_PASSWORD_SALT environment variables, or create an owner account in data/accounts.json."
    );
    process.exit(1);
  }
  if (hasLegacyOwner && !hasOwnerInStore) {
    log.info("Legacy owner credentials detected \u2014 will migrate to accounts.json on startup.");
  }
  if (hasOwnerInStore && hasLegacyOwner) {
    log.info("Owner account found in accounts.json \u2014 legacy env vars will not override.");
  }
  if (!process.env.ASHENAI_CORS_ORIGINS?.trim()) {
    log.warn(
      "ASHENAI_CORS_ORIGINS not set \u2014 all cross-origin requests are blocked (this is the secure default)"
    );
  }
  if (!process.env.SESSION_SECRET?.trim()) {
    if (process.env.NODE_ENV === "production") {
      log.fatal("SESSION_SECRET is required in production.");
      process.exit(1);
    } else {
      log.warn("SESSION_SECRET not set \u2014 using ephemeral fallback for audit signatures");
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ConfigManager,
  config,
  configManager,
  getDiscordOAuthStatus,
  validateRuntime,
  validateSecurityConfig
});
