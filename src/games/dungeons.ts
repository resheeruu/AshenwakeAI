import { GamePlayer, Rarity } from "./types";
import {
  addEquipment,
  createEquipment,
} from "./equipment";

export type DungeonAction =
  | "attack"
  | "defend"
  | "ability"
  | "flee";

export type DungeonDefinition = {
  id: string;
  name: string;
  emoji: string;
  minLevel: number;
  recommendedPlayers: number;
  bossName: string;
  bossHp: number;
  bossAttack: number;
  bossDefense: number;
  rewardCoins: [number, number];
  rewardXp: [number, number];
  rewardRarity: Rarity;
};

export type DungeonMemberState = {
  userId: string;
  damageDealt: number;
  damageTaken: number;
  defending: boolean;
  alive: boolean;
  fled: boolean;
  rewardClaimed?: boolean;
};

export type DungeonState = {
  id: string;
  dungeonId: string;
  leaderId: string;
  playerIds: string[];
  members: DungeonMemberState[];
  bossHp: number;
  round: number;
  status: "lobby" | "active" | "completed" | "failed";
  createdAt: number;
};

export type DungeonActionResult = {
  action: DungeonAction;
  damageDealt: number;
  damageTaken: number;
  bossHp: number;
  defeated: boolean;
  playerDefeated: boolean;
  fled: boolean;
};

export const DUNGEONS: DungeonDefinition[] = [
  {
    id: "ashen_crypt",
    name: "Ashen Crypt",
    emoji: "🏰",
    minLevel: 5,
    recommendedPlayers: 3,
    bossName: "Crypt Lord",
    bossHp: 2500,
    bossAttack: 45,
    bossDefense: 20,
    rewardCoins: [500, 1200],
    rewardXp: [300, 650],
    rewardRarity: "rare",
  },
  {
    id: "crimson_fortress",
    name: "Crimson Fortress",
    emoji: "🌋",
    minLevel: 15,
    recommendedPlayers: 3,
    bossName: "Demon General",
    bossHp: 7000,
    bossAttack: 80,
    bossDefense: 40,
    rewardCoins: [1500, 3500],
    rewardXp: [700, 1300],
    rewardRarity: "epic",
  },
  {
    id: "abyssal_gate",
    name: "Abyssal Gate",
    emoji: "🌑",
    minLevel: 30,
    recommendedPlayers: 4,
    bossName: "Abyss Warden",
    bossHp: 18000,
    bossAttack: 140,
    bossDefense: 75,
    rewardCoins: [4000, 9000],
    rewardXp: [1500, 3000],
    rewardRarity: "legendary",
  },
  {
    id: "celestial_spire",
    name: "Celestial Spire",
    emoji: "✨",
    minLevel: 50,
    recommendedPlayers: 5,
    bossName: "Celestial Tyrant",
    bossHp: 50000,
    bossAttack: 250,
    bossDefense: 130,
    rewardCoins: [12000, 30000],
    rewardXp: [3500, 7000],
    rewardRarity: "mythic",
  },
];

function randomInt(min: number, max: number): number {
  return Math.floor(
    Math.random() * (max - min + 1),
  ) + min;
}

export function getDungeon(
  dungeonId: string,
): DungeonDefinition | undefined {
  return DUNGEONS.find(
    (dungeon) => dungeon.id === dungeonId,
  );
}

export function canEnterDungeon(
  player: GamePlayer,
  dungeon: DungeonDefinition,
): boolean {
  return player.level >= dungeon.minLevel;
}

export function createDungeon(
  dungeonId: string,
  leader: GamePlayer,
): DungeonState {
  const dungeon = getDungeon(dungeonId);

  if (!dungeon) {
    throw new Error("INVALID_DUNGEON");
  }

  if (!canEnterDungeon(leader, dungeon)) {
    throw new Error("DUNGEON_LEVEL_TOO_LOW");
  }

  return {
    id: `dungeon_${Date.now()}_${randomInt(1000, 9999)}`,
    dungeonId,
    leaderId: leader.userId,
    playerIds: [leader.userId],
    members: [
      {
        userId: leader.userId,
        damageDealt: 0,
        damageTaken: 0,
        defending: false,
        alive: true,
        fled: false,
      },
    ],
    bossHp: dungeon.bossHp,
    round: 0,
    status: "lobby",
    createdAt: Date.now(),
  };
}

export function addDungeonMember(
  state: DungeonState,
  player: GamePlayer,
  maxPlayers?: number,
): void {
  if (state.status !== "lobby") {
    throw new Error("DUNGEON_NOT_RECRUITING");
  }

  if (state.playerIds.includes(player.userId)) {
    throw new Error("PLAYER_ALREADY_IN_DUNGEON");
  }

  const dungeon = getDungeon(state.dungeonId);

  if (!dungeon) {
    throw new Error("INVALID_DUNGEON");
  }

  if (!canEnterDungeon(player, dungeon)) {
    throw new Error("DUNGEON_LEVEL_TOO_LOW");
  }

  const limit =
    maxPlayers ?? dungeon.recommendedPlayers;

  if (state.playerIds.length >= limit) {
    throw new Error("DUNGEON_PARTY_FULL");
  }

  state.playerIds.push(player.userId);

  state.members.push({
    userId: player.userId,
    damageDealt: 0,
    damageTaken: 0,
    defending: false,
    alive: true,
    fled: false,
  });
}

export function startDungeon(
  state: DungeonState,
): void {
  if (state.status !== "lobby") {
    throw new Error("DUNGEON_ALREADY_STARTED");
  }

  if (state.playerIds.length === 0) {
    throw new Error("DUNGEON_EMPTY");
  }

  state.status = "active";
  state.round = 1;
}

export function performDungeonAction(
  state: DungeonState,
  player: GamePlayer,
  action: DungeonAction,
): DungeonActionResult {
  if (state.status !== "active") {
    throw new Error("DUNGEON_NOT_ACTIVE");
  }

  const member = state.members.find(
    (entry) => entry.userId === player.userId,
  );

  if (!member) {
    throw new Error("PLAYER_NOT_IN_DUNGEON");
  }

  if (!member.alive || member.fled) {
    throw new Error("PLAYER_CANNOT_ACT");
  }

  const dungeon = getDungeon(state.dungeonId);

  if (!dungeon) {
    throw new Error("INVALID_DUNGEON");
  }

  member.defending = false;

  if (action === "flee") {
    const fleeSuccess = Math.random() < 0.35;

    if (fleeSuccess) {
      member.fled = true;
      member.alive = false;

      const anyAlive = state.members.some(
        (entry) => entry.alive && !entry.fled,
      );

      if (!anyAlive) {
        state.status = "failed";
      }

      return {
        action,
        damageDealt: 0,
        damageTaken: 0,
        bossHp: state.bossHp,
        defeated: false,
        playerDefeated: false,
        fled: true,
      };
    }

    return {
      action,
      damageDealt: 0,
      damageTaken: 5,
      bossHp: state.bossHp,
      defeated: false,
      playerDefeated: false,
      fled: false,
    };
  }

  let damageDealt = 0;

  if (action === "attack") {
    damageDealt = Math.max(
      1,
      player.attack - dungeon.bossDefense,
    );
  }

  if (action === "ability") {
    damageDealt = Math.max(
      5,
      Math.floor(
        player.attack * 1.75 -
          dungeon.bossDefense * 0.5,
      ),
    );
  }

  if (action === "defend") {
    member.defending = true;
  }

  state.bossHp = Math.max(
    0,
    state.bossHp - damageDealt,
  );

  member.damageDealt += damageDealt;

  if (state.bossHp <= 0) {
    state.status = "completed";

    return {
      action,
      damageDealt,
      damageTaken: 0,
      bossHp: 0,
      defeated: true,
      playerDefeated: false,
      fled: false,
    };
  }

  const rawDamage = Math.max(
    1,
    dungeon.bossAttack -
      Math.floor(player.defense * 0.5),
  );

  const damageTaken = member.defending
    ? Math.floor(rawDamage * 0.5)
    : rawDamage;

  player.hp = Math.max(
    0,
    player.hp - damageTaken,
  );

  member.damageTaken += damageTaken;

  if (player.hp <= 0) {
    member.alive = false;

    const anyAlive = state.members.some(
      (entry) => entry.alive && !entry.fled,
    );

    if (!anyAlive) {
      state.status = "failed";
    }

    return {
      action,
      damageDealt,
      damageTaken,
      bossHp: state.bossHp,
      defeated: false,
      playerDefeated: true,
      fled: false,
    };
  }

  state.round++;

  return {
    action,
    damageDealt,
    damageTaken,
    bossHp: state.bossHp,
    defeated: false,
    playerDefeated: false,
    fled: false,
  };
}

export function distributeDungeonReward(
  state: DungeonState,
  player: GamePlayer,
): {
  coins: number;
  xp: number;
  loot: ReturnType<typeof createEquipment>;
} {
  if (state.status !== "completed") {
    throw new Error("DUNGEON_NOT_COMPLETED");
  }

  const dungeon = getDungeon(state.dungeonId);

  if (!dungeon) {
    throw new Error("INVALID_DUNGEON");
  }

  if (!state.playerIds.includes(player.userId)) {
    throw new Error("PLAYER_NOT_IN_DUNGEON");
  }

  const member = state.members.find(
    (entry) => entry.userId === player.userId,
  );

  if (!member) {
    throw new Error("PLAYER_NOT_IN_DUNGEON");
  }

  if (member.rewardClaimed) {
    throw new Error("REWARD_ALREADY_CLAIMED");
  }

  const coins = randomInt(
    dungeon.rewardCoins[0],
    dungeon.rewardCoins[1],
  );

  const xp = randomInt(
    dungeon.rewardXp[0],
    dungeon.rewardXp[1],
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
    dungeon.rewardRarity,
  );

  player.coins += coins;
  player.xp += xp;
  player.totalXpEarned =
    (player.totalXpEarned ?? 0) + xp;

  addEquipment(player, loot);
  member.rewardClaimed = true;

  return {
    coins,
    xp,
    loot,
  };
}

export function getDungeonMvp(
  state: DungeonState,
): DungeonMemberState | undefined {
  return [...state.members]
    .filter((member) => !member.fled)
    .sort(
      (a, b) => b.damageDealt - a.damageDealt,
    )[0];
}
