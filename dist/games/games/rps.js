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
var rps_exports = {};
__export(rps_exports, {
  playRPS: () => playRPS,
  randomRPS: () => randomRPS
});
module.exports = __toCommonJS(rps_exports);
function playRPS(player, bot) {
  if (player === bot) return "draw";
  if (player === "rock" && bot === "scissors" || player === "paper" && bot === "rock" || player === "scissors" && bot === "paper") {
    return "win";
  }
  return "loss";
}
function randomRPS() {
  const choices = ["rock", "paper", "scissors"];
  return choices[Math.floor(Math.random() * choices.length)];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  playRPS,
  randomRPS
});
