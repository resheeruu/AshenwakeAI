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
var types_exports = {};
__export(types_exports, {
  DEFAULT_RIVALRY_CONFIG: () => DEFAULT_RIVALRY_CONFIG
});
module.exports = __toCommonJS(types_exports);
const DEFAULT_RIVALRY_CONFIG = {
  maxTurns: 10,
  sessionDurationMs: 10 * 60 * 1e3,
  opponentResponseTimeoutMs: 2 * 60 * 1e3
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_RIVALRY_CONFIG
});
