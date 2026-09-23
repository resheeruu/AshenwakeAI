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
var huggingface_exports = {};
__export(huggingface_exports, {
  huggingFaceProvider: () => huggingFaceProvider
});
module.exports = __toCommonJS(huggingface_exports);
var import_openai_compatible = require("./openai-compatible");
var import_config = require("./config");
const huggingFaceProvider = new import_openai_compatible.OpenAICompatibleProvider({
  name: "huggingface",
  apiKey: import_config.providerConfig.huggingface.apiKey,
  baseURL: "https://router.huggingface.co/v1",
  defaultModel: import_config.providerConfig.huggingface.model
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  huggingFaceProvider
});
