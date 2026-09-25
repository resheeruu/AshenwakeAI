import { GamePlayer } from "../types";
import { updatePlayer } from "../store";
import { applyLevelUp, updateAchievements } from "../rewards";

export interface LotteryResult {
  won: boolean;
  prize: number;
  coinsWon: number;
  tier: string;
  levelUp: boolean;
  newAchievements: string[];
}

const TICKET_COST = 20;
const TIERS = [
  { name: "bronze", multiplier: 2, weight: 40 },
  { name: "silver", multiplier: 5, weight: 25 },
  { name: "gold", multiplier: 15, weight: 10 },
  { name: "legendary", multiplier: 50, weight: 3 },
  { name: "mythic", multiplier: 200, weight: 1 },
];

const TOTAL_WEIGHT = TIERS.reduce((s, t) => s + t.weight, 0);

function pickTier(): typeof TIERS[number] {
  let roll = Math.floor(Math.random() * TOTAL_WEIGHT);
  for (const tier of TIERS) {
    roll -= tier.weight;
    if (roll <= 0) return tier;
  }
  return TIERS[0];
}

export async function playLottery(player: GamePlayer): Promise<LotteryResult> {
  if (player.coins < TICKET_COST) {
    throw new Error("NOT_ENOUGH_COINS");
  }

  player.coins -= TICKET_COST;
  player.gamesPlayed++;

  const tier = pickTier();
  const won = tier.name === "mythic" || tier.name === "legendary" || Math.random() < 0.15;
  const coinsWon = won ? Math.floor(TICKET_COST * tier.multiplier * (0.8 + Math.random() * 0.4)) : 0;

  if (won) {
    player.coins += coinsWon;
    player.wins++;
    player.streak++;
    if (player.streak > player.bestStreak) {
      player.bestStreak = player.streak;
    }
    if (coinsWon >= 1000 && !player.achievements.includes("lottery_elite")) {
      player.achievements.push("lottery_elite");
    }
  } else {
    player.losses++;
    player.streak = 0;
  }

  const levelUp = applyLevelUp(player);
  const before = new Set(player.achievements);
  updateAchievements(player);
  const newAchievements = player.achievements.filter(
    (id) => !before.has(id),
  );
  await updatePlayer(player);

  return {
    won,
    prize: coinsWon,
    coinsWon,
    tier: tier.name,
    levelUp,
    newAchievements,
  };
}

export function getTicketCost(): number {
  return TICKET_COST;
}

export function getTiers() {
  return TIERS;
}
