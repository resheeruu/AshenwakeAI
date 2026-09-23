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
var timing_exports = {};
__export(timing_exports, {
  StageTimer: () => StageTimer
});
module.exports = __toCommonJS(timing_exports);
var import_logger = require("../logger");
class StageTimer {
  constructor(label) {
    this.label = label;
    this.lastMark = Date.now();
  }
  label;
  stages = [];
  lastMark;
  mark(stageName) {
    const now = Date.now();
    this.stages.push({ name: stageName, ms: now - this.lastMark });
    this.lastMark = now;
  }
  total() {
    return this.stages.reduce((s, e) => s + e.ms, 0);
  }
  log() {
    const lines = [`\u23F1\uFE0F ${this.label} \u2014 total ${this.total()}ms`];
    for (const s of this.stages) {
      lines.push(`  ${s.name}: ${s.ms}ms`);
    }
    import_logger.logger.info(lines.join("\n"));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  StageTimer
});
