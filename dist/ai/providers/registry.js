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
  ProviderRegistry: () => ProviderRegistry
});
module.exports = __toCommonJS(registry_exports);
class ProviderRegistry {
  registrations = /* @__PURE__ */ new Map();
  register(provider, priority = 100) {
    const key = provider.name.toLowerCase();
    this.registrations.set(key, {
      name: provider.name,
      provider,
      priority
    });
  }
  unregister(name) {
    return this.registrations.delete(
      name.toLowerCase()
    );
  }
  get(name) {
    return this.registrations.get(
      name.toLowerCase()
    )?.provider;
  }
  getAll() {
    return [...this.registrations.values()].sort(
      (a, b) => a.priority - b.priority
    ).map(
      (registration) => registration.provider
    );
  }
  getAvailable() {
    return this.getAll().filter(
      (provider) => provider.isAvailable()
    );
  }
  has(name) {
    return this.registrations.has(
      name.toLowerCase()
    );
  }
  clear() {
    this.registrations.clear();
  }
  get size() {
    return this.registrations.size;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ProviderRegistry
});
