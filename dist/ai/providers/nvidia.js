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
var nvidia_exports = {};
__export(nvidia_exports, {
  nvidiaProvider: () => nvidiaProvider
});
module.exports = __toCommonJS(nvidia_exports);
var import_openai_compatible = require("./openai-compatible");
var import_config = require("./config");
const nvidiaProvider = new import_openai_compatible.OpenAICompatibleProvider({
  name: "nvidia",
  apiKey: import_config.providerConfig.nvidia.apiKey,
  baseURL: "https://integrate.api.nvidia.com/v1",
  defaultModel: import_config.providerConfig.nvidia.model
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  nvidiaProvider
});
