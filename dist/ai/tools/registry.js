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
  ToolRegistry: () => ToolRegistry,
  toolRegistry: () => toolRegistry
});
module.exports = __toCommonJS(registry_exports);
var import_logger = require("../../logger");
class ToolRegistry {
  tools = /* @__PURE__ */ new Map();
  register(tool) {
    if (this.tools.has(tool.name)) {
      import_logger.logger.warn(`Tool "${tool.name}" overwrites existing registration.`);
    }
    this.tools.set(tool.name, tool);
    import_logger.logger.debug(`Tool registered: ${tool.name} [${tool.category}]`);
  }
  registerAll(tools) {
    for (const tool of tools) {
      this.register(tool);
    }
  }
  get(name) {
    return this.tools.get(name);
  }
  has(name) {
    return this.tools.has(name);
  }
  getAll() {
    return Array.from(this.tools.values());
  }
  getByCategory(category) {
    return this.getAll().filter((t) => t.category === category);
  }
  getNames() {
    return Array.from(this.tools.keys());
  }
  count() {
    return this.tools.size;
  }
}
const toolRegistry = new ToolRegistry();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ToolRegistry,
  toolRegistry
});
