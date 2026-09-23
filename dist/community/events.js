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
var events_exports = {};
__export(events_exports, {
  EventManager: () => EventManager
});
module.exports = __toCommonJS(events_exports);
var import_data_store = require("../core/data-store");
const EVENTS_FILE = "community-events.json";
class EventManager {
  store;
  constructor() {
    this.store = (0, import_data_store.readJSON)(EVENTS_FILE, { events: {} });
  }
  save() {
    (0, import_data_store.writeJSON)(EVENTS_FILE, this.store);
  }
  createEvent(params) {
    const id = `evt-${Date.now().toString(36)}`;
    const event = { ...params, id, participants: [], createdAt: Date.now() };
    this.store.events[id] = event;
    this.save();
    return event;
  }
  joinEvent(id, userId) {
    const event = this.store.events[id];
    if (!event) return false;
    if (event.maxParticipants && event.participants.length >= event.maxParticipants) return false;
    if (!event.participants.includes(userId)) event.participants.push(userId);
    this.save();
    return true;
  }
  leaveEvent(id, userId) {
    const event = this.store.events[id];
    if (!event) return false;
    event.participants = event.participants.filter((u) => u !== userId);
    this.save();
    return true;
  }
  getGuildEvents(guildId) {
    return Object.values(this.store.events).filter((e) => e.guildId === guildId).sort((a, b) => a.startTime - b.startTime);
  }
  getUpcoming(guildId) {
    const now = Date.now();
    return this.getGuildEvents(guildId).filter((e) => e.startTime > now);
  }
  deleteEvent(id) {
    if (!this.store.events[id]) return false;
    delete this.store.events[id];
    this.save();
    return true;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EventManager
});
