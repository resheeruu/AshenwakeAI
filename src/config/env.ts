import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
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
  min = 0
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

  logLevel: string;
}

function loadRuntimeConfig(): RuntimeConfig {
  return {
    ai: {
      timeoutMs: numberEnv(
        "AI_TIMEOUT_MS",
        30_000,
        1_000
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
      ),
    },

    creator: {
      name:
        process.env.CREATOR_NAME?.trim() ||
        "Xykel",

      discord: optional("CREATOR_DISCORD"),
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
    guildId: optional("DISCORD_GUILD_ID"),
  },

  creator: {
    name:
      process.env.CREATOR_NAME?.trim() ||
      "Xykel",

    discord: optional("CREATOR_DISCORD"),
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

  logLevel:
    process.env.LOG_LEVEL?.trim() ||
    "info",
} as {
  discord: {
    token: string;
    clientId: string;
    guildId?: string;
  };

  creator: {
    name: string;
    discord?: string;
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
      this.runtime.ai
    );

    Object.assign(
      config.creator,
      this.runtime.creator
    );

    config.logLevel =
      this.runtime.logLevel;

    return this.runtime;
  }
}

export const configManager =
  new ConfigManager();
