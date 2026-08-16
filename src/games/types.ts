export type Rarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

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
