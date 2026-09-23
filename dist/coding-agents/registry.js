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
var registry_exports = {};
__export(registry_exports, {
  CodingAgentRegistry: () => CodingAgentRegistry
});
module.exports = __toCommonJS(registry_exports);
class CodingAgentRegistry {
  agents = /* @__PURE__ */ new Map();
  register(agent) {
    this.agents.set(agent.name, agent);
  }
  get(name) {
    return this.agents.get(name);
  }
  getAll() {
    return Array.from(this.agents.values());
  }
  async getAvailable() {
    const available = [];
    for (const agent of this.agents.values()) {
      try {
        if (await agent.isAvailable()) {
          available.push(agent);
        }
      } catch {
      }
    }
    return available;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CodingAgentRegistry
});
