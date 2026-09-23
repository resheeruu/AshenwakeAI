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
var suggestions_exports = {};
__export(suggestions_exports, {
  SuggestionManager: () => SuggestionManager
});
module.exports = __toCommonJS(suggestions_exports);
var import_data_store = require("../core/data-store");
const SUGGESTIONS_FILE = "suggestions.json";
class SuggestionManager {
  store;
  constructor() {
    this.store = (0, import_data_store.readJSON)(SUGGESTIONS_FILE, { suggestions: {} });
  }
  save() {
    (0, import_data_store.writeJSON)(SUGGESTIONS_FILE, this.store);
  }
  create(guildId, authorId, content) {
    const id = `sug-${Date.now().toString(36)}`;
    const sug = {
      id,
      guildId,
      authorId,
      content,
      status: "pending",
      votes: { up: [], down: [] },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.store.suggestions[id] = sug;
    this.save();
    return sug;
  }
  vote(id, userId, type) {
    const sug = this.store.suggestions[id];
    if (!sug) return false;
    sug.votes.up = sug.votes.up.filter((u) => u !== userId);
    sug.votes.down = sug.votes.down.filter((u) => u !== userId);
    sug.votes[type].push(userId);
    sug.updatedAt = Date.now();
    this.save();
    return true;
  }
  setStatus(id, status, note) {
    const sug = this.store.suggestions[id];
    if (!sug) return false;
    sug.status = status;
    if (note) sug.staffNote = note;
    sug.updatedAt = Date.now();
    this.save();
    return true;
  }
  getGuildSuggestions(guildId, status) {
    return Object.values(this.store.suggestions).filter((s) => s.guildId === guildId && (!status || s.status === status)).sort((a, b) => b.createdAt - a.createdAt);
  }
  getTop(guildId, limit = 10) {
    return this.getGuildSuggestions(guildId).sort((a, b) => b.votes.up.length - b.votes.down.length - (a.votes.up.length - a.votes.down.length)).slice(0, limit);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SuggestionManager
});
