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
var config_exports = {};
__export(config_exports, {
  providerConfig: () => providerConfig
});
module.exports = __toCommonJS(config_exports);
var import_env = require("../../config/env");
const providerConfig = {
  gemini: {
    enabled: Boolean(import_env.config.providers.gemini),
    apiKey: import_env.config.providers.gemini,
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash"
  },
  groq: {
    enabled: Boolean(import_env.config.providers.groq),
    apiKey: import_env.config.providers.groq,
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b"
  },
  openrouter: {
    enabled: Boolean(import_env.config.providers.openrouter),
    apiKey: import_env.config.providers.openrouter,
    model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini"
  },
  openai: {
    enabled: Boolean(import_env.config.providers.openai),
    apiKey: import_env.config.providers.openai,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini"
  },
  anthropic: {
    enabled: Boolean(import_env.config.providers.anthropic),
    apiKey: import_env.config.providers.anthropic,
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest"
  },
  mistral: {
    enabled: Boolean(import_env.config.providers.mistral),
    apiKey: import_env.config.providers.mistral,
    model: process.env.MISTRAL_MODEL || "mistral-small-latest"
  },
  cohere: {
    enabled: Boolean(import_env.config.providers.cohere),
    apiKey: import_env.config.providers.cohere,
    model: process.env.COHERE_MODEL || "command-r7b-12-2024"
  },
  together: {
    enabled: Boolean(import_env.config.providers.together),
    apiKey: import_env.config.providers.together,
    model: process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo"
  },
  deepseek: {
    enabled: Boolean(import_env.config.providers.deepseek),
    apiKey: import_env.config.providers.deepseek,
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat"
  },
  xai: {
    enabled: Boolean(import_env.config.providers.xai),
    apiKey: import_env.config.providers.xai,
    model: process.env.XAI_MODEL || "grok-3-mini"
  },
  huggingface: {
    enabled: Boolean(import_env.config.providers.huggingface),
    apiKey: import_env.config.providers.huggingface,
    model: process.env.HUGGINGFACE_MODEL || "meta-llama/Llama-3.1-8B-Instruct"
  },
  nvidia: {
    enabled: Boolean(import_env.config.providers.nvidia),
    apiKey: import_env.config.providers.nvidia,
    model: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct"
  },
  fireworks: {
    enabled: Boolean(import_env.config.providers.fireworks),
    apiKey: import_env.config.providers.fireworks,
    model: process.env.FIREWORKS_MODEL || "accounts/fireworks/models/llama-v3p1-70b-instruct"
  },
  cerebras: {
    enabled: Boolean(import_env.config.providers.cerebras),
    apiKey: import_env.config.providers.cerebras,
    model: process.env.CEREBRAS_MODEL || "llama-3.1-8b"
  },
  sambanova: {
    enabled: Boolean(import_env.config.providers.sambanova),
    apiKey: import_env.config.providers.sambanova,
    model: process.env.SAMBANOVA_MODEL || "Meta-Llama-3.1-8B-Instruct"
  },
  novita: {
    enabled: Boolean(import_env.config.providers.novita),
    apiKey: import_env.config.providers.novita,
    model: process.env.NOVITA_MODEL || "meta-llama/llama-3.1-8b-instruct"
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  providerConfig
});
