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
var guilds_exports = {};
__export(guilds_exports, {
  GUILD_UPGRADES: () => GUILD_UPGRADES,
  addGuildMember: () => addGuildMember,
  checkGuildLevelUp: () => checkGuildLevelUp,
  createGuild: () => createGuild,
  depositGuildTreasury: () => depositGuildTreasury,
  getGuildLeaderboard: () => getGuildLeaderboard,
  getGuildMember: () => getGuildMember,
  getGuildRank: () => getGuildRank,
  getGuildUpgrade: () => getGuildUpgrade,
  isGuildMember: () => isGuildMember,
  recalculateGuildPower: () => recalculateGuildPower,
  recordGuildLoss: () => recordGuildLoss,
  recordGuildWin: () => recordGuildWin,
  removeGuildMember: () => removeGuildMember,
  upgradeGuild: () => upgradeGuild
});
module.exports = __toCommonJS(guilds_exports);
const XP_PER_GUILD_LEVEL = 1e3;
const GUILD_UPGRADES = [
  {
    id: "treasury",
    name: "\u{1F3E6} Treasury",
    level: 0,
    maxLevel: 10,
    cost: 1e3,
    power: 100,
    description: "Increases guild treasury capacity."
  },
  {
    id: "training_grounds",
    name: "\u2694\uFE0F Training Grounds",
    level: 0,
    maxLevel: 10,
    cost: 1500,
    power: 200,
    description: "Improves guild combat power."
  },
  {
    id: "marketplace",
    name: "\u{1F3EA} Marketplace",
    level: 0,
    maxLevel: 10,
    cost: 2e3,
    power: 150,
    description: "Improves guild trading benefits."
  },
  {
    id: "castle",
    name: "\u{1F3F0} Castle",
    level: 0,
    maxLevel: 10,
    cost: 5e3,
    power: 500,
    description: "Provides a major guild power increase."
  },
  {
    id: "magic_tower",
    name: "\u{1F52E} Magic Tower",
    level: 0,
    maxLevel: 10,
    cost: 7500,
    power: 750,
    description: "Unlocks future guild magic systems."
  }
];
function randomId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(
    Math.random() * 1e5
  )}`;
}
function createGuild(leaderId, username, name) {
  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 32) {
    throw new Error("INVALID_GUILD_NAME");
  }
  const upgrades = GUILD_UPGRADES.map(
    (upgrade) => ({ ...upgrade })
  );
  return {
    id: randomId("guild"),
    name: trimmedName,
    leaderId,
    level: 1,
    power: 0,
    treasury: 0,
    members: [
      {
        userId: leaderId,
        username,
        joinedAt: Date.now(),
        contribution: 0,
        role: "leader"
      }
    ],
    upgrades,
    createdAt: Date.now(),
    wins: 0,
    losses: 0
  };
}
function isGuildMember(guild, userId) {
  return guild.members.some(
    (member) => member.userId === userId
  );
}
function getGuildMember(guild, userId) {
  return guild.members.find(
    (member) => member.userId === userId
  );
}
function addGuildMember(guild, userId, username) {
  if (isGuildMember(guild, userId)) {
    throw new Error("ALREADY_IN_GUILD");
  }
  guild.members.push({
    userId,
    username,
    joinedAt: Date.now(),
    contribution: 0,
    role: "member"
  });
  recalculateGuildPower(guild);
}
function removeGuildMember(guild, userId) {
  if (userId === guild.leaderId) {
    throw new Error("LEADER_CANNOT_LEAVE");
  }
  const index = guild.members.findIndex(
    (member) => member.userId === userId
  );
  if (index < 0) {
    throw new Error("NOT_IN_GUILD");
  }
  guild.members.splice(index, 1);
  recalculateGuildPower(guild);
}
function depositGuildTreasury(guild, userId, amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_DEPOSIT");
  }
  const member = getGuildMember(guild, userId);
  if (!member) {
    throw new Error("NOT_IN_GUILD");
  }
  const contribution = Math.floor(amount);
  guild.treasury += contribution;
  member.contribution += contribution;
  checkGuildLevelUp(guild);
  recalculateGuildPower(guild);
}
function getGuildUpgrade(guild, upgradeId) {
  const upgrade = guild.upgrades.find(
    (entry) => entry.id === upgradeId
  );
  if (!upgrade) {
    throw new Error("INVALID_GUILD_UPGRADE");
  }
  return upgrade;
}
function upgradeGuild(guild, userId, upgradeId) {
  if (guild.leaderId !== userId) {
    throw new Error("GUILD_LEADER_ONLY");
  }
  const upgrade = getGuildUpgrade(
    guild,
    upgradeId
  );
  if (upgrade.level >= upgrade.maxLevel) {
    throw new Error("UPGRADE_MAXED");
  }
  const price = upgrade.cost * (upgrade.level + 1);
  if (guild.treasury < price) {
    throw new Error("GUILD_NOT_ENOUGH_TREASURY");
  }
  guild.treasury -= price;
  upgrade.level += 1;
  recalculateGuildPower(guild);
  return upgrade;
}
function checkGuildLevelUp(guild) {
  const oldLevel = guild.level;
  while (guild.treasury >= guild.level * XP_PER_GUILD_LEVEL) {
    guild.level += 1;
  }
  return guild.level > oldLevel;
}
function recalculateGuildPower(guild) {
  const memberPower = guild.members.reduce(
    (total, member) => total + Math.floor(member.contribution / 100),
    0
  );
  const upgradePower = guild.upgrades.reduce(
    (total, upgrade) => total + upgrade.level * upgrade.power,
    0
  );
  guild.power = memberPower + upgradePower + guild.level * 100;
  return guild.power;
}
function recordGuildWin(guild) {
  guild.wins += 1;
  recalculateGuildPower(guild);
}
function recordGuildLoss(guild) {
  guild.losses += 1;
  recalculateGuildPower(guild);
}
function getGuildLeaderboard(guilds) {
  return [...guilds].sort(
    (a, b) => b.power - a.power
  );
}
function getGuildRank(guilds, guildId) {
  const leaderboard = getGuildLeaderboard(guilds);
  const index = leaderboard.findIndex(
    (guild) => guild.id === guildId
  );
  return index < 0 ? 0 : index + 1;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GUILD_UPGRADES,
  addGuildMember,
  checkGuildLevelUp,
  createGuild,
  depositGuildTreasury,
  getGuildLeaderboard,
  getGuildMember,
  getGuildRank,
  getGuildUpgrade,
  isGuildMember,
  recalculateGuildPower,
  recordGuildLoss,
  recordGuildWin,
  removeGuildMember,
  upgradeGuild
});
