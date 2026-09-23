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
var lifecycle_exports = {};
__export(lifecycle_exports, {
  AgentLifecycle: () => AgentLifecycle
});
module.exports = __toCommonJS(lifecycle_exports);
class AgentLifecycle {
  status = "offline";
  startedAt;
  start() {
    this.status = "starting";
    this.startedAt = /* @__PURE__ */ new Date();
    this.status = "online";
  }
  stop() {
    this.status = "offline";
  }
  degrade() {
    this.status = "degraded";
  }
  getStatus() {
    return this.status;
  }
  getStartedAt() {
    return this.startedAt;
  }
  isOnline() {
    return this.status === "online";
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentLifecycle
});
