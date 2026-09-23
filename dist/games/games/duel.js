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
var duel_exports = {};
__export(duel_exports, {
  simulateDuel: () => simulateDuel
});
module.exports = __toCommonJS(duel_exports);
function calculateDamage(attacker, defender) {
  const critical = Math.random() < 0.15;
  const baseDamage = Math.max(
    1,
    attacker.attack - Math.floor(defender.defense * 0.5)
  );
  const variance = Math.floor(Math.random() * 7) - 3;
  const damage = Math.max(
    1,
    baseDamage + variance
  );
  return {
    damage: critical ? Math.max(2, damage * 2) : damage,
    critical
  };
}
function simulateDuel(first, second) {
  const firstHp = first.hp;
  const secondHp = second.hp;
  let hp1 = firstHp;
  let hp2 = secondHp;
  let turns = 0;
  while (hp1 > 0 && hp2 > 0 && turns < 100) {
    turns++;
    const attack1 = calculateDamage(
      first,
      second
    );
    hp2 -= attack1.damage;
    if (hp2 <= 0) {
      return {
        winner: first,
        loser: second,
        turns
      };
    }
    turns++;
    const attack2 = calculateDamage(
      second,
      first
    );
    hp1 -= attack2.damage;
    if (hp1 <= 0) {
      return {
        winner: second,
        loser: first,
        turns
      };
    }
  }
  return hp1 >= hp2 ? {
    winner: first,
    loser: second,
    turns
  } : {
    winner: second,
    loser: first,
    turns
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  simulateDuel
});
