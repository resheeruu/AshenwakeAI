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
var deepseek_exports = {};
__export(deepseek_exports, {
  deepSeekProvider: () => deepSeekProvider
});
module.exports = __toCommonJS(deepseek_exports);
var import_openai_compatible = require("./openai-compatible");
var import_config = require("./config");
const deepSeekProvider = new import_openai_compatible.OpenAICompatibleProvider({
  name: "deepseek",
  apiKey: import_config.providerConfig.deepseek.apiKey,
  baseURL: "https://api.deepseek.com",
  defaultModel: import_config.providerConfig.deepseek.model
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deepSeekProvider
});
