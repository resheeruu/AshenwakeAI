import { GamePlayer, Rarity } from "./types";
import { addCoins } from "./economy";
import {
  addEquipment,
  createEquipment,
} from "./equipment";

export type WorldBossDefinition = {
  id: string;
  name: string;
  emoji: string;
  minLevel: number;
  maxHp: number;
  attack: number;
  defense: number;
  rewardCoins: [number, number];
  rewardXp: [number, number];
  rewardRarity: Rarity;
};

export type WorldBossContribution = {
  userId: string;
  damage: number;
  attacks: number;
  lastAttackAt: number;
};

export type WorldBossState = {
  id: string;
  bossId: string;
  hp: number;
  maxHp: number;
  spawnedAt: number;
  expiresAt: number;
  status: "active" | "defeated" | "expired";
  contributions: WorldBossContribution[];
};

export type WorldBossAttackResult = {
  damage: number;
  remainingHp: number;
  defeated: boolean;
  rank?: number;
  totalDamage: number;
};

export const WORLD_BOSSES: WorldBossDefinition[] = [
  {
    id: "infernal_dragon",
    name: "Infernal Dragon",
    emoji: "🐉",
    minLevel: 10,
    maxHp: 10_000_000,
    attack: 120,
    defense: 50,
    rewardCoins: [500, 1500],
    rewardXp: [250, 750],
    rewardRarity: "epic",
  },
  {
    id: "abyss_titan",
    name: "Abyss Titan",
    emoji: "🌑",
    minLevel: 30,
    maxHp: 50_000_000,
    attack: 250,
    defense: 100,
    rewardCoins: [1500, 5000],
    rewardXp: [750, 2000],
    rewardRarity: "legendary",
  },
  {
    id: "celestial_god",
    name: "Celestial God",
    emoji: "✨",
    minLevel: 50,
    maxHp: 100_000_000,
    attack: 500,
    defense: 200,
    rewardCoins: [5000, 15000],
    rewardXp: [2000, 5000],
    rewardRarity: "mythic",
  },
];

const BOSS_DURATION_MS = 60 * 60 * 1000;
const ATTACK_COOLDOWN_MS = 30 * 1000;

function randomInt(min: number, max: number): number {
  return Math.floor(
    Math.random() * (max - min + 1),
  ) + min;
}

export function getWorldBoss(
  bossId: string,
): WorldBossDefinition | undefined {
  return WORLD_BOSSES.find(
    (boss) => boss.id === bossId,
  );
}

export function createWorldBoss(
  bossId: string,
  now = Date.now(),
): WorldBossState {
  const boss = getWorldBoss(bossId);

  if (!boss) {
    throw new Error("INVALID_WORLD_BOSS");
  }

  return {
    id: `worldboss_${now}_${randomInt(1000, 9999)}`,
    bossId,
    hp: boss.maxHp,
    maxHp: boss.maxHp,
    spawnedAt: now,
    expiresAt: now + BOSS_DURATION_MS,
    status: "active",
    contributions: [],
  };
}

export function isWorldBossActive(
  state: WorldBossState,
  now = Date.now(),
): boolean {
  if (state.status !== "active") {
    return false;
  }

  if (now >= state.expiresAt) {
    state.status = "expired";
    return false;
  }

  return state.hp > 0;
}

function getContribution(
  state: WorldBossState,
  userId: string,
): WorldBossContribution {
  let contribution = state.contributions.find(
    (entry) => entry.userId === userId,
  );

  if (!contribution) {
    contribution = {
      userId,
      damage: 0,
      attacks: 0,
      lastAttackAt: 0,
    };

    state.contributions.push(contribution);
  }

  return contribution;
}

export function canAttackWorldBoss(
  state: WorldBossState,
  player: GamePlayer,
  now = Date.now(),
): boolean {
  if (!isWorldBossActive(state, now)) {
    return false;
  }

  const boss = getWorldBoss(state.bossId);

  if (!boss) {
    return false;
  }

  if (player.level < boss.minLevel) {
    return false;
  }

  const contribution = getContribution(
    state,
    player.userId,
  );

  return (
    now - contribution.lastAttackAt >=
    ATTACK_COOLDOWN_MS
  );
}

export function attackWorldBoss(
  state: WorldBossState,
  player: GamePlayer,
  now = Date.now(),
): WorldBossAttackResult {
  if (!canAttackWorldBoss(state, player, now)) {
    throw new Error("WORLD_BOSS_ATTACK_NOT_AVAILABLE");
  }

  const boss = getWorldBoss(state.bossId);

  if (!boss) {
    throw new Error("INVALID_WORLD_BOSS");
  }

  const contribution = getContribution(
    state,
    player.userId,
  );

  const damage = Math.max(
    1,
    player.attack -
      Math.floor(boss.defense * 0.5) +
      randomInt(0, Math.max(1, player.luck)),
  );

  state.hp = Math.max(
    0,
    state.hp - damage,
  );

  contribution.damage += damage;
  contribution.attacks += 1;
  contribution.lastAttackAt = now;

  if (state.hp <= 0) {
    state.status = "defeated";
  }

  const ranking = [...state.contributions]
    .sort((a, b) => b.damage - a.damage);

  const rank =
    ranking.findIndex(
      (entry) =>
        entry.userId === player.userId,
    ) + 1;

  return {
    damage,
    remainingHp: state.hp,
    defeated: state.status === "defeated",
    rank,
    totalDamage: contribution.damage,
  };
}

export function getWorldBossLeaderboard(
  state: WorldBossState,
): WorldBossContribution[] {
  return [...state.contributions].sort(
    (a, b) => b.damage - a.damage,
  );
}

export async function claimWorldBossReward(
  state: WorldBossState,
  player: GamePlayer,
): Promise<{
  coins: number;
  xp: number;
  loot: ReturnType<typeof createEquipment>;
  rank: number;
}> {
  if (state.status !== "defeated") {
    throw new Error("WORLD_BOSS_NOT_DEFEATED");
  }

  const boss = getWorldBoss(state.bossId);

  if (!boss) {
    throw new Error("INVALID_WORLD_BOSS");
  }

  const contribution = state.contributions.find(
    (entry) => entry.userId === player.userId,
  );

  if (!contribution || contribution.damage <= 0) {
    throw new Error("NO_WORLD_BOSS_CONTRIBUTION");
  }

  const ranking = getWorldBossLeaderboard(state);

  const rank =
    ranking.findIndex(
      (entry) =>
        entry.userId === player.userId,
    ) + 1;

  const rankMultiplier =
    rank === 1
      ? 3
      : rank === 2
        ? 2
        : rank === 3
          ? 1.5
          : 1;

  const coins = Math.floor(
    randomInt(
      boss.rewardCoins[0],
      boss.rewardCoins[1],
    ) * rankMultiplier,
  );

  const xp = Math.floor(
    randomInt(
      boss.rewardXp[0],
      boss.rewardXp[1],
    ) * rankMultiplier,
  );

  const templates = [
    "ashen_blade",
    "ashen_plate",
    "iron_helmet",
    "traveler_boots",
    "lucky_ring",
    "ashen_amulet",
  ];

  const templateId =
    templates[
      randomInt(0, templates.length - 1)
    ];

  const loot = createEquipment(
    templateId,
    boss.rewardRarity,
  );

  player.coins += coins;
  player.xp += xp;
  player.totalXpEarned =
    (player.totalXpEarned ?? 0) + xp;

  addEquipment(player, loot);

  return {
    coins,
    xp,
    loot,
    rank,
  };
}

export function getWorldBossMvp(
  state: WorldBossState,
): WorldBossContribution | undefined {
  return getWorldBossLeaderboard(state)[0];
}
