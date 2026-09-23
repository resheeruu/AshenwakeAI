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
var fireworks_exports = {};
__export(fireworks_exports, {
  fireworksProvider: () => fireworksProvider
});
module.exports = __toCommonJS(fireworks_exports);
var import_openai_compatible = require("./openai-compatible");
var import_config = require("./config");
const fireworksProvider = new import_openai_compatible.OpenAICompatibleProvider({
  name: "fireworks",
  apiKey: import_config.providerConfig.fireworks.apiKey,
  baseURL: "https://api.fireworks.ai/inference/v1",
  defaultModel: import_config.providerConfig.fireworks.model
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  fireworksProvider
});
