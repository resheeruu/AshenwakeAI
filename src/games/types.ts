export type Rarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic"
  | "divine";

export type EquipmentSlot =
  | "weapon"
  | "armor"
  | "helmet"
  | "boots"
  | "ring"
  | "amulet";

export interface Equipment {
  id: string;
  name: string;
  slot: EquipmentSlot;
  rarity: Rarity;
  attack: number;
  defense: number;
  hp: number;
  luck: number;
  equipped: boolean;
}

export interface OwnedPet {
  petId: string;
  level: number;
  xp: number;
  evolved: boolean;
  active: boolean;
}

export interface Quest {
  id: string;
  type: "daily" | "weekly" | "story" | "region" | "combat" | "dungeon" | "collection" | "achievement";
  name: string;
  description: string;
  target: number;
  progress: number;
  rewardXp: number;
  rewardCoins: number;
  rewardEquipment?: string;
  rewardTitle?: string;
  rewardReputation?: number;
  completed: boolean;
  claimed: boolean;
  regionId?: string;
  expiresAt?: number;
}

export interface PlayerStatistics {
  totalDamageDealt: number;
  totalDamageTaken: number;
  totalHealing: number;
  bossesKilled: number;
  worldBossesKilled: number;
  dungeonsCompleted: number;
  dungeonsFailed: number;
  questsCompleted: number;
  itemsSold: number;
  itemsBought: number;
  coinsEarned: number;
  coinsSpent: number;
  tradesCompleted: number;
  gamblesPlayed: number;
  gamblesWon: number;
  highestDamage: number;
  longestStreak: number;
  totalPlayTimeMs: number;
  lastActiveAt?: number;
}

export interface GamePlayer {
  userId: string;
  username: string;

  // Core progression
  coins: number;
  xp: number;
  level: number;
  totalXpEarned?: number;

  // General statistics
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  gamesPlayed: number;

  // Daily / achievements
  dailyClaimedAt?: string;
  dailyStreak?: number;
  bestDailyStreak?: number;
  achievements: string[];

  // Character
  classId?: string;
  regionId?: string;
  unlockedRegions?: string[];

  // Ashen Duel
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  duelWins: number;
  duelLosses: number;

  // RPG statistics
  luck: number;
  deaths: number;
  reputation: number;
  titles: string[];
  activeTitle?: string;

  // Hunt
  huntLastAt?: number;
  huntStreak?: number;
  bestHuntStreak?: number;
  huntsCompleted?: number;
  legendaryHunts?: number;
  epicHunts?: number;

  // Inventory / equipment
  inventory: Record<string, number>;
  equipment: Equipment[];

  // Pets
  pets?: OwnedPet[];
  activePetId?: string;

  // Quests
  quests?: Quest[];

  // Detailed statistics
  statistics?: PlayerStatistics;

  // Guild
  guildId?: string;

  // Boosts
  xpBoostActive?: boolean;
  luckyTokenActive?: boolean;

  // Casino
  casinoWagered?: number;
  casinoWon?: number;
  casinoLost?: number;
  casinoWins?: number;
  casinoLosses?: number;
}

export interface GameSession {
  id: string;
  game: string;
  playerIds: string[];
  createdAt: number;
  expiresAt: number;
  state: Record<string, unknown>;
}

export interface GameResult {
  playerId: string;
  result: "win" | "loss" | "draw";
  coins: number;
  xp: number;
}
