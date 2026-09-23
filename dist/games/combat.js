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
var combat_exports = {};
__export(combat_exports, {
  createEnemyCombatant: () => createEnemyCombatant,
  createPlayerCombatant: () => createPlayerCombatant,
  resolveCombatTurn: () => resolveCombatTurn,
  runFullCombat: () => runFullCombat
});
module.exports = __toCommonJS(combat_exports);
var import_equipment = require("./equipment");
var import_config = require("./config");
function createPlayerCombatant(player) {
  const equipStats = (0, import_equipment.getEquipmentStats)(player);
  return {
    id: player.userId,
    name: player.username,
    emoji: "\u2694\uFE0F",
    hp: player.hp,
    maxHp: player.maxHp + equipStats.hp,
    attack: player.attack + equipStats.attack,
    defense: player.defense + equipStats.defense,
    luck: player.luck + equipStats.luck,
    isPlayer: true
  };
}
function createEnemyCombatant(config) {
  return {
    id: config.id,
    name: config.name,
    emoji: config.emoji,
    hp: config.hp,
    maxHp: config.hp,
    attack: config.attack,
    defense: config.defense,
    luck: config.luck ?? 0,
    isPlayer: false
  };
}
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function calculateDamage(attack, defense, multiplier = 1) {
  const critChance = import_config.GAME_CONFIG.combat.baseCritChance;
  const critMult = import_config.GAME_CONFIG.combat.critMultiplier;
  const isCrit = Math.random() < critChance;
  const baseDamage = Math.max(
    1,
    Math.floor((attack * multiplier - defense * 0.5) * (0.85 + Math.random() * 0.3))
  );
  const damage = isCrit ? Math.floor(baseDamage * critMult) : baseDamage;
  return { damage, critical: isCrit };
}
function checkDodge(dodgerLuck, attackerLuck) {
  const baseDodge = import_config.GAME_CONFIG.combat.baseDodgeChance;
  const luckBonus = (dodgerLuck - attackerLuck) * 2e-3;
  return Math.random() < baseDodge + luckBonus;
}
function resolveCombatTurn(attacker, defender, action) {
  if (action === "flee") {
    const fleeChance = import_config.GAME_CONFIG.combat.fleeBaseChance + attacker.luck * 5e-3;
    const fled = Math.random() < fleeChance;
    return {
      action: "flee",
      attackerDamage: 0,
      defenderDamage: 0,
      attackerHp: attacker.hp,
      defenderHp: defender.hp,
      critical: false,
      dodged: false,
      fled,
      defenderDefeated: false,
      attackerDefeated: false,
      narrative: fled ? `${attacker.emoji} **${attacker.name}** fled from battle!` : `${attacker.emoji} **${attacker.name}** tried to flee but failed!`
    };
  }
  if (action === "defend") {
    const { damage: damage2, critical: critical2 } = calculateDamage(defender.attack, attacker.defense);
    const reducedDamage = Math.floor(damage2 * import_config.GAME_CONFIG.combat.defendDamageReduction);
    attacker.hp = Math.max(0, attacker.hp - reducedDamage);
    return {
      action: "defend",
      attackerDamage: 0,
      defenderDamage: reducedDamage,
      attackerHp: attacker.hp,
      defenderHp: defender.hp,
      critical: false,
      dodged: false,
      fled: false,
      defenderDefeated: false,
      attackerDefeated: attacker.hp <= 0,
      narrative: `${attacker.emoji} **${attacker.name}** takes a defensive stance.
${defender.emoji} **${defender.name}** attacks for **${reducedDamage}** reduced damage!`
    };
  }
  const multiplier = action === "ability" ? import_config.GAME_CONFIG.combat.abilityDamageMultiplier : 1;
  const dodged = checkDodge(defender.luck, attacker.luck);
  if (dodged) {
    return {
      action,
      attackerDamage: 0,
      defenderDamage: 0,
      attackerHp: attacker.hp,
      defenderHp: defender.hp,
      critical: false,
      dodged: true,
      fled: false,
      defenderDefeated: false,
      attackerDefeated: false,
      narrative: `${attacker.emoji} **${attacker.name}** attacks but **${defender.name}** dodges!`
    };
  }
  const { damage, critical } = calculateDamage(attacker.attack, defender.defense, multiplier);
  defender.hp = Math.max(0, defender.hp - damage);
  const critText = critical ? " **CRITICAL HIT!**" : "";
  const abilityText = action === "ability" ? " uses a powerful ability!" : " attacks!";
  return {
    action,
    attackerDamage: damage,
    defenderDamage: 0,
    attackerHp: attacker.hp,
    defenderHp: defender.hp,
    critical,
    dodged: false,
    fled: false,
    defenderDefeated: defender.hp <= 0,
    attackerDefeated: false,
    narrative: `${attacker.emoji} **${attacker.name}**${abilityText}
\u{1F4A5} Deals **${damage}** damage to ${defender.name}!${critText}
\u2764\uFE0F ${defender.name}: **${defender.hp}/${defender.maxHp} HP**`
  };
}
function runFullCombat(playerCombatant, enemyCombatant, maxTurns = 50) {
  let totalTurns = 0;
  let playerDamageDealt = 0;
  let playerDamageTaken = 0;
  while (playerCombatant.hp > 0 && enemyCombatant.hp > 0 && totalTurns < maxTurns) {
    const playerAction = playerCombatant.hp < playerCombatant.maxHp * 0.2 && Math.random() < 0.3 ? "defend" : Math.random() < 0.15 ? "ability" : "attack";
    const playerTurn = resolveCombatTurn(
      playerCombatant,
      enemyCombatant,
      playerAction
    );
    playerDamageDealt += playerTurn.attackerDamage;
    totalTurns++;
    if (playerTurn.fled) {
      return {
        winner: "fled",
        totalTurns,
        playerDamageDealt,
        playerDamageTaken,
        enemyDamageDealt: playerDamageTaken,
        enemyDamageTaken: playerDamageDealt,
        narrative: playerTurn.narrative
      };
    }
    if (playerTurn.defenderDefeated) {
      return {
        winner: "player",
        totalTurns,
        playerDamageDealt,
        playerDamageTaken,
        enemyDamageDealt: playerDamageTaken,
        enemyDamageTaken: playerDamageDealt,
        narrative: playerTurn.narrative
      };
    }
    const enemyAction = enemyCombatant.hp < enemyCombatant.maxHp * 0.2 && Math.random() < 0.2 ? "defend" : Math.random() < 0.1 ? "ability" : "attack";
    const enemyTurn = resolveCombatTurn(
      enemyCombatant,
      playerCombatant,
      enemyAction
    );
    playerDamageTaken += enemyTurn.attackerDamage;
    totalTurns++;
    if (enemyTurn.defenderDefeated) {
      return {
        winner: "enemy",
        totalTurns,
        playerDamageDealt,
        playerDamageTaken,
        enemyDamageDealt: playerDamageTaken,
        enemyDamageTaken: playerDamageDealt,
        narrative: enemyTurn.narrative
      };
    }
  }
  return {
    winner: totalTurns >= maxTurns ? "enemy" : playerCombatant.hp > 0 ? "player" : "enemy",
    totalTurns,
    playerDamageDealt,
    playerDamageTaken,
    enemyDamageDealt: playerDamageTaken,
    enemyDamageTaken: playerDamageDealt,
    narrative: "The battle has ended."
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createEnemyCombatant,
  createPlayerCombatant,
  resolveCombatTurn,
  runFullCombat
});
