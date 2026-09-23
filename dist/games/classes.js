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
var classes_exports = {};
__export(classes_exports, {
  PLAYER_CLASSES: () => PLAYER_CLASSES,
  choosePlayerClass: () => choosePlayerClass,
  getPlayerClass: () => getPlayerClass
});
module.exports = __toCommonJS(classes_exports);
const PLAYER_CLASSES = [
  {
    id: "warrior",
    name: "Ashen Warrior",
    emoji: "\u2694\uFE0F",
    description: "A durable fighter with high HP and defense.",
    attack: 18,
    defense: 9,
    maxHp: 120
  },
  {
    id: "rogue",
    name: "Shadow Rogue",
    emoji: "\u{1F5E1}\uFE0F",
    description: "A fast assassin with powerful attacks.",
    attack: 24,
    defense: 5,
    maxHp: 90
  },
  {
    id: "mage",
    name: "Ember Mage",
    emoji: "\u{1F525}",
    description: "A fragile spellcaster with devastating attacks.",
    attack: 30,
    defense: 3,
    maxHp: 80
  }
];
function getPlayerClass(id) {
  return PLAYER_CLASSES.find((playerClass) => playerClass.id === id);
}
function choosePlayerClass(player, classId) {
  const selectedClass = getPlayerClass(classId);
  if (!selectedClass) {
    throw new Error("INVALID_CLASS");
  }
  player.classId = selectedClass.id;
  player.attack = selectedClass.attack;
  player.defense = selectedClass.defense;
  player.maxHp = selectedClass.maxHp;
  player.hp = selectedClass.maxHp;
  return selectedClass;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PLAYER_CLASSES,
  choosePlayerClass,
  getPlayerClass
});
