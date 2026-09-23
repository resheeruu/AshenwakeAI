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
var openai_exports = {};
__export(openai_exports, {
  openAIProvider: () => openAIProvider
});
module.exports = __toCommonJS(openai_exports);
var import_openai_compatible = require("./openai-compatible");
var import_config = require("./config");
const openAIProvider = new import_openai_compatible.OpenAICompatibleProvider({
  name: "openai",
  apiKey: import_config.providerConfig.openai.apiKey,
  baseURL: "https://api.openai.com/v1",
  defaultModel: import_config.providerConfig.openai.model
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  openAIProvider
});
