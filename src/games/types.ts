export interface GamePlayer {
  userId: string;
  username: string;

  coins: number;
  xp: number;
  level: number;

  wins: number;
  losses: number;
  draws: number;

  streak: number;
  bestStreak: number;

  gamesPlayed: number;

  dailyClaimedAt?: string;
  dailyStreak?: number;
  bestDailyStreak?: number;
  achievements: string[];

  // Ashen Duel stats
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  duelWins: number;
  duelLosses: number;

  // Hunt stats
  huntLastAt?: number;
  huntStreak?: number;
  bestHuntStreak?: number;
  huntsCompleted?: number;
  legendaryHunts?: number;

  // Inventory
  inventory?: Record<string, number>;
  xpBoostActive?: boolean;
  luckyTokenActive?: boolean;
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
