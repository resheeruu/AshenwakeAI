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
var chaos_exports = {};
__export(chaos_exports, {
  randomChaos: () => randomChaos
});
module.exports = __toCommonJS(chaos_exports);
const EVENTS = [
  {
    title: "\u{1F525} Ashen Surge",
    description: "The Ashen realm recognizes your presence.",
    coins: 50,
    xp: 30
  },
  {
    title: "\u{1F4B0} Lost Pouch",
    description: "You found a mysterious pouch of coins.",
    coins: 75,
    xp: 20
  },
  {
    title: "\u{1F47B} Ghost Encounter",
    description: "A ghost challenged you to survive the encounter.",
    coins: 25,
    xp: 45
  },
  {
    title: "\u{1F340} Lucky Moment",
    description: "Pure luck. Nothing more. Nothing less.",
    coins: 100,
    xp: 50
  },
  {
    title: "\u{1F480} Ashen Curse",
    description: "Something went terribly wrong...",
    coins: -25,
    xp: 10
  }
];
function randomChaos() {
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  randomChaos
});
