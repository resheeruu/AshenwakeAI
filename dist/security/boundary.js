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
var boundary_exports = {};
__export(boundary_exports, {
  checkBoundary: () => checkBoundary
});
module.exports = __toCommonJS(boundary_exports);
function checkBoundary(prompt) {
  const lower = prompt.toLowerCase().trim();
  const normalized = lower.replace(/[.,!?;:]/g, "").replace(/\s+/g, " ");
  if (/\bi\s+k?now\b/.test(normalized) || /\biknow\b/.test(normalized) || /\bi\s*no\b/.test(normalized)) {
    return { matched: true, response: "Cool, I know - but know what exactly?" };
  }
  if (/\b(useless|uslss|useles|stupid|stupid|dumb|idiot|garbage|trash|garbge|walang\s*kwenta)\b/.test(normalized)) {
    return { matched: true, response: "I'm here to help - if something felt off or unclear, just say so and I'll explain it differently." };
  }
  if (/\bfair\s*enuf\b/.test(normalized) || /\bfair\s*enough\b/.test(normalized) || /\bfair\b/.test(normalized)) {
    return { matched: true, response: "Fair enough - glad we agree. What's next?" };
  }
  return { matched: false };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  checkBoundary
});
