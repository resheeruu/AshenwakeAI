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
var equipment_exports = {};
__export(equipment_exports, {
  RARITIES: () => RARITIES,
  SLOT_EMOJIS: () => SLOT_EMOJIS,
  SLOT_NAMES: () => SLOT_NAMES,
  addEquipment: () => addEquipment,
  createEquipment: () => createEquipment,
  getEquipmentPower: () => getEquipmentPower,
  getEquipmentStats: () => getEquipmentStats,
  getEquipmentSummary: () => getEquipmentSummary,
  getEquippedItems: () => getEquippedItems,
  getTotalEquipmentPower: () => getTotalEquipmentPower,
  rollEquipmentRarity: () => rollEquipmentRarity
});
module.exports = __toCommonJS(equipment_exports);
var import_config = require("./config");
const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
  "divine"
];
const SLOT_NAMES = {
  weapon: "Weapon",
  armor: "Armor",
  helmet: "Helmet",
  boots: "Boots",
  ring: "Ring",
  amulet: "Amulet"
};
const SLOT_EMOJIS = {
  weapon: "\u2694\uFE0F",
  armor: "\u{1F6E1}\uFE0F",
  helmet: "\u{1FA96}",
  boots: "\u{1F462}",
  ring: "\u{1F48D}",
  amulet: "\u{1F4FF}"
};
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function rollRarity() {
  const roll = Math.random();
  const chances = import_config.GAME_CONFIG.rarityDropChances;
  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += chances[rarity];
    if (roll < cumulative) return rarity;
  }
  return "common";
}
function basePowerForLevel(level) {
  return Math.max(1, level * 2);
}
function rollEquipmentRarity() {
  return rollRarity();
}
function normalizeEquipmentSlot(templateOrSlot) {
  const value = templateOrSlot.toLowerCase();
  if (value === "weapon" || value === "armor" || value === "helmet" || value === "boots" || value === "ring" || value === "amulet") {
    return value;
  }
  if (value.includes("weapon") || value.includes("sword") || value.includes("blade")) {
    return "weapon";
  }
  if (value.includes("armor") || value.includes("chest") || value.includes("plate")) {
    return "armor";
  }
  if (value.includes("helmet") || value.includes("helm")) {
    return "helmet";
  }
  if (value.includes("boot") || value.includes("shoe")) {
    return "boots";
  }
  if (value.includes("ring")) {
    return "ring";
  }
  if (value.includes("amulet") || value.includes("necklace")) {
    return "amulet";
  }
  return "weapon";
}
function createEquipment(templateOrSlot, levelOrRarity, forcedRarity) {
  const slot = typeof levelOrRarity === "string" ? normalizeEquipmentSlot(templateOrSlot) : normalizeEquipmentSlot(templateOrSlot);
  const playerLevel = typeof levelOrRarity === "number" ? levelOrRarity : 1;
  const rarity = typeof levelOrRarity === "string" ? levelOrRarity : forcedRarity ?? rollRarity();
  const multiplier = import_config.GAME_CONFIG.rarityMultipliers[rarity];
  const base = basePowerForLevel(playerLevel);
  const primary = Math.max(
    1,
    Math.floor(
      base * multiplier * (0.8 + Math.random() * 0.4)
    )
  );
  let attack = 0;
  let defense = 0;
  let hp = 0;
  let luck = 0;
  switch (slot) {
    case "weapon":
      attack = primary;
      break;
    case "armor":
      defense = primary;
      hp = Math.floor(primary * 2);
      break;
    case "helmet":
      defense = Math.floor(primary * 0.7);
      hp = Math.floor(primary * 1.5);
      break;
    case "boots":
      defense = Math.floor(primary * 0.5);
      luck = Math.max(1, Math.floor(primary * 0.25));
      break;
    case "ring":
      attack = Math.floor(primary * 0.5);
      luck = Math.max(1, Math.floor(primary * 0.4));
      break;
    case "amulet":
      hp = Math.floor(primary * 1.5);
      attack = Math.floor(primary * 0.35);
      luck = Math.max(1, Math.floor(primary * 0.25));
      break;
  }
  const slotName = SLOT_NAMES[slot] ?? slot;
  return {
    id: `${slot}_${rarity}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: `${rarity} ${slotName}`,
    slot,
    rarity,
    attack,
    defense,
    hp,
    luck,
    equipped: false
  };
}
function addEquipment(player, equipmentOrTemplate, rarity) {
  player.equipment ??= [];
  if (typeof equipmentOrTemplate !== "string") {
    player.equipment.push(equipmentOrTemplate);
    return equipmentOrTemplate;
  }
  const item = createEquipment(
    equipmentOrTemplate,
    player.level,
    rarity
  );
  player.equipment.push(item);
  return item;
}
function getEquippedItems(player) {
  return (player.equipment ?? []).filter((item) => item.equipped);
}
function getEquipmentPower(equipment) {
  return equipment.attack + equipment.defense + equipment.hp + equipment.luck;
}
function getTotalEquipmentPower(player) {
  return getEquippedItems(player).reduce(
    (total, equipment) => total + getEquipmentPower(equipment),
    0
  );
}
function getEquipmentSummary(player) {
  const slots = [
    "weapon",
    "armor",
    "helmet",
    "boots",
    "ring",
    "amulet"
  ];
  return slots.map((slot) => {
    const item = player.equipment.find(
      (equipment) => equipment.slot === slot && equipment.equipped
    );
    return item ? `${SLOT_EMOJIS[slot]} **${item.name}**` : `${SLOT_EMOJIS[slot]} Empty`;
  }).join("\n");
}
function getEquipmentStats(player) {
  const equipped = (player.equipment ?? []).filter(
    (item) => item.equipped
  );
  return equipped.reduce(
    (stats, item) => ({
      attack: stats.attack + (item.attack ?? 0),
      defense: stats.defense + (item.defense ?? 0),
      hp: stats.hp + (item.hp ?? 0),
      luck: stats.luck + (item.luck ?? 0)
    }),
    {
      attack: 0,
      defense: 0,
      hp: 0,
      luck: 0
    }
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RARITIES,
  SLOT_EMOJIS,
  SLOT_NAMES,
  addEquipment,
  createEquipment,
  getEquipmentPower,
  getEquipmentStats,
  getEquipmentSummary,
  getEquippedItems,
  getTotalEquipmentPower,
  rollEquipmentRarity
});
