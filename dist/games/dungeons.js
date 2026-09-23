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
var dungeons_exports = {};
__export(dungeons_exports, {
  DUNGEONS: () => DUNGEONS,
  addDungeonMember: () => addDungeonMember,
  canEnterDungeon: () => canEnterDungeon,
  createDungeon: () => createDungeon,
  distributeDungeonReward: () => distributeDungeonReward,
  getDungeon: () => getDungeon,
  getDungeonMvp: () => getDungeonMvp,
  performDungeonAction: () => performDungeonAction,
  startDungeon: () => startDungeon
});
module.exports = __toCommonJS(dungeons_exports);
var import_equipment = require("./equipment");
var import_config = require("./config");
const DUNGEONS = [
  {
    id: "ashen_crypt",
    name: "Ashen Crypt",
    emoji: "\u{1F3F0}",
    minLevel: 5,
    recommendedPlayers: 3,
    bossName: "Crypt Lord",
    bossHp: 2500,
    bossAttack: 45,
    bossDefense: 20,
    rewardCoins: [500, 1200],
    rewardXp: [300, 650],
    rewardRarity: "rare"
  },
  {
    id: "crimson_fortress",
    name: "Crimson Fortress",
    emoji: "\u{1F30B}",
    minLevel: 15,
    recommendedPlayers: 3,
    bossName: "Demon General",
    bossHp: 7e3,
    bossAttack: 80,
    bossDefense: 40,
    rewardCoins: [1500, 3500],
    rewardXp: [700, 1300],
    rewardRarity: "epic"
  },
  {
    id: "abyssal_gate",
    name: "Abyssal Gate",
    emoji: "\u{1F311}",
    minLevel: 30,
    recommendedPlayers: 4,
    bossName: "Abyss Warden",
    bossHp: 18e3,
    bossAttack: 140,
    bossDefense: 75,
    rewardCoins: [4e3, 9e3],
    rewardXp: [1500, 3e3],
    rewardRarity: "legendary"
  },
  {
    id: "celestial_spire",
    name: "Celestial Spire",
    emoji: "\u2728",
    minLevel: 50,
    recommendedPlayers: 5,
    bossName: "Celestial Tyrant",
    bossHp: 5e4,
    bossAttack: 250,
    bossDefense: 130,
    rewardCoins: [12e3, 3e4],
    rewardXp: [3500, 7e3],
    rewardRarity: "mythic"
  }
];
function randomInt(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}
function getDungeon(dungeonId) {
  return DUNGEONS.find(
    (dungeon) => dungeon.id === dungeonId
  );
}
function canEnterDungeon(player, dungeon) {
  return player.level >= dungeon.minLevel;
}
function createDungeon(dungeonId, leader) {
  const dungeon = getDungeon(dungeonId);
  if (!dungeon) {
    throw new Error("INVALID_DUNGEON");
  }
  if (!canEnterDungeon(leader, dungeon)) {
    throw new Error("DUNGEON_LEVEL_TOO_LOW");
  }
  return {
    id: `dungeon_${Date.now()}_${randomInt(1e3, 9999)}`,
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
        fled: false
      }
    ],
    bossHp: dungeon.bossHp,
    round: 0,
    status: "lobby",
    createdAt: Date.now()
  };
}
function addDungeonMember(state, player, maxPlayers) {
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
  const limit = maxPlayers ?? dungeon.recommendedPlayers;
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
    fled: false
  });
}
function startDungeon(state) {
  if (state.status !== "lobby") {
    throw new Error("DUNGEON_ALREADY_STARTED");
  }
  if (state.playerIds.length === 0) {
    throw new Error("DUNGEON_EMPTY");
  }
  state.status = "active";
  state.round = 1;
}
function performDungeonAction(state, player, action) {
  if (state.status !== "active") {
    throw new Error("DUNGEON_NOT_ACTIVE");
  }
  const member = state.members.find(
    (entry) => entry.userId === player.userId
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
    const fleeSuccess = Math.random() < import_config.GAME_CONFIG.dungeon.fleeChance;
    if (fleeSuccess) {
      member.fled = true;
      member.alive = false;
      const anyAlive = state.members.some(
        (entry) => entry.alive && !entry.fled
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
        fled: true
      };
    }
    return {
      action,
      damageDealt: 0,
      damageTaken: 5,
      bossHp: state.bossHp,
      defeated: false,
      playerDefeated: false,
      fled: false
    };
  }
  let damageDealt = 0;
  let isCritical = false;
  if (action === "attack") {
    const critChance = import_config.GAME_CONFIG.combat.baseCritChance + player.luck * 1e-3;
    isCritical = Math.random() < critChance;
    const baseDamage = Math.max(1, player.attack - dungeon.bossDefense);
    damageDealt = isCritical ? Math.floor(baseDamage * import_config.GAME_CONFIG.combat.critMultiplier) : baseDamage;
  }
  if (action === "ability") {
    const critChance = import_config.GAME_CONFIG.combat.baseCritChance + player.luck * 1e-3;
    isCritical = Math.random() < critChance;
    const baseDamage = Math.max(5, Math.floor(
      player.attack * import_config.GAME_CONFIG.combat.abilityDamageMultiplier - dungeon.bossDefense * import_config.GAME_CONFIG.combat.abilityDefenseReduction
    ));
    damageDealt = isCritical ? Math.floor(baseDamage * import_config.GAME_CONFIG.combat.critMultiplier) : baseDamage;
  }
  if (action === "defend") {
    member.defending = true;
  }
  state.bossHp = Math.max(0, state.bossHp - damageDealt);
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
      fled: false
    };
  }
  const rawDamage = Math.max(
    1,
    dungeon.bossAttack - Math.floor(player.defense * import_config.GAME_CONFIG.dungeon.bossDefenseReduction)
  );
  const damageTaken = member.defending ? Math.floor(rawDamage * import_config.GAME_CONFIG.dungeon.defendDamageReduction) : rawDamage;
  player.hp = Math.max(0, player.hp - damageTaken);
  member.damageTaken += damageTaken;
  if (player.hp <= 0) {
    member.alive = false;
    const anyAlive = state.members.some(
      (entry) => entry.alive && !entry.fled
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
      fled: false
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
    fled: false
  };
}
function distributeDungeonReward(state, player) {
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
    (entry) => entry.userId === player.userId
  );
  if (!member) {
    throw new Error("PLAYER_NOT_IN_DUNGEON");
  }
  if (member.rewardClaimed) {
    throw new Error("REWARD_ALREADY_CLAIMED");
  }
  const coins = randomInt(
    dungeon.rewardCoins[0],
    dungeon.rewardCoins[1]
  );
  const xp = randomInt(
    dungeon.rewardXp[0],
    dungeon.rewardXp[1]
  );
  const templates = [
    "ashen_blade",
    "ashen_plate",
    "iron_helmet",
    "traveler_boots",
    "lucky_ring",
    "ashen_amulet"
  ];
  const templateId = templates[randomInt(0, templates.length - 1)];
  const loot = (0, import_equipment.createEquipment)(
    templateId,
    dungeon.rewardRarity
  );
  player.coins += coins;
  player.xp += xp;
  player.totalXpEarned = (player.totalXpEarned ?? 0) + xp;
  (0, import_equipment.addEquipment)(player, loot);
  member.rewardClaimed = true;
  return {
    coins,
    xp,
    loot
  };
}
function getDungeonMvp(state) {
  return [...state.members].filter((member) => !member.fled).sort(
    (a, b) => b.damageDealt - a.damageDealt
  )[0];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DUNGEONS,
  addDungeonMember,
  canEnterDungeon,
  createDungeon,
  distributeDungeonReward,
  getDungeon,
  getDungeonMvp,
  performDungeonAction,
  startDungeon
});
