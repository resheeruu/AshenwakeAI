export type GamePlayer = {
  userId: string;
  username: string;

  // Economy
  coins: number;

  // Progression
  xp: number;
  level: number;

  // General game stats
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  streak: number;
  bestStreak: number;

  // Daily
  dailyClaimedAt?: string;
  dailyStreak: number;
  bestDailyStreak: number;

  // Achievements
  achievements: string[];

  // Combat
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  duelWins: number;
  duelLosses: number;

  // Hunting
  huntLastAt?: number;
  huntStreak: number;
  bestHuntStreak: number;
  huntsCompleted: number;
  legendaryHunts: number;

  // Inventory
  inventory: Record<string, number>;

  // Active bonuses
  xpBoostActive: boolean;
  luckyTokenActive: boolean;

  // RPG progression
  classId?: string;
  reputation: number;

  // Casino
  casinoWins: number;
  casinoLosses: number;
  casinoWagered: number;
  casinoWon: number;
  casinoLost: number;
};

export type GameSession = {
  id: string;
  game: string;
  playerIds: string[];
  createdAt: number;
  expiresAt: number;
  state: Record<string, unknown>;
};

export type GameResult = {
  playerId: string;
  result: "win" | "loss" | "draw";
  coins: number;
  xp: number;
};

export type Rarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";
