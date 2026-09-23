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
var knowledge_exports = {};
__export(knowledge_exports, {
  GuildKnowledge: () => GuildKnowledge
});
module.exports = __toCommonJS(knowledge_exports);
var import_data_store = require("../core/data-store");
var import_fuzzy_search = require("./fuzzy-search");
const KNOWLEDGE_FILE = "knowledge-data.json";
class GuildKnowledge {
  store;
  searchIndex = /* @__PURE__ */ new Map();
  constructor() {
    this.store = (0, import_data_store.readJSON)(KNOWLEDGE_FILE, { entries: {} });
  }
  save() {
    (0, import_data_store.writeJSON)(KNOWLEDGE_FILE, this.store);
    this.searchIndex.clear();
  }
  getSearchIndex(guildId) {
    const existing = this.searchIndex.get(guildId);
    if (existing) return existing;
    const entries = this.getGuildEntries(guildId);
    const index = (0, import_fuzzy_search.createFuzzySearch)(entries, ["title", "content", "tags"], {
      threshold: 0.4
    });
    this.searchIndex.set(guildId, index);
    return index;
  }
  add(entry) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const full = {
      ...entry,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.store.entries[id] = full;
    this.save();
    return full;
  }
  update(id, updates) {
    const entry = this.store.entries[id];
    if (!entry) return null;
    Object.assign(entry, updates, { updatedAt: Date.now() });
    this.save();
    return entry;
  }
  delete(id) {
    if (!this.store.entries[id]) return false;
    delete this.store.entries[id];
    this.save();
    return true;
  }
  get(id, guildId) {
    const entry = this.store.entries[id];
    if (!entry) return void 0;
    if (guildId && entry.guildId !== guildId) return void 0;
    return entry;
  }
  getGuildEntries(guildId, category) {
    return Object.values(this.store.entries).filter(
      (e) => e.guildId === guildId && (!category || e.category === category)
    );
  }
  search(guildId, query) {
    const index = this.getSearchIndex(guildId);
    const results = index(query);
    return results.slice(0, 10).map((r) => r.item);
  }
  getContext(guildId, query, maxEntries = 5) {
    const matches = this.search(guildId, query).slice(0, maxEntries);
    if (matches.length === 0) return "";
    return matches.map((e) => `[${e.category.toUpperCase()}] ${e.title}: ${e.content}`).join("\n\n");
  }
  rebuildIndex(guildId) {
    this.searchIndex.delete(guildId);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GuildKnowledge
});
