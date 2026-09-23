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
var output_guard_exports = {};
__export(output_guard_exports, {
  guardAIOutput: () => guardAIOutput
});
module.exports = __toCommonJS(output_guard_exports);
var import_patterns = require("./patterns");
function guardAIOutput(text) {
  const value = text.trim();
  if (!value) {
    return {
      allowed: false,
      text: "I couldn't generate a response.",
      reason: "empty_output"
    };
  }
  for (const pattern of import_patterns.OUTPUT_SECRET_PATTERNS) {
    if (pattern.test(value)) {
      return {
        allowed: false,
        text: "I can't provide private credentials, secrets, or authentication information.",
        reason: "secret_pattern"
      };
    }
  }
  for (const pattern of import_patterns.OUTPUT_INTERNAL_PATTERNS) {
    if (pattern.test(value)) {
      return {
        allowed: false,
        text: "I keep my internal configuration and security details private.",
        reason: "internal_disclosure"
      };
    }
  }
  return {
    allowed: true,
    text: value
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  guardAIOutput
});
