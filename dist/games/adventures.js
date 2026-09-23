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
var adventures_exports = {};
__export(adventures_exports, {
  adventure: () => adventure,
  getAdventureMonsters: () => getAdventureMonsters
});
module.exports = __toCommonJS(adventures_exports);
var import_world = require("./world");
var import_equipment = require("./equipment");
var import_rewards = require("./rewards");
const MONSTERS = [
  {
    id: "wolf",
    name: "Blackwood Wolf",
    emoji: "\u{1F43A}",
    description: "A hungry predator stalking the forest.",
    level: 2,
    hp: 45,
    attack: 12,
    defense: 3,
    rewardCoins: [20, 45],
    rewardXp: [15, 30],
    reputation: 2,
    rarity: "common"
  },
  {
    id: "undead",
    name: "Ashen Undead",
    emoji: "\u{1F9DF}",
    description: "A corpse animated by dark ash magic.",
    level: 6,
    hp: 90,
    attack: 20,
    defense: 7,
    rewardCoins: [45, 90],
    rewardXp: [35, 65],
    reputation: 5,
    rarity: "uncommon"
  },
  {
    id: "demon",
    name: "Crimson Demon",
    emoji: "\u{1F479}",
    description: "A demon born beneath the Crimson Wastes.",
    level: 15,
    hp: 220,
    attack: 38,
    defense: 15,
    rewardCoins: [120, 250],
    rewardXp: [100, 180],
    reputation: 15,
    rarity: "rare"
  },
  {
    id: "dragon",
    name: "Infernal Dragon",
    emoji: "\u{1F409}",
    description: "An ancient dragon covered in molten scales.",
    level: 30,
    hp: 650,
    attack: 75,
    defense: 30,
    rewardCoins: [500, 1e3],
    rewardXp: [400, 700],
    reputation: 40,
    rarity: "legendary"
  },
  {
    id: "ancient_boss",
    name: "Ancient Shadow",
    emoji: "\u{1F451}",
    description: "Something ancient is watching from the darkness.",
    level: 50,
    hp: 1500,
    attack: 130,
    defense: 55,
    rewardCoins: [1500, 3500],
    rewardXp: [1e3, 1800],
    reputation: 100,
    rarity: "mythic"
  }
];
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pickMonster(player) {
  const region = (0, import_world.getRegion)(player.regionId);
  const available = MONSTERS.filter(
    (monster) => monster.level <= player.level + region.danger * 5
  );
  const pool = available.length > 0 ? available : [MONSTERS[0]];
  return pool[randomInt(0, pool.length - 1)];
}
function calculateDamage(attack, defense) {
  const variance = randomInt(85, 115) / 100;
  return Math.max(
    1,
    Math.floor(
      (attack - defense * 0.45) * variance
    )
  );
}
function adventure(player) {
  const region = (0, import_world.getRegion)(player.regionId);
  const encounter = pickMonster(player);
  const equipmentStats = (0, import_equipment.getEquipmentStats)(player);
  const effectiveAttack = player.attack + equipmentStats.attack;
  const effectiveDefense = player.defense + equipmentStats.defense;
  const effectiveLuck = player.luck + equipmentStats.luck;
  const effectiveMaxHp = player.maxHp + equipmentStats.hp;
  const playerPower = effectiveAttack + Math.floor(effectiveLuck * 0.5);
  const monsterPower = encounter.attack + encounter.level;
  const fleeChance = effectiveLuck >= 10 ? 0.25 : 0.12;
  if (Math.random() < fleeChance) {
    return {
      encounter,
      victory: false,
      fled: true,
      playerDamage: 0,
      monsterDamage: 0,
      coins: 0,
      xp: 0,
      reputation: 0,
      death: false,
      narrative: `\u{1F332} The ${region.name} falls silent.

You sense ${encounter.emoji} **${encounter.name}** nearby.

\u{1F3C3} You escape before it notices you.`
    };
  }
  const playerDamage = calculateDamage(
    playerPower,
    encounter.defense
  );
  const monsterDamage = calculateDamage(
    monsterPower,
    effectiveDefense
  );
  const combatScore = playerDamage * 1.2 - monsterDamage + randomInt(-10, 10);
  const victory = combatScore >= encounter.level * 2;
  if (!victory) {
    const lethal = monsterDamage >= player.hp || player.hp <= 1;
    if (lethal) {
      player.deaths += 1;
      player.streak = 0;
      player.hp = Math.max(
        1,
        Math.floor(effectiveMaxHp * 0.5)
      );
      const xp3 = Math.floor(
        encounter.rewardXp[0] * 0.25
      );
      player.xp += xp3;
      player.totalXpEarned = (player.totalXpEarned ?? 0) + xp3;
      (0, import_rewards.applyLevelUp)(player);
      return {
        encounter,
        victory: false,
        fled: false,
        playerDamage,
        monsterDamage,
        coins: 0,
        xp: xp3,
        reputation: 0,
        death: true,
        narrative: `\u{1F480} **${encounter.name}** overwhelms you.

You awaken later in **${region.name}**, badly wounded.

\u2620\uFE0F Deaths: **${player.deaths}**
\u2764\uFE0F HP restored to **${player.hp}/${player.maxHp}**`
      };
    }
    player.hp = Math.max(
      1,
      player.hp - monsterDamage
    );
    const xp2 = Math.floor(
      encounter.rewardXp[0] * 0.5
    );
    player.xp += xp2;
    player.totalXpEarned = (player.totalXpEarned ?? 0) + xp2;
    (0, import_rewards.applyLevelUp)(player);
    return {
      encounter,
      victory: false,
      fled: false,
      playerDamage,
      monsterDamage,
      coins: 0,
      xp: xp2,
      reputation: 0,
      death: false,
      narrative: `${encounter.emoji} **${encounter.name}** defeats you.

\u2764\uFE0F You survive with **${player.hp}/${player.maxHp} HP**.`
    };
  }
  const coins = randomInt(
    encounter.rewardCoins[0],
    encounter.rewardCoins[1]
  );
  const xp = randomInt(
    encounter.rewardXp[0],
    encounter.rewardXp[1]
  );
  player.coins += coins;
  player.xp += xp;
  player.totalXpEarned = (player.totalXpEarned ?? 0) + xp;
  (0, import_rewards.applyLevelUp)(player);
  player.reputation += encounter.reputation;
  player.hp = Math.min(
    effectiveMaxHp,
    player.hp + Math.floor(effectiveMaxHp * 0.1)
  );
  const luckRoll = Math.random() + effectiveLuck * 0.01;
  const loot = luckRoll > 0.92 ? `${encounter.rarity}_relic` : void 0;
  return {
    encounter,
    victory: true,
    fled: false,
    playerDamage,
    monsterDamage,
    coins,
    xp,
    reputation: encounter.reputation,
    loot,
    death: false,
    narrative: `${region.name} trembles beneath your footsteps.

${encounter.emoji} **${encounter.name}** appears!

\u2694\uFE0F You strike for **${playerDamage} damage**.
\u{1F4A5} The creature strikes for **${monsterDamage} damage**.

\u{1F3C6} **Victory!**
\u{1FA99} +${coins} coins
\u2728 +${xp} XP
\u{1F525} +${encounter.reputation} reputation` + (loot ? `
\u{1F381} Rare loot: **${loot}**` : "")
  };
}
function getAdventureMonsters() {
  return [...MONSTERS];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  adventure,
  getAdventureMonsters
});
