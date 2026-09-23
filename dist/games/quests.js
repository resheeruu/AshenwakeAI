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
var quests_exports = {};
__export(quests_exports, {
  checkAutoTitles: () => checkAutoTitles,
  claimQuestReward: () => claimQuestReward,
  cleanupExpiredQuests: () => cleanupExpiredQuests,
  generateDailyQuests: () => generateDailyQuests,
  generateWeeklyQuests: () => generateWeeklyQuests,
  getActiveQuests: () => getActiveQuests,
  getAllTitles: () => getAllTitles,
  getAvailableStoryQuests: () => getAvailableStoryQuests,
  getCombatQuests: () => getCombatQuests,
  getCompletedUnclaimedQuests: () => getCompletedUnclaimedQuests,
  getDungeonQuests: () => getDungeonQuests,
  getRegionQuests: () => getRegionQuests,
  getTitleInfo: () => getTitleInfo,
  setActiveTitle: () => setActiveTitle,
  updateQuestProgress: () => updateQuestProgress
});
module.exports = __toCommonJS(quests_exports);
let questIdCounter = 0;
function generateQuestId() {
  questIdCounter++;
  return `quest_${Date.now()}_${questIdCounter}`;
}
const DAILY_QUEST_TEMPLATES = [
  { type: "daily", name: "Wolf Hunter", description: "Defeat 3 wolves", target: 3, rewardXp: 50, rewardCoins: 75 },
  { type: "daily", name: "Treasure Seeker", description: "Find 2 loot drops", target: 2, rewardXp: 40, rewardCoins: 60 },
  { type: "daily", name: "Coin Collector", description: "Earn 200 coins", target: 200, rewardXp: 30, rewardCoins: 100 },
  { type: "daily", name: "Combat Training", description: "Win 3 battles", target: 3, rewardXp: 60, rewardCoins: 50 },
  { type: "daily", name: "Exploration", description: "Complete 2 adventures", target: 2, rewardXp: 45, rewardCoins: 55 }
];
const WEEKLY_QUEST_TEMPLATES = [
  { type: "weekly", name: "Dragon Slayer", description: "Defeat 5 dragons", target: 5, rewardXp: 300, rewardCoins: 500 },
  { type: "weekly", name: "Dungeon Delver", description: "Complete 2 dungeons", target: 2, rewardXp: 400, rewardCoins: 600 },
  { type: "weekly", name: "Wealthy Adventurer", description: "Earn 2000 coins", target: 2e3, rewardXp: 200, rewardCoins: 800 },
  { type: "weekly", name: "World Boss Hunter", description: "Damage a world boss 10 times", target: 10, rewardXp: 350, rewardCoins: 450 },
  { type: "weekly", name: "Legendary Collector", description: "Find 3 rare loot drops", target: 3, rewardXp: 250, rewardCoins: 350, rewardTitle: "Legendary Collector" }
];
const STORY_QUEST_TEMPLATES = [
  { type: "story", name: "The Awakening", description: "Reach level 5", target: 5, rewardXp: 200, rewardCoins: 300, rewardTitle: "Adventurer" },
  { type: "story", name: "Into the Blackwood", description: "Unlock Blackwood region", target: 1, rewardXp: 500, rewardCoins: 750, rewardTitle: "Explorer" },
  { type: "story", name: "Demon Hunter", description: "Defeat 10 demons", target: 10, rewardXp: 800, rewardCoins: 1e3, rewardTitle: "Demon Hunter" },
  { type: "story", name: "Dragon's Bane", description: "Defeat the Ashen Dragon", target: 1, rewardXp: 1500, rewardCoins: 2e3, rewardTitle: "Dragon Slayer" },
  { type: "story", name: "Abyss Walker", description: "Unlock the Abyss region", target: 1, rewardXp: 3e3, rewardCoins: 5e3, rewardTitle: "Abyss Walker" },
  { type: "story", name: "Godslayer", description: "Reach level 50", target: 50, rewardXp: 1e4, rewardCoins: 15e3, rewardTitle: "Godslayer" }
];
const REGION_QUEST_TEMPLATES = [
  { type: "region", name: "Village Defender", description: "Complete 5 hunts in Ashen Village", target: 5, rewardXp: 100, rewardCoins: 150, regionId: "ashen_village" },
  { type: "region", name: "Forest Tracker", description: "Complete 5 hunts in Blackwood", target: 5, rewardXp: 200, rewardCoins: 300, regionId: "blackwood" },
  { type: "region", name: "Wasteland Survivor", description: "Complete 5 hunts in Crimson Wastes", target: 5, rewardXp: 400, rewardCoins: 600, regionId: "crimson_wastes" },
  { type: "region", name: "Abyss Explorer", description: "Complete 5 hunts in the Abyss", target: 5, rewardXp: 800, rewardCoins: 1200, regionId: "abyss" },
  { type: "region", name: "Celestial Champion", description: "Complete 5 hunts in Celestial Realm", target: 5, rewardXp: 1500, rewardCoins: 2500, regionId: "celestial_realm" }
];
const COMBAT_QUEST_TEMPLATES = [
  { type: "combat", name: "First Blood", description: "Win your first duel", target: 1, rewardXp: 50, rewardCoins: 75, rewardTitle: "Novice" },
  { type: "combat", name: "Duel Master", description: "Win 10 duels", target: 10, rewardXp: 300, rewardCoins: 400, rewardTitle: "Duel Master" },
  { type: "combat", name: "Untouchable", description: "Win 5 duels without taking damage", target: 5, rewardXp: 500, rewardCoins: 700, rewardTitle: "Untouchable" },
  { type: "combat", name: "World Boss Slayer", description: "Participate in 3 world boss kills", target: 3, rewardXp: 600, rewardCoins: 800, rewardTitle: "World Boss Slayer" }
];
const DUNGEON_QUEST_TEMPLATES = [
  { type: "dungeon", name: "Crypt Raider", description: "Complete the Ashen Crypt", target: 1, rewardXp: 200, rewardCoins: 300 },
  { type: "dungeon", name: "Fortress Breaker", description: "Complete the Crimson Fortress", target: 1, rewardXp: 500, rewardCoins: 700 },
  { type: "dungeon", name: "Gatekeeper", description: "Complete the Abyssal Gate", target: 1, rewardXp: 1e3, rewardCoins: 1500 },
  { type: "dungeon", name: "Celestial Conqueror", description: "Complete the Celestial Spire", target: 1, rewardXp: 2e3, rewardCoins: 3e3, rewardTitle: "Dungeon Lord" }
];
const COLLECTION_QUEST_TEMPLATES = [
  { type: "collection", name: "Pack Rat", description: "Own 20 different items", target: 20, rewardXp: 150, rewardCoins: 200 },
  { type: "collection", name: "Equipment Collector", description: "Own 10 pieces of equipment", target: 10, rewardXp: 250, rewardCoins: 350 },
  { type: "collection", name: "Pet Master", description: "Own 3 pets", target: 3, rewardXp: 400, rewardCoins: 500, rewardTitle: "Pet Master" }
];
const ACHIEVEMENT_QUEST_TEMPLATES = [
  { type: "achievement", name: "Achievement Hunter", description: "Unlock 5 achievements", target: 5, rewardXp: 200, rewardCoins: 300 },
  { type: "achievement", name: "Perfectionist", description: "Unlock all achievements", target: 10, rewardXp: 1e3, rewardCoins: 2e3, rewardTitle: "Perfectionist" }
];
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function generateDailyQuests(player) {
  const templates = [...DAILY_QUEST_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 3);
  return templates.map((t) => ({
    id: generateQuestId(),
    type: t.type,
    name: t.name,
    description: t.description,
    target: t.target,
    progress: 0,
    rewardXp: t.rewardXp,
    rewardCoins: t.rewardCoins,
    rewardTitle: t.rewardTitle,
    rewardReputation: t.rewardReputation,
    completed: false,
    claimed: false,
    expiresAt: Date.now() + 24 * 60 * 60 * 1e3
  }));
}
function generateWeeklyQuests(player) {
  const templates = [...WEEKLY_QUEST_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 3);
  return templates.map((t) => ({
    id: generateQuestId(),
    type: t.type,
    name: t.name,
    description: t.description,
    target: t.target,
    progress: 0,
    rewardXp: t.rewardXp,
    rewardCoins: t.rewardCoins,
    rewardTitle: t.rewardTitle,
    completed: false,
    claimed: false,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1e3
  }));
}
function getAvailableStoryQuests(player) {
  const existing = player.quests?.filter((q) => q.type === "story") ?? [];
  const existingNames = new Set(existing.map((q) => q.name));
  return STORY_QUEST_TEMPLATES.filter((t) => !existingNames.has(t.name)).slice(0, 3).map((t) => ({
    id: generateQuestId(),
    type: t.type,
    name: t.name,
    description: t.description,
    target: t.target,
    progress: 0,
    rewardXp: t.rewardXp,
    rewardCoins: t.rewardCoins,
    rewardTitle: t.rewardTitle,
    completed: false,
    claimed: false
  }));
}
function getRegionQuests(player) {
  const regionId = player.regionId ?? "ashen_village";
  const templates = REGION_QUEST_TEMPLATES.filter((t) => t.regionId === regionId);
  const existing = player.quests?.filter((q) => q.type === "region" && q.regionId === regionId) ?? [];
  const existingNames = new Set(existing.map((q) => q.name));
  return templates.filter((t) => !existingNames.has(t.name)).map((t) => ({
    id: generateQuestId(),
    type: t.type,
    name: t.name,
    description: t.description,
    target: t.target,
    progress: 0,
    rewardXp: t.rewardXp,
    rewardCoins: t.rewardCoins,
    regionId: t.regionId,
    completed: false,
    claimed: false
  }));
}
function getCombatQuests(player) {
  const existing = player.quests?.filter((q) => q.type === "combat") ?? [];
  const existingNames = new Set(existing.map((q) => q.name));
  return COMBAT_QUEST_TEMPLATES.filter((t) => !existingNames.has(t.name)).slice(0, 2).map((t) => ({
    id: generateQuestId(),
    type: t.type,
    name: t.name,
    description: t.description,
    target: t.target,
    progress: 0,
    rewardXp: t.rewardXp,
    rewardCoins: t.rewardCoins,
    rewardTitle: t.rewardTitle,
    completed: false,
    claimed: false
  }));
}
function getDungeonQuests(player) {
  const existing = player.quests?.filter((q) => q.type === "dungeon") ?? [];
  const existingNames = new Set(existing.map((q) => q.name));
  return DUNGEON_QUEST_TEMPLATES.filter((t) => !existingNames.has(t.name)).slice(0, 2).map((t) => ({
    id: generateQuestId(),
    type: t.type,
    name: t.name,
    description: t.description,
    target: t.target,
    progress: 0,
    rewardXp: t.rewardXp,
    rewardCoins: t.rewardCoins,
    rewardTitle: t.rewardTitle,
    completed: false,
    claimed: false
  }));
}
function updateQuestProgress(player, questType, amount = 1, filter) {
  if (!player.quests) player.quests = [];
  const completedQuests = [];
  for (const quest of player.quests) {
    if (quest.completed || quest.claimed) continue;
    if (quest.type !== questType) continue;
    if (filter && !filter(quest)) continue;
    quest.progress = Math.min(quest.target, quest.progress + amount);
    if (quest.progress >= quest.target && !quest.completed) {
      quest.completed = true;
      completedQuests.push(quest);
    }
  }
  return completedQuests;
}
function claimQuestReward(player, questId) {
  if (!player.quests) {
    return { success: false, message: "No active quests." };
  }
  const quest = player.quests.find((q) => q.id === questId);
  if (!quest) {
    return { success: false, message: "Quest not found." };
  }
  if (!quest.completed) {
    return { success: false, message: "Quest not yet completed." };
  }
  if (quest.claimed) {
    return { success: false, message: "Reward already claimed." };
  }
  quest.claimed = true;
  player.coins += quest.rewardCoins;
  player.xp += quest.rewardXp;
  player.totalXpEarned = (player.totalXpEarned ?? 0) + quest.rewardXp;
  if (quest.rewardReputation) {
    player.reputation += quest.rewardReputation;
  }
  let title;
  if (quest.rewardTitle && !player.titles.includes(quest.rewardTitle)) {
    player.titles.push(quest.rewardTitle);
    title = quest.rewardTitle;
  }
  return {
    success: true,
    message: `Completed **${quest.name}**! +${quest.rewardXp} XP, +${quest.rewardCoins} coins.`,
    xp: quest.rewardXp,
    coins: quest.rewardCoins,
    title
  };
}
function cleanupExpiredQuests(player) {
  if (!player.quests) return 0;
  const now = Date.now();
  const before = player.quests.length;
  player.quests = player.quests.filter((q) => {
    if (q.claimed) return false;
    if (q.expiresAt && q.expiresAt < now) return false;
    return true;
  });
  return before - player.quests.length;
}
function getActiveQuests(player) {
  return (player.quests ?? []).filter((q) => !q.claimed);
}
function getCompletedUnclaimedQuests(player) {
  return (player.quests ?? []).filter((q) => q.completed && !q.claimed);
}
const ALL_TITLES = {
  Novice: { name: "Novice", emoji: "\u{1F5E1}\uFE0F", description: "A new adventurer" },
  Hunter: { name: "Hunter", emoji: "\u{1F3F9}", description: "Experienced monster hunter" },
  "Dragon Slayer": { name: "Dragon Slayer", emoji: "\u{1F409}", description: "Slayer of dragons" },
  Millionaire: { name: "Millionaire", emoji: "\u{1F4B0}", description: "Accumulated great wealth" },
  "Casino King": { name: "Casino King", emoji: "\u{1F3B0}", description: "Master of the casino" },
  "Dungeon Lord": { name: "Dungeon Lord", emoji: "\u{1F3F0}", description: "Conqueror of dungeons" },
  "Abyss Walker": { name: "Abyss Walker", emoji: "\u{1F311}", description: "Survivor of the Abyss" },
  Godslayer: { name: "Godslayer", emoji: "\u26A1", description: "Slain gods themselves" },
  "The Unlucky": { name: "The Unlucky", emoji: "\u{1F480}", description: "Died 10 or more times" },
  "The Immortal": { name: "The Immortal", emoji: "\u2728", description: "Never died" },
  Adventurer: { name: "Adventurer", emoji: "\u{1F392}", description: "Completed the Awakening" },
  Explorer: { name: "Explorer", emoji: "\u{1F5FA}\uFE0F", description: "Discovered new lands" },
  "Demon Hunter": { name: "Demon Hunter", emoji: "\u{1F479}", description: "Slayer of demons" },
  "Duel Master": { name: "Duel Master", emoji: "\u2694\uFE0F", description: "Master of dueling" },
  Untouchable: { name: "Untouchable", emoji: "\u{1F6E1}\uFE0F", description: "Won without taking damage" },
  "World Boss Slayer": { name: "World Boss Slayer", emoji: "\u{1F30D}", description: "Defeated world bosses" },
  "Pet Master": { name: "Pet Master", emoji: "\u{1F43E}", description: "Owns multiple pets" },
  Perfectionist: { name: "Perfectionist", emoji: "\u{1F3C6}", description: "Unlocked all achievements" },
  "Legendary Collector": { name: "Legendary Collector", emoji: "\u{1F451}", description: "Collected legendary items" },
  "region_pioneer": { name: "Region Pioneer", emoji: "\u{1F5FA}\uFE0F", description: "First to unlock a new region" }
};
function getTitleInfo(titleId) {
  return ALL_TITLES[titleId];
}
function getAllTitles() {
  return { ...ALL_TITLES };
}
function setActiveTitle(player, titleId) {
  if (titleId === "") {
    player.activeTitle = void 0;
    return { success: true, message: "Title cleared." };
  }
  if (!player.titles.includes(titleId)) {
    return { success: false, message: "You don't have that title." };
  }
  player.activeTitle = titleId;
  const info = getTitleInfo(titleId);
  return {
    success: true,
    message: `Active title set to **${info?.name ?? titleId}**.`
  };
}
function checkAutoTitles(player) {
  const newTitles = [];
  const checks = [
    { id: "Novice", condition: player.level >= 1 },
    { id: "Hunter", condition: player.level >= 10 },
    { id: "Dragon Slayer", condition: player.level >= 20 },
    { id: "Abyss Walker", condition: player.level >= 30 },
    { id: "Godslayer", condition: player.level >= 50 },
    { id: "The Unlucky", condition: player.deaths >= 10 },
    { id: "The Immortal", condition: player.deaths === 0 && player.level >= 20 },
    { id: "Millionaire", condition: player.coins >= 1e6 }
  ];
  for (const check of checks) {
    if (check.condition && !player.titles.includes(check.id)) {
      player.titles.push(check.id);
      newTitles.push(check.id);
    }
  }
  return newTitles;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  checkAutoTitles,
  claimQuestReward,
  cleanupExpiredQuests,
  generateDailyQuests,
  generateWeeklyQuests,
  getActiveQuests,
  getAllTitles,
  getAvailableStoryQuests,
  getCombatQuests,
  getCompletedUnclaimedQuests,
  getDungeonQuests,
  getRegionQuests,
  getTitleInfo,
  setActiveTitle,
  updateQuestProgress
});
