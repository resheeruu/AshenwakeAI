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
var mistral_exports = {};
__export(mistral_exports, {
  mistralProvider: () => mistralProvider
});
module.exports = __toCommonJS(mistral_exports);
var import_openai_compatible = require("./openai-compatible");
var import_config = require("./config");
const mistralProvider = new import_openai_compatible.OpenAICompatibleProvider({
  name: "mistral",
  apiKey: import_config.providerConfig.mistral.apiKey,
  baseURL: "https://api.mistral.ai/v1",
  defaultModel: import_config.providerConfig.mistral.model
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  mistralProvider
});
