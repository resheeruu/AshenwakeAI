import { GamePlayer, Quest } from "./types";
import { GAME_CONFIG } from "./config";
import { getRegion } from "./world";

let questIdCounter = 0;

function generateQuestId(): string {
  questIdCounter++;
  return `quest_${Date.now()}_${questIdCounter}`;
}

export type QuestTemplate = {
  type: Quest["type"];
  name: string;
  description: string;
  target: number;
  rewardXp: number;
  rewardCoins: number;
  rewardEquipment?: string;
  rewardTitle?: string;
  rewardReputation?: number;
  regionId?: string;
};

const DAILY_QUEST_TEMPLATES: QuestTemplate[] = [
  { type: "daily", name: "Wolf Hunter", description: "Defeat 3 wolves", target: 3, rewardXp: 50, rewardCoins: 75 },
  { type: "daily", name: "Treasure Seeker", description: "Find 2 loot drops", target: 2, rewardXp: 40, rewardCoins: 60 },
  { type: "daily", name: "Coin Collector", description: "Earn 200 coins", target: 200, rewardXp: 30, rewardCoins: 100 },
  { type: "daily", name: "Combat Training", description: "Win 3 battles", target: 3, rewardXp: 60, rewardCoins: 50 },
  { type: "daily", name: "Exploration", description: "Complete 2 adventures", target: 2, rewardXp: 45, rewardCoins: 55 },
];

const WEEKLY_QUEST_TEMPLATES: QuestTemplate[] = [
  { type: "weekly", name: "Dragon Slayer", description: "Defeat 5 dragons", target: 5, rewardXp: 300, rewardCoins: 500 },
  { type: "weekly", name: "Dungeon Delver", description: "Complete 2 dungeons", target: 2, rewardXp: 400, rewardCoins: 600 },
  { type: "weekly", name: "Wealthy Adventurer", description: "Earn 2000 coins", target: 2000, rewardXp: 200, rewardCoins: 800 },
  { type: "weekly", name: "World Boss Hunter", description: "Damage a world boss 10 times", target: 10, rewardXp: 350, rewardCoins: 450 },
  { type: "weekly", name: "Legendary Collector", description: "Find 3 rare loot drops", target: 3, rewardXp: 250, rewardCoins: 350, rewardTitle: "Legendary Collector" },
];

const STORY_QUEST_TEMPLATES: QuestTemplate[] = [
  { type: "story", name: "The Awakening", description: "Reach level 5", target: 5, rewardXp: 200, rewardCoins: 300, rewardTitle: "Adventurer" },
  { type: "story", name: "Into the Blackwood", description: "Unlock Blackwood region", target: 1, rewardXp: 500, rewardCoins: 750, rewardTitle: "Explorer" },
  { type: "story", name: "Demon Hunter", description: "Defeat 10 demons", target: 10, rewardXp: 800, rewardCoins: 1000, rewardTitle: "Demon Hunter" },
  { type: "story", name: "Dragon's Bane", description: "Defeat the Ashen Dragon", target: 1, rewardXp: 1500, rewardCoins: 2000, rewardTitle: "Dragon Slayer" },
  { type: "story", name: "Abyss Walker", description: "Unlock the Abyss region", target: 1, rewardXp: 3000, rewardCoins: 5000, rewardTitle: "Abyss Walker" },
  { type: "story", name: "Godslayer", description: "Reach level 50", target: 50, rewardXp: 10000, rewardCoins: 15000, rewardTitle: "Godslayer" },
];

const REGION_QUEST_TEMPLATES: QuestTemplate[] = [
  { type: "region", name: "Village Defender", description: "Complete 5 hunts in Ashen Village", target: 5, rewardXp: 100, rewardCoins: 150, regionId: "ashen_village" },
  { type: "region", name: "Forest Tracker", description: "Complete 5 hunts in Blackwood", target: 5, rewardXp: 200, rewardCoins: 300, regionId: "blackwood" },
  { type: "region", name: "Wasteland Survivor", description: "Complete 5 hunts in Crimson Wastes", target: 5, rewardXp: 400, rewardCoins: 600, regionId: "crimson_wastes" },
  { type: "region", name: "Abyss Explorer", description: "Complete 5 hunts in the Abyss", target: 5, rewardXp: 800, rewardCoins: 1200, regionId: "abyss" },
  { type: "region", name: "Celestial Champion", description: "Complete 5 hunts in Celestial Realm", target: 5, rewardXp: 1500, rewardCoins: 2500, regionId: "celestial_realm" },
];

const COMBAT_QUEST_TEMPLATES: QuestTemplate[] = [
  { type: "combat", name: "First Blood", description: "Win your first duel", target: 1, rewardXp: 50, rewardCoins: 75, rewardTitle: "Novice" },
  { type: "combat", name: "Duel Master", description: "Win 10 duels", target: 10, rewardXp: 300, rewardCoins: 400, rewardTitle: "Duel Master" },
  { type: "combat", name: "Untouchable", description: "Win 5 duels without taking damage", target: 5, rewardXp: 500, rewardCoins: 700, rewardTitle: "Untouchable" },
  { type: "combat", name: "World Boss Slayer", description: "Participate in 3 world boss kills", target: 3, rewardXp: 600, rewardCoins: 800, rewardTitle: "World Boss Slayer" },
];

const DUNGEON_QUEST_TEMPLATES: QuestTemplate[] = [
  { type: "dungeon", name: "Crypt Raider", description: "Complete the Ashen Crypt", target: 1, rewardXp: 200, rewardCoins: 300 },
  { type: "dungeon", name: "Fortress Breaker", description: "Complete the Crimson Fortress", target: 1, rewardXp: 500, rewardCoins: 700 },
  { type: "dungeon", name: "Gatekeeper", description: "Complete the Abyssal Gate", target: 1, rewardXp: 1000, rewardCoins: 1500 },
  { type: "dungeon", name: "Celestial Conqueror", description: "Complete the Celestial Spire", target: 1, rewardXp: 2000, rewardCoins: 3000, rewardTitle: "Dungeon Lord" },
];

const COLLECTION_QUEST_TEMPLATES: QuestTemplate[] = [
  { type: "collection", name: "Pack Rat", description: "Own 20 different items", target: 20, rewardXp: 150, rewardCoins: 200 },
  { type: "collection", name: "Equipment Collector", description: "Own 10 pieces of equipment", target: 10, rewardXp: 250, rewardCoins: 350 },
  { type: "collection", name: "Pet Master", description: "Own 3 pets", target: 3, rewardXp: 400, rewardCoins: 500, rewardTitle: "Pet Master" },
];

const ACHIEVEMENT_QUEST_TEMPLATES: QuestTemplate[] = [
  { type: "achievement", name: "Achievement Hunter", description: "Unlock 5 achievements", target: 5, rewardXp: 200, rewardCoins: 300 },
  { type: "achievement", name: "Perfectionist", description: "Unlock all achievements", target: 10, rewardXp: 1000, rewardCoins: 2000, rewardTitle: "Perfectionist" },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateDailyQuests(player: GamePlayer): Quest[] {
  const templates = [...DAILY_QUEST_TEMPLATES]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

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
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  }));
}

export function generateWeeklyQuests(player: GamePlayer): Quest[] {
  const templates = [...WEEKLY_QUEST_TEMPLATES]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

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
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  }));
}

export function getAvailableStoryQuests(player: GamePlayer): Quest[] {
  const existing = player.quests?.filter((q) => q.type === "story") ?? [];
  const existingNames = new Set(existing.map((q) => q.name));

  return STORY_QUEST_TEMPLATES
    .filter((t) => !existingNames.has(t.name))
    .slice(0, 3)
    .map((t) => ({
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
    }));
}

export function getRegionQuests(player: GamePlayer): Quest[] {
  const regionId = player.regionId ?? "ashen_village";
  const templates = REGION_QUEST_TEMPLATES.filter((t) => t.regionId === regionId);
  const existing = player.quests?.filter((q) => q.type === "region" && q.regionId === regionId) ?? [];
  const existingNames = new Set(existing.map((q) => q.name));

  return templates
    .filter((t) => !existingNames.has(t.name))
    .map((t) => ({
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
      claimed: false,
    }));
}

export function getCombatQuests(player: GamePlayer): Quest[] {
  const existing = player.quests?.filter((q) => q.type === "combat") ?? [];
  const existingNames = new Set(existing.map((q) => q.name));

  return COMBAT_QUEST_TEMPLATES
    .filter((t) => !existingNames.has(t.name))
    .slice(0, 2)
    .map((t) => ({
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
    }));
}

export function getDungeonQuests(player: GamePlayer): Quest[] {
  const existing = player.quests?.filter((q) => q.type === "dungeon") ?? [];
  const existingNames = new Set(existing.map((q) => q.name));

  return DUNGEON_QUEST_TEMPLATES
    .filter((t) => !existingNames.has(t.name))
    .slice(0, 2)
    .map((t) => ({
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
    }));
}

export function updateQuestProgress(
  player: GamePlayer,
  questType: Quest["type"],
  amount: number = 1,
  filter?: (quest: Quest) => boolean,
): Quest[] {
  if (!player.quests) player.quests = [];

  const completedQuests: Quest[] = [];

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

export function claimQuestReward(
  player: GamePlayer,
  questId: string,
): { success: boolean; message: string; xp?: number; coins?: number; title?: string } {
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

  let title: string | undefined;
  if (quest.rewardTitle && !player.titles.includes(quest.rewardTitle)) {
    player.titles.push(quest.rewardTitle);
    title = quest.rewardTitle;
  }

  return {
    success: true,
    message: `Completed **${quest.name}**! +${quest.rewardXp} XP, +${quest.rewardCoins} coins.`,
    xp: quest.rewardXp,
    coins: quest.rewardCoins,
    title,
  };
}

export function cleanupExpiredQuests(player: GamePlayer): number {
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

export function getActiveQuests(player: GamePlayer): Quest[] {
  return (player.quests ?? []).filter((q) => !q.claimed);
}

export function getCompletedUnclaimedQuests(player: GamePlayer): Quest[] {
  return (player.quests ?? []).filter((q) => q.completed && !q.claimed);
}

const ALL_TITLES: Record<string, { name: string; emoji: string; description: string }> = {
  Novice: { name: "Novice", emoji: "🗡️", description: "A new adventurer" },
  Hunter: { name: "Hunter", emoji: "🏹", description: "Experienced monster hunter" },
  "Dragon Slayer": { name: "Dragon Slayer", emoji: "🐉", description: "Slayer of dragons" },
  Millionaire: { name: "Millionaire", emoji: "💰", description: "Accumulated great wealth" },
  "Casino King": { name: "Casino King", emoji: "🎰", description: "Master of the casino" },
  "Dungeon Lord": { name: "Dungeon Lord", emoji: "🏰", description: "Conqueror of dungeons" },
  "Abyss Walker": { name: "Abyss Walker", emoji: "🌑", description: "Survivor of the Abyss" },
  Godslayer: { name: "Godslayer", emoji: "⚡", description: "Slain gods themselves" },
  "The Unlucky": { name: "The Unlucky", emoji: "💀", description: "Died 10 or more times" },
  "The Immortal": { name: "The Immortal", emoji: "✨", description: "Never died" },
  Adventurer: { name: "Adventurer", emoji: "🎒", description: "Completed the Awakening" },
  Explorer: { name: "Explorer", emoji: "🗺️", description: "Discovered new lands" },
  "Demon Hunter": { name: "Demon Hunter", emoji: "👹", description: "Slayer of demons" },
  "Duel Master": { name: "Duel Master", emoji: "⚔️", description: "Master of dueling" },
  Untouchable: { name: "Untouchable", emoji: "🛡️", description: "Won without taking damage" },
  "World Boss Slayer": { name: "World Boss Slayer", emoji: "🌍", description: "Defeated world bosses" },
  "Pet Master": { name: "Pet Master", emoji: "🐾", description: "Owns multiple pets" },
  Perfectionist: { name: "Perfectionist", emoji: "🏆", description: "Unlocked all achievements" },
  "Legendary Collector": { name: "Legendary Collector", emoji: "👑", description: "Collected legendary items" },
  "region_pioneer": { name: "Region Pioneer", emoji: "🗺️", description: "First to unlock a new region" },
};

export function getTitleInfo(titleId: string): { name: string; emoji: string; description: string } | undefined {
  return ALL_TITLES[titleId];
}

export function getAllTitles(): Record<string, { name: string; emoji: string; description: string }> {
  return { ...ALL_TITLES };
}

export function setActiveTitle(
  player: GamePlayer,
  titleId: string,
): { success: boolean; message: string } {
  if (titleId === "") {
    player.activeTitle = undefined;
    return { success: true, message: "Title cleared." };
  }

  if (!player.titles.includes(titleId)) {
    return { success: false, message: "You don't have that title." };
  }

  player.activeTitle = titleId;
  const info = getTitleInfo(titleId);

  return {
    success: true,
    message: `Active title set to **${info?.name ?? titleId}**.`,
  };
}

export function checkAutoTitles(player: GamePlayer): string[] {
  const newTitles: string[] = [];

  const checks: Array<{ id: string; condition: boolean }> = [
    { id: "Novice", condition: player.level >= 1 },
    { id: "Hunter", condition: player.level >= 10 },
    { id: "Dragon Slayer", condition: player.level >= 20 },
    { id: "Abyss Walker", condition: player.level >= 30 },
    { id: "Godslayer", condition: player.level >= 50 },
    { id: "The Unlucky", condition: player.deaths >= 10 },
    { id: "The Immortal", condition: player.deaths === 0 && player.level >= 20 },
    { id: "Millionaire", condition: player.coins >= 1_000_000 },
  ];

  for (const check of checks) {
    if (check.condition && !player.titles.includes(check.id)) {
      player.titles.push(check.id);
      newTitles.push(check.id);
    }
  }

  return newTitles;
}
