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
var optimizer_exports = {};
__export(optimizer_exports, {
  generateOptimizations: () => generateOptimizations
});
module.exports = __toCommonJS(optimizer_exports);
function generateOptimizations(report) {
  const suggestions = [];
  for (const finding of report.findings) {
    if (finding.level === "error") {
      suggestions.push({
        priority: "high",
        area: finding.area,
        suggestion: `Fix first: ${finding.message}`
      });
    }
    if (finding.level === "warning") {
      suggestions.push({
        priority: "medium",
        area: finding.area,
        suggestion: `Review: ${finding.message}`
      });
    }
  }
  if (report.durationMs > 1e3) {
    suggestions.push({
      priority: "medium",
      area: "Performance",
      suggestion: "Health scan is taking over 1 second; inspect filesystem scanning."
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      priority: "low",
      area: "Optimization",
      suggestion: "No immediate optimization is required."
    });
  }
  return suggestions;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generateOptimizations
});
