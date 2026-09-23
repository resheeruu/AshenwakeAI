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
var world_exports = {};
__export(world_exports, {
  REGIONS: () => REGIONS,
  canUnlockRegion: () => canUnlockRegion,
  getNextRegion: () => getNextRegion,
  getRegion: () => getRegion,
  isRegionUnlocked: () => isRegionUnlocked,
  setPlayerRegion: () => setPlayerRegion,
  unlockAvailableRegion: () => unlockAvailableRegion
});
module.exports = __toCommonJS(world_exports);
const REGIONS = [
  {
    id: "ashen_village",
    name: "Ashen Village",
    emoji: "\u{1F3D8}\uFE0F",
    description: "The quiet beginning of your journey.",
    minLevel: 1,
    minReputation: 0,
    danger: 1
  },
  {
    id: "blackwood",
    name: "Blackwood",
    emoji: "\u{1F332}",
    description: "A cursed forest where ancient creatures hunt.",
    minLevel: 5,
    minReputation: 25,
    danger: 2
  },
  {
    id: "crimson_wastes",
    name: "Crimson Wastes",
    emoji: "\u{1F30B}",
    description: "A burning wasteland ruled by demons and dragons.",
    minLevel: 15,
    minReputation: 100,
    danger: 4
  },
  {
    id: "abyss",
    name: "The Abyss",
    emoji: "\u{1F311}",
    description: "A realm where reality itself begins to collapse.",
    minLevel: 30,
    minReputation: 300,
    danger: 7
  },
  {
    id: "celestial_realm",
    name: "Celestial Realm",
    emoji: "\u2728",
    description: "The domain of beings beyond mortal power.",
    minLevel: 50,
    minReputation: 750,
    danger: 10
  }
];
function getRegion(id) {
  return REGIONS.find((region) => region.id === id) ?? REGIONS[0];
}
function getNextRegion(player) {
  const currentIndex = REGIONS.findIndex(
    (region) => region.id === player.regionId
  );
  if (currentIndex < 0 || currentIndex >= REGIONS.length - 1) {
    return void 0;
  }
  return REGIONS[currentIndex + 1];
}
function canUnlockRegion(player, region) {
  return player.level >= region.minLevel && player.reputation >= region.minReputation;
}
function unlockAvailableRegion(player) {
  const next = getNextRegion(player);
  if (!next || !canUnlockRegion(player, next)) {
    return void 0;
  }
  player.regionId = next.id;
  if (!player.unlockedRegions) {
    player.unlockedRegions = [];
  }
  if (!player.unlockedRegions.includes(next.id)) {
    player.unlockedRegions.push(next.id);
  }
  if (!player.titles.includes("region_pioneer")) {
    player.titles.push("region_pioneer");
  }
  return next;
}
function isRegionUnlocked(player, regionId) {
  if (!player.unlockedRegions) {
    return player.regionId === regionId || regionId === "ashen_village";
  }
  return player.unlockedRegions.includes(regionId);
}
function setPlayerRegion(player, regionId) {
  if (!isRegionUnlocked(player, regionId)) {
    throw new Error("REGION_NOT_UNLOCKED");
  }
  const region = getRegion(regionId);
  player.regionId = regionId;
  return region;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  REGIONS,
  canUnlockRegion,
  getNextRegion,
  getRegion,
  isRegionUnlocked,
  setPlayerRegion,
  unlockAvailableRegion
});
