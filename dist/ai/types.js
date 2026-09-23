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
  HealthState: () => HealthState
});
module.exports = __toCommonJS(types_exports);
var HealthState = /* @__PURE__ */ ((HealthState2) => {
  HealthState2["NOT_CONFIGURED"] = "not_configured";
  HealthState2["CONFIGURED"] = "configured";
  HealthState2["HEALTHY"] = "healthy";
  HealthState2["DEGRADED"] = "degraded";
  HealthState2["RATE_LIMITED"] = "rate_limited";
  HealthState2["AUTH_FAILED"] = "auth_failed";
  HealthState2["NO_CREDITS"] = "no_credits";
  HealthState2["TIMEOUT"] = "timeout";
  HealthState2["NETWORK_ERROR"] = "network_error";
  HealthState2["QUARANTINED"] = "quarantined";
  HealthState2["RECOVERING"] = "recovering";
  return HealthState2;
})(HealthState || {});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HealthState
});
