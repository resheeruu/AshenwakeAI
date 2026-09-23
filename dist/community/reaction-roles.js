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
var reaction_roles_exports = {};
__export(reaction_roles_exports, {
  ReactionRoleManager: () => ReactionRoleManager
});
module.exports = __toCommonJS(reaction_roles_exports);
var import_data_store = require("../core/data-store");
const RR_FILE = "reaction-roles.json";
class ReactionRoleManager {
  store;
  constructor() {
    this.store = (0, import_data_store.readJSON)(RR_FILE, { configs: {} });
  }
  save() {
    (0, import_data_store.writeJSON)(RR_FILE, this.store);
  }
  createConfig(config) {
    const id = `rr-${Date.now().toString(36)}`;
    const full = { ...config, id, createdAt: Date.now() };
    this.store.configs[id] = full;
    this.save();
    return full;
  }
  findByMessage(messageId) {
    return Object.values(this.store.configs).find((c) => c.messageId === messageId);
  }
  deleteConfig(id) {
    if (!this.store.configs[id]) return false;
    delete this.store.configs[id];
    this.save();
    return true;
  }
  getGuildConfigs(guildId) {
    return Object.values(this.store.configs).filter((c) => c.guildId === guildId);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ReactionRoleManager
});
