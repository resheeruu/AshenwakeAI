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
var openrouter_exports = {};
__export(openrouter_exports, {
  openRouterProvider: () => openRouterProvider
});
module.exports = __toCommonJS(openrouter_exports);
var import_openai_compatible = require("./openai-compatible");
var import_config = require("./config");
const openRouterProvider = new import_openai_compatible.OpenAICompatibleProvider({
  name: "openrouter",
  apiKey: import_config.providerConfig.openrouter.apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultModel: import_config.providerConfig.openrouter.model,
  extraHeaders: {
    "HTTP-Referer": "https://discord.com",
    "X-Title": "AshenAI"
  }
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  openRouterProvider
});
