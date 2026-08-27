import { GamePlayer } from "./types";
import { getEquipmentStats } from "./equipment";
import { GAME_CONFIG } from "./config";

export type CombatAction = "attack" | "defend" | "ability" | "flee";

export type Combatant = {
  id: string;
  name: string;
  emoji: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  luck: number;
  isPlayer: boolean;
};

export type CombatTurnResult = {
  action: CombatAction;
  attackerDamage: number;
  defenderDamage: number;
  attackerHp: number;
  defenderHp: number;
  critical: boolean;
  dodged: boolean;
  fled: boolean;
  defenderDefeated: boolean;
  attackerDefeated: boolean;
  narrative: string;
};

export type CombatEndResult = {
  winner: "player" | "enemy" | "fled";
  totalTurns: number;
  playerDamageDealt: number;
  playerDamageTaken: number;
  enemyDamageDealt: number;
  enemyDamageTaken: number;
  narrative: string;
};

export function createPlayerCombatant(player: GamePlayer): Combatant {
  const equipStats = getEquipmentStats(player);

  return {
    id: player.userId,
    name: player.username,
    emoji: "⚔️",
    hp: player.hp,
    maxHp: player.maxHp + equipStats.hp,
    attack: player.attack + equipStats.attack,
    defense: player.defense + equipStats.defense,
    luck: player.luck + equipStats.luck,
    isPlayer: true,
  };
}

export function createEnemyCombatant(config: {
  id: string;
  name: string;
  emoji: string;
  hp: number;
  attack: number;
  defense: number;
  luck?: number;
}): Combatant {
  return {
    id: config.id,
    name: config.name,
    emoji: config.emoji,
    hp: config.hp,
    maxHp: config.hp,
    attack: config.attack,
    defense: config.defense,
    luck: config.luck ?? 0,
    isPlayer: false,
  };
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calculateDamage(
  attack: number,
  defense: number,
  multiplier = 1,
): { damage: number; critical: boolean } {
  const critChance = GAME_CONFIG.combat.baseCritChance;
  const critMult = GAME_CONFIG.combat.critMultiplier;
  const isCrit = Math.random() < critChance;

  const baseDamage = Math.max(
    1,
    Math.floor((attack * multiplier - defense * 0.5) * (0.85 + Math.random() * 0.3)),
  );

  const damage = isCrit ? Math.floor(baseDamage * critMult) : baseDamage;

  return { damage, critical: isCrit };
}

function checkDodge(dodgerLuck: number, attackerLuck: number): boolean {
  const baseDodge = GAME_CONFIG.combat.baseDodgeChance;
  const luckBonus = (dodgerLuck - attackerLuck) * 0.002;
  return Math.random() < baseDodge + luckBonus;
}

export function resolveCombatTurn(
  attacker: Combatant,
  defender: Combatant,
  action: CombatAction,
): CombatTurnResult {
  if (action === "flee") {
    const fleeChance = GAME_CONFIG.combat.fleeBaseChance + (attacker.luck * 0.005);
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
      narrative: fled
        ? `${attacker.emoji} **${attacker.name}** fled from battle!`
        : `${attacker.emoji} **${attacker.name}** tried to flee but failed!`,
    };
  }

  if (action === "defend") {
    const { damage, critical } = calculateDamage(defender.attack, attacker.defense);
    const reducedDamage = Math.floor(damage * GAME_CONFIG.combat.defendDamageReduction);

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
      narrative:
        `${attacker.emoji} **${attacker.name}** takes a defensive stance.\n` +
        `${defender.emoji} **${defender.name}** attacks for **${reducedDamage}** reduced damage!`,
    };
  }

  const multiplier =
    action === "ability" ? GAME_CONFIG.combat.abilityDamageMultiplier : 1;

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
      narrative:
        `${attacker.emoji} **${attacker.name}** attacks but **${defender.name}** dodges!`,
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
    narrative:
      `${attacker.emoji} **${attacker.name}**${abilityText}\n` +
      `💥 Deals **${damage}** damage to ${defender.name}!${critText}\n` +
      `❤️ ${defender.name}: **${defender.hp}/${defender.maxHp} HP**`,
  };
}

export function runFullCombat(
  playerCombatant: Combatant,
  enemyCombatant: Combatant,
  maxTurns = 50,
): CombatEndResult {
  let totalTurns = 0;
  let playerDamageDealt = 0;
  let playerDamageTaken = 0;

  while (
    playerCombatant.hp > 0 &&
    enemyCombatant.hp > 0 &&
    totalTurns < maxTurns
  ) {
    const playerAction: CombatAction =
      playerCombatant.hp < playerCombatant.maxHp * 0.2 && Math.random() < 0.3
        ? "defend"
        : Math.random() < 0.15
          ? "ability"
          : "attack";

    const playerTurn = resolveCombatTurn(
      playerCombatant,
      enemyCombatant,
      playerAction,
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
        narrative: playerTurn.narrative,
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
        narrative: playerTurn.narrative,
      };
    }

    const enemyAction: CombatAction =
      enemyCombatant.hp < enemyCombatant.maxHp * 0.2 && Math.random() < 0.2
        ? "defend"
        : Math.random() < 0.1
          ? "ability"
          : "attack";

    const enemyTurn = resolveCombatTurn(
      enemyCombatant,
      playerCombatant,
      enemyAction,
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
        narrative: enemyTurn.narrative,
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
    narrative: "The battle has ended.",
  };
}
