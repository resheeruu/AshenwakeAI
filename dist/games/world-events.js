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
var world_events_exports = {};
__export(world_events_exports, {
  announceWorldEvent: () => announceWorldEvent,
  checkLevelMilestone: () => checkLevelMilestone,
  getEventEmoji: () => getEventEmoji,
  getEventTitle: () => getEventTitle,
  getRecentWorldEvents: () => getRecentWorldEvents,
  getWorldEventFeed: () => getWorldEventFeed,
  recordWorldEvent: () => recordWorldEvent,
  shouldAnnounceEvent: () => shouldAnnounceEvent
});
module.exports = __toCommonJS(world_events_exports);
var import_ai_narrator = require("./ai-narrator");
const recentEvents = [];
const MAX_RECENT_EVENTS = 50;
let eventCounter = 0;
function generateEventId() {
  eventCounter++;
  return `event_${Date.now()}_${eventCounter}`;
}
function recordWorldEvent(type, player, data = {}) {
  const event = {
    id: generateEventId(),
    type,
    timestamp: Date.now(),
    playerId: player?.userId,
    playerName: player?.username,
    data
  };
  recentEvents.unshift(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.pop();
  }
  return event;
}
function getRecentWorldEvents(limit = 10) {
  return recentEvents.slice(0, limit);
}
function shouldAnnounceEvent(type) {
  switch (type) {
    case "boss_spawn":
    case "boss_defeat":
    case "rare_loot":
    case "level_milestone":
    case "new_player":
    case "season_start":
    case "season_end":
      return true;
    default:
      return false;
  }
}
function getEventEmoji(type) {
  switch (type) {
    case "boss_spawn":
      return "\u{1F6A8}";
    case "boss_defeat":
      return "\u{1F3C6}";
    case "rare_loot":
      return "\u{1F3C6}";
    case "level_milestone":
      return "\u26A1";
    case "new_player":
      return "\u{1F311}";
    case "season_start":
      return "\u{1F525}";
    case "season_end":
      return "\u2744\uFE0F";
    case "guild_war":
      return "\u2694\uFE0F";
    case "world_boss_participation":
      return "\u{1F30D}";
    case "dungeon_completion":
      return "\u{1F3F0}";
    default:
      return "\u2728";
  }
}
function getEventTitle(type) {
  switch (type) {
    case "boss_spawn":
      return "WORLD BOSS SPAWNED";
    case "boss_defeat":
      return "WORLD EVENT";
    case "rare_loot":
      return "WORLD ANNOUNCEMENT";
    case "level_milestone":
      return "THE REALM HAS TAKEN NOTICE";
    case "new_player":
      return "A NEW SOUL HAS ENTERED ASHENWAKE";
    case "season_start":
      return "NEW SEASON BEGINS";
    case "season_end":
      return "SEASON CONCLUDES";
    case "guild_war":
      return "GUILD WAR";
    case "world_boss_participation":
      return "WORLD BOSS BATTLE";
    case "dungeon_completion":
      return "DUNGEON CONQUERED";
    default:
      return "WORLD EVENT";
  }
}
async function announceWorldEvent(router, event) {
  if (!shouldAnnounceEvent(event.type)) {
    return null;
  }
  const announceType = event.type;
  const narration = await (0, import_ai_narrator.generateWorldEventNarration)(router, announceType, {
    playerName: event.playerName,
    playerLevel: event.data.playerLevel,
    bossName: event.data.bossName,
    itemName: event.data.itemName,
    regionName: event.data.regionName
  });
  event.narration = narration.text;
  const emoji = getEventEmoji(event.type);
  const title = getEventTitle(event.type);
  return `${emoji} **${title}**

${narration.text}`;
}
function checkLevelMilestone(level) {
  const milestones = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100];
  return milestones.includes(level);
}
function getWorldEventFeed() {
  const events = getRecentWorldEvents(5);
  if (events.length === 0) {
    return "No recent world events.";
  }
  return events.map((event) => {
    const emoji = getEventEmoji(event.type);
    const timeAgo = formatTimeAgo(event.timestamp);
    const playerText = event.playerName ? ` \u2014 ${event.playerName}` : "";
    return `${emoji} ${event.type.replace(/_/g, " ")}${playerText} (${timeAgo})`;
  }).join("\n");
}
function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 6e4);
  const hours = Math.floor(diff / 36e5);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  announceWorldEvent,
  checkLevelMilestone,
  getEventEmoji,
  getEventTitle,
  getRecentWorldEvents,
  getWorldEventFeed,
  recordWorldEvent,
  shouldAnnounceEvent
});
