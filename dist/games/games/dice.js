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
var dice_exports = {};
__export(dice_exports, {
  rollDice: () => rollDice
});
module.exports = __toCommonJS(dice_exports);
function rollDice(sides = 6) {
  if (!Number.isInteger(sides) || sides < 2 || sides > 100) {
    throw new Error("Dice must have between 2 and 100 sides.");
  }
  return Math.floor(Math.random() * sides) + 1;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  rollDice
});
