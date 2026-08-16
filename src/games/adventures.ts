import { GamePlayer, Rarity } from "./types";
import { getRegion } from "./world";
import { getEquipmentStats } from "./equipment";
import { applyLevelUp } from "./rewards";

export type EncounterType =
  | "wolf"
  | "undead"
  | "demon"
  | "dragon"
  | "ancient_boss"
  | "world_event";

export type AdventureMonster = {
  id: EncounterType;
  name: string;
  emoji: string;
  description: string;
  level: number;
  hp: number;
  attack: number;
  defense: number;
  rewardCoins: [number, number];
  rewardXp: [number, number];
  reputation: number;
  rarity: Rarity;
};

export type AdventureResult = {
  encounter: AdventureMonster;
  victory: boolean;
  fled: boolean;
  playerDamage: number;
  monsterDamage: number;
  coins: number;
  xp: number;
  reputation: number;
  loot?: string;
  death: boolean;
  narrative: string;
};

const MONSTERS: AdventureMonster[] = [
  {
    id: "wolf",
    name: "Blackwood Wolf",
    emoji: "🐺",
    description: "A hungry predator stalking the forest.",
    level: 2,
    hp: 45,
    attack: 12,
    defense: 3,
    rewardCoins: [20, 45],
    rewardXp: [15, 30],
    reputation: 2,
    rarity: "common",
  },
  {
    id: "undead",
    name: "Ashen Undead",
    emoji: "🧟",
    description: "A corpse animated by dark ash magic.",
    level: 6,
    hp: 90,
    attack: 20,
    defense: 7,
    rewardCoins: [45, 90],
    rewardXp: [35, 65],
    reputation: 5,
    rarity: "uncommon",
  },
  {
    id: "demon",
    name: "Crimson Demon",
    emoji: "👹",
    description: "A demon born beneath the Crimson Wastes.",
    level: 15,
    hp: 220,
    attack: 38,
    defense: 15,
    rewardCoins: [120, 250],
    rewardXp: [100, 180],
    reputation: 15,
    rarity: "rare",
  },
  {
    id: "dragon",
    name: "Infernal Dragon",
    emoji: "🐉",
    description: "An ancient dragon covered in molten scales.",
    level: 30,
    hp: 650,
    attack: 75,
    defense: 30,
    rewardCoins: [500, 1000],
    rewardXp: [400, 700],
    reputation: 40,
    rarity: "legendary",
  },
  {
    id: "ancient_boss",
    name: "Ancient Shadow",
    emoji: "👑",
    description: "Something ancient is watching from the darkness.",
    level: 50,
    hp: 1500,
    attack: 130,
    defense: 55,
    rewardCoins: [1500, 3500],
    rewardXp: [1000, 1800],
    reputation: 100,
    rarity: "mythic",
  },
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickMonster(player: GamePlayer): AdventureMonster {
  const region = getRegion(player.regionId);

  const available = MONSTERS.filter(
    (monster) =>
      monster.level <= player.level + region.danger * 5,
  );

  const pool = available.length > 0
    ? available
    : [MONSTERS[0]];

  return pool[randomInt(0, pool.length - 1)];
}

function calculateDamage(
  attack: number,
  defense: number,
): number {
  const variance = randomInt(85, 115) / 100;

  return Math.max(
    1,
    Math.floor(
      (attack - defense * 0.45) * variance,
    ),
  );
}

export function adventure(
  player: GamePlayer,
): AdventureResult {
  const region = getRegion(player.regionId);
  const encounter = pickMonster(player);

  const equipmentStats = getEquipmentStats(player);
  const effectiveAttack =
    player.attack + equipmentStats.attack;
  const effectiveDefense =
    player.defense + equipmentStats.defense;
  const effectiveLuck =
    player.luck + equipmentStats.luck;
  const effectiveMaxHp =
    player.maxHp + equipmentStats.hp;

  const playerPower =
    effectiveAttack +
    Math.floor(effectiveLuck * 0.5);

  const monsterPower =
    encounter.attack +
    encounter.level;

  const fleeChance =
    effectiveLuck >= 10
      ? 0.25
      : 0.12;

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
      narrative:
        `🌲 The ${region.name} falls silent.\n\n` +
        `You sense ${encounter.emoji} **${encounter.name}** nearby.\n\n` +
        `🏃 You escape before it notices you.`,
    };
  }

  const playerDamage = calculateDamage(
    playerPower,
    encounter.defense,
  );

  const monsterDamage = calculateDamage(
    monsterPower,
    effectiveDefense,
  );

  const combatScore =
    playerDamage * 1.2 -
    monsterDamage +
    randomInt(-10, 10);

  const victory =
    combatScore >= encounter.level * 2;

  if (!victory) {
    const lethal =
      monsterDamage >= player.hp ||
      player.hp <= 1;

    if (lethal) {
      player.deaths += 1;
      player.streak = 0;

      player.hp = Math.max(
        1,
        Math.floor(effectiveMaxHp * 0.5),
      );

      const xp = Math.floor(
        encounter.rewardXp[0] * 0.25,
      );

      player.xp += xp;
      player.totalXpEarned =
        (player.totalXpEarned ?? 0) + xp;
      applyLevelUp(player);

      return {
        encounter,
        victory: false,
        fled: false,
        playerDamage,
        monsterDamage,
        coins: 0,
        xp,
        reputation: 0,
        death: true,
        narrative:
          `💀 **${encounter.name}** overwhelms you.\n\n` +
          `You awaken later in **${region.name}**, badly wounded.\n\n` +
          `☠️ Deaths: **${player.deaths}**\n` +
          `❤️ HP restored to **${player.hp}/${player.maxHp}**`,
      };
    }

    player.hp = Math.max(
      1,
      player.hp - monsterDamage,
    );

    const xp = Math.floor(
      encounter.rewardXp[0] * 0.5,
    );

    player.xp += xp;
    player.totalXpEarned =
      (player.totalXpEarned ?? 0) + xp;
    applyLevelUp(player);

    return {
      encounter,
      victory: false,
      fled: false,
      playerDamage,
      monsterDamage,
      coins: 0,
      xp,
      reputation: 0,
      death: false,
      narrative:
        `${encounter.emoji} **${encounter.name}** defeats you.\n\n` +
        `❤️ You survive with **${player.hp}/${player.maxHp} HP**.`,
    };
  }

  const coins = randomInt(
    encounter.rewardCoins[0],
    encounter.rewardCoins[1],
  );

  const xp = randomInt(
    encounter.rewardXp[0],
    encounter.rewardXp[1],
  );

  player.coins += coins;
  player.xp += xp;
  player.totalXpEarned =
    (player.totalXpEarned ?? 0) + xp;

  applyLevelUp(player);
  player.reputation += encounter.reputation;

  player.hp = Math.min(
    effectiveMaxHp,
    player.hp + Math.floor(effectiveMaxHp * 0.1),
  );

  const luckRoll =
    Math.random() +
    effectiveLuck * 0.01;

  const loot =
    luckRoll > 0.92
      ? `${encounter.rarity}_relic`
      : undefined;

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
    narrative:
      `${region.name} trembles beneath your footsteps.\n\n` +
      `${encounter.emoji} **${encounter.name}** appears!\n\n` +
      `⚔️ You strike for **${playerDamage} damage**.\n` +
      `💥 The creature strikes for **${monsterDamage} damage**.\n\n` +
      `🏆 **Victory!**\n` +
      `🪙 +${coins} coins\n` +
      `✨ +${xp} XP\n` +
      `🔥 +${encounter.reputation} reputation` +
      (loot
        ? `\n🎁 Rare loot: **${loot}**`
        : ""),
  };
}

export function getAdventureMonsters(): AdventureMonster[] {
  return [...MONSTERS];
}
