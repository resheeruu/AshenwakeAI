/* ================================================================
 * GAME DEFINITIONS
 *
 * Central registry of all Ash games. Each game defines its metadata,
 * command syntax, and configuration. This is the single source of truth
 * for game metadata used by the Discord bot, web dashboard, and API.
 * ================================================================ */

export type GameCategory = "arcade" | "casino" | "rpg";

export interface GameDefinition {
  /** Unique command identifier (e.g., "mine", "battle") */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Short description for UI listings */
  description: string;
  /** Category for grouping in UI */
  category: GameCategory;
  /** Discord emoji for UI representation */
  emoji: string;
  /** Primary command syntax (e.g., "ash mine [bet]") */
  syntax: string;
  /** Short aliases (e.g., ["mine", "m"]) */
  aliases: string[];
  /** Minimum bet/coins required (if applicable) */
  minBet?: number;
  /** Maximum bet/coins allowed (if applicable) */
  maxBet?: number;
  /** Base cost to play (coins) */
  cost?: number;
  /** Whether the game supports betting */
  hasBetting: boolean;
  /** Cooldown in milliseconds */
  cooldownMs: number;
  /** Short feature highlights for UI cards */
  features: string[];
  /** Whether the game is currently enabled/available */
  enabled: boolean;
}

/** All registered games - single source of truth */
export const GAMES: GameDefinition[] = [
  {
    name: "mine",
    displayName: "Mines",
    description: "Grid sweep with a cash-out decision every tile",
    category: "arcade",
    emoji: "⛏",
    syntax: "ash mine [bet]",
    aliases: ["mine", "m"],
    minBet: 10,
    maxBet: 1000,
    cost: 10,
    hasBetting: true,
    cooldownMs: 5_000,
    features: ["16-tile grid", "3 hidden mines", "Cash out anytime", "Auto-reveal first 3 tiles"],
    enabled: true,
  },
  {
    name: "battle",
    displayName: "Battle",
    description: "Turn-based duel with crit, dodge, and defend mechanics",
    category: "arcade",
    emoji: "⚔",
    syntax: "ash battle",
    aliases: ["battle", "b"],
    cost: 15,
    hasBetting: false,
    cooldownMs: 8_000,
    features: ["Turn-based combat", "Crit/dodge/defend", "Enemy variety", "XP & coin rewards"],
    enabled: true,
  },
  {
    name: "lottery",
    displayName: "Lottery",
    description: "Ticket draw with tiered prize payouts",
    category: "casino",
    emoji: "🎟",
    syntax: "ash lottery",
    aliases: ["lottery", "lotto", "lt"],
    cost: 20,
    hasBetting: false,
    cooldownMs: 10_000,
    features: ["Tiered prizes", "Jackpot system", "Instant results"],
    enabled: true,
  },
  {
    name: "hunt",
    displayName: "Hunt",
    description: "Rare encounters, loot drops, XP and death penalties",
    category: "rpg",
    emoji: "🏹",
    syntax: "ash hunt",
    aliases: ["hunt", "h"],
    cost: 0,
    hasBetting: false,
    cooldownMs: 15_000,
    features: ["Rare encounters", "Loot drops", "XP & death penalties", "Streak tracking"],
    enabled: true,
  },
  {
    name: "slots",
    displayName: "Slots",
    description: "Wager, spin, and settle against the economy",
    category: "casino",
    emoji: "🎰",
    syntax: "ash slots",
    aliases: ["slots", "slot"],
    cost: 10,
    hasBetting: false,
    cooldownMs: 5_000,
    features: ["3-reel spin", "Symbol combinations", "Jackpot chance", "Economy-first"],
    enabled: true,
  },
  {
    name: "blackjack",
    displayName: "Blackjack",
    description: "Classic 21 with hit, stand, and double down",
    category: "casino",
    emoji: "🃏",
    syntax: "ash blackjack [bet]",
    aliases: ["blackjack", "bj", "21"],
    minBet: 10,
    maxBet: 100_000,
    cost: 10,
    hasBetting: true,
    cooldownMs: 8_000,
    features: ["Hit/Stand/Double", "Blackjack pays 3:2", "Dealer hits soft 17", "Insurance option"],
    enabled: true,
  },
  {
    name: "quickdraw",
    displayName: "QuickDraw",
    description: "Reaction-time duel — fastest draw wins",
    category: "arcade",
    emoji: "⚡",
    syntax: "ash quickdraw",
    aliases: ["quickdraw", "qd"],
    cost: 0,
    hasBetting: false,
    cooldownMs: 10_000,
    features: ["Reaction timing", "Random draw window", "Instant resolution"],
    enabled: true,
  },
];

const gameByName = new Map<string, GameDefinition>();
const gameByAlias = new Map<string, GameDefinition>();

for (const game of GAMES) {
  gameByName.set(game.name, game);
  for (const alias of game.aliases) {
    gameByAlias.set(alias, game);
  }
}

export function getGame(input: string): GameDefinition | undefined {
  const lower = input.toLowerCase();
  return gameByName.get(lower) ?? gameByAlias.get(lower);
}

export function getAllGames(): GameDefinition[] {
  return [...GAMES];
}

export function getGamesByCategory(category: GameCategory): GameDefinition[] {
  return GAMES.filter((g) => g.category === category);
}

export const GAME_NAMES = GAMES.map((g) => g.name);
export type GameCommandName = string;