import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function numberEnv(
  name: string,
  fallback: number,
  min = 0,
): number {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value) || value < min) {
    return fallback;
  }

  return value;
}

export interface RuntimeConfig {
  ai: {
    timeoutMs: number;
    maxRetries: number;
    maxContextMessages: number;
    memoryIdleMinutes: number;
  };

  creator: {
    name: string;
    discord?: string;
  };

  admin: {
    discordIds: string[];
  };

  logLevel: string;
}

function loadRuntimeConfig(): RuntimeConfig {
  return {
    ai: {
      timeoutMs: numberEnv(
        "AI_TIMEOUT_MS",
        30_000,
        1_000,
      ),

      maxRetries: numberEnv(
        "AI_MAX_RETRIES",
        2,
        0,
      ),

      maxContextMessages: numberEnv(
        "AI_MAX_CONTEXT_MESSAGES",
        20,
        2,
      ),

      memoryIdleMinutes: numberEnv(
        "AI_MEMORY_IDLE_MINUTES",
        30,
        1,
      ),
    },

    creator: {
      name:
        process.env.CREATOR_NAME?.trim() ||
        "Xykel",

      discord: optional("CREATOR_DISCORD"),
    },

    admin: {
      discordIds: (process.env.ADMIN_DISCORD_IDS || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    },

    logLevel:
      process.env.LOG_LEVEL?.trim() ||
      "info",
  };
}

export const config = {
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    clientSecret: optional("DISCORD_CLIENT_SECRET"),
    redirectUri: optional("DISCORD_REDIRECT_URI"),
    guildId: optional("DISCORD_GUILD_ID"),
  },

  creator: {
    name:
      process.env.CREATOR_NAME?.trim() ||
      "Xykel",

    discord: optional("CREATOR_DISCORD"),
  },

  admin: {
    discordIds: (process.env.ADMIN_DISCORD_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
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
    novita: optional("NOVITA_API_KEY"),
  },

  ai: loadRuntimeConfig().ai,

  sessionSecret: optional("SESSION_SECRET"),

  web: {
    braveSearchApiKey: optional("BRAVE_SEARCH_API_KEY"),
  },

  logLevel:
    process.env.LOG_LEVEL?.trim() ||
    "info",
} as {
  discord: {
    token: string;
    clientId: string;
    clientSecret?: string;
    redirectUri?: string;
    guildId?: string;
  };

  creator: {
    name: string;
    discord?: string;
  };

  admin: {
    discordIds: string[];
  };

  providers: {
    gemini?: string;
    groq?: string;
    openrouter?: string;
    openai?: string;
    anthropic?: string;
    mistral?: string;
    cohere?: string;
    together?: string;
    deepseek?: string;
    xai?: string;
    huggingface?: string;
    nvidia?: string;
    fireworks?: string;
    cerebras?: string;
    sambanova?: string;
    novita?: string;
  };

  ai: RuntimeConfig["ai"];

  sessionSecret?: string;

  logLevel: string;
};

export class ConfigManager {
  private runtime: RuntimeConfig =
    loadRuntimeConfig();

  get(): RuntimeConfig {
    return this.runtime;
  }

  reload(): RuntimeConfig {
    this.runtime = loadRuntimeConfig();

    Object.assign(
      config.ai,
      this.runtime.ai,
    );

    Object.assign(
      config.creator,
      this.runtime.creator,
    );

    Object.assign(
      config.admin,
      this.runtime.admin,
    );

    config.logLevel =
      this.runtime.logLevel;

    return this.runtime;
  }
}

export const configManager =
  new ConfigManager();

/* ================================================================
 * U10: SECURITY CONFIGURATION VALIDATION
 *
 * Called at startup to verify security-critical env vars exist.
 * - Required vars: process exits with FATAL if missing
 * - Optional vars: warning logged if missing
 *
 * Owner credentials: either accounts.json with an owner, OR
 * ASHENAI_OWNER_* environment variables must be present.
 * ================================================================ */

export function validateSecurityConfig(): void {
  const log = {
    fatal: (msg: string) => { console.error(`[FATAL] ${msg}`); },
    warn: (msg: string) => { console.warn(`[WARN] ${msg}`); },
    info: (msg: string) => { console.log(`[INFO] ${msg}`); },
  };

  // Check if accounts.json has an owner account
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
          (a: any) => a && a.role === "owner" && a.enabled !== false,
        );
      }
    }
  } catch {
    // File doesn't exist or is invalid — check env vars
  }

  // Check if legacy env vars exist
  const hasLegacyOwner =
    !!process.env.ASHENAI_OWNER_USERNAME?.trim() &&
    !!process.env.ASHENAI_OWNER_PASSWORD_HASH?.trim() &&
    !!process.env.ASHENAI_OWNER_PASSWORD_SALT?.trim();

  if (!hasOwnerInStore && !hasLegacyOwner) {
    log.fatal(
      "No owner account found. Provide ASHENAI_OWNER_USERNAME, ASHENAI_OWNER_PASSWORD_HASH, and ASHENAI_OWNER_PASSWORD_SALT environment variables, or create an owner account in data/accounts.json.",
    );
    process.exit(1);
  }

  if (hasLegacyOwner && !hasOwnerInStore) {
    log.info("Legacy owner credentials detected — will migrate to accounts.json on startup.");
  }

  if (hasOwnerInStore && hasLegacyOwner) {
    log.info("Owner account found in accounts.json — legacy env vars will not override.");
  }

  // Optional: CORS origins (warn if not set — means CORS blocks all cross-origin)
  if (!process.env.ASHENAI_CORS_ORIGINS?.trim()) {
    log.warn(
      "ASHENAI_CORS_ORIGINS not set — all cross-origin requests are blocked (this is the secure default)",
    );
  }

  // Optional: session secret (required in production for audit integrity)
  if (!process.env.SESSION_SECRET?.trim()) {
    if (process.env.NODE_ENV === "production") {
      log.fatal("SESSION_SECRET is required in production.");
      process.exit(1);
    } else {
      log.warn("SESSION_SECRET not set — using ephemeral fallback for audit signatures");
    }
  }
}
