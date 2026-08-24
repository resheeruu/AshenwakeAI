import { config } from "../../config/env";

export const providerConfig = {
  gemini: {
    enabled: Boolean(config.providers.gemini),
    apiKey: config.providers.gemini,
    model:
      process.env.GEMINI_MODEL ||
      "gemini-3.6-flash",
  },

  groq: {
    enabled: Boolean(config.providers.groq),
    apiKey: config.providers.groq,
    model:
      process.env.GROQ_MODEL ||
      "openai/gpt-oss-120b",
  },

  openrouter: {
    enabled: Boolean(config.providers.openrouter),
    apiKey: config.providers.openrouter,
    model:
      process.env.OPENROUTER_MODEL ||
      "openai/gpt-4o-mini",
  },

  openai: {
    enabled: Boolean(config.providers.openai),
    apiKey: config.providers.openai,
    model:
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini",
  },

  anthropic: {
    enabled: Boolean(config.providers.anthropic),
    apiKey: config.providers.anthropic,
    model:
      process.env.ANTHROPIC_MODEL ||
      "claude-3-5-haiku-latest",
  },

  mistral: {
    enabled: Boolean(config.providers.mistral),
    apiKey: config.providers.mistral,
    model:
      process.env.MISTRAL_MODEL ||
      "mistral-small-latest",
  },

  cohere: {
    enabled: Boolean(config.providers.cohere),
    apiKey: config.providers.cohere,
    model:
      process.env.COHERE_MODEL ||
      "command-r7b-12-2024",
  },

  together: {
    enabled: Boolean(config.providers.together),
    apiKey: config.providers.together,
    model:
      process.env.TOGETHER_MODEL ||
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },

  deepseek: {
    enabled: Boolean(config.providers.deepseek),
    apiKey: config.providers.deepseek,
    model:
      process.env.DEEPSEEK_MODEL ||
      "deepseek-chat",
  },

  xai: {
    enabled: Boolean(config.providers.xai),
    apiKey: config.providers.xai,
    model:
      process.env.XAI_MODEL ||
      "grok-3-mini",
  },

  huggingface: {
    enabled: Boolean(config.providers.huggingface),
    apiKey: config.providers.huggingface,
    model:
      process.env.HUGGINGFACE_MODEL ||
      "meta-llama/Llama-3.1-8B-Instruct",
  },

  nvidia: {
    enabled: Boolean(config.providers.nvidia),
    apiKey: config.providers.nvidia,
    model:
      process.env.NVIDIA_MODEL ||
      "meta/llama-3.3-70b-instruct",
  },

  fireworks: {
    enabled: Boolean(config.providers.fireworks),
    apiKey: config.providers.fireworks,
    model:
      process.env.FIREWORKS_MODEL ||
      "accounts/fireworks/models/llama-v3p1-70b-instruct",
  },

  cerebras: {
    enabled: Boolean(config.providers.cerebras),
    apiKey: config.providers.cerebras,
    model:
      process.env.CEREBRAS_MODEL ||
      "llama-3.1-8b",
  },

  sambanova: {
    enabled: Boolean(config.providers.sambanova),
    apiKey: config.providers.sambanova,
    model:
      process.env.SAMBANOVA_MODEL ||
      "Meta-Llama-3.1-8B-Instruct",
  },

  novita: {
    enabled: Boolean(config.providers.novita),
    apiKey: config.providers.novita,
    model:
      process.env.NOVITA_MODEL ||
      "meta-llama/llama-3.1-8b-instruct",
  },
} as const;
