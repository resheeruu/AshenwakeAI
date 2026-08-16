import { GamePlayer } from "../types";
import { updatePlayer } from "../store";
import {
  applyLevelUp,
  updateAchievements,
} from "../rewards";

export type Racer = {
  id: number;
  name: string;
  emoji: string;
  odds: number;
};

export type RacingResult = {
  winner: Racer;
  selected: Racer;
  bet: number;
  payout: number;
  won: boolean;
  xp: number;
  levelUp: boolean;
};

const MIN_BET = 10;
const MAX_BET = 1000;

export const RACERS: Racer[] = [
  {
    id: 1,
    name: "Ashfang",
    emoji: "🐺",
    odds: 2,
  },
  {
    id: 2,
    name: "Ember",
    emoji: "🔥",
    odds: 3,
  },
  {
    id: 3,
    name: "Shadow",
    emoji: "🌑",
    odds: 4,
  },
  {
    id: 4,
    name: "Storm",
    emoji: "⚡",
    odds: 5,
  },
  {
    id: 5,
    name: "Phantom",
    emoji: "👻",
    odds: 7,
  },
];

export function chooseWinner(): Racer {
  const totalWeight = RACERS.reduce(
    (sum, racer) => sum + 1 / racer.odds,
    0,
  );

  let roll = Math.random() * totalWeight;

  for (const racer of RACERS) {
    roll -= 1 / racer.odds;

    if (roll <= 0) {
      return racer;
    }
  }

  return RACERS[RACERS.length - 1];
}

export async function race(
  player: GamePlayer,
  racerId: number,
  bet: number,
): Promise<RacingResult> {
  if (
    !Number.isInteger(bet) ||
    bet < MIN_BET ||
    bet > MAX_BET
  ) {
    throw new Error("INVALID_RACING_BET");
  }

  if (player.coins < bet) {
    throw new Error("NOT_ENOUGH_COINS");
  }

  const selected = RACERS.find(
    (racer) => racer.id === racerId,
  );

  if (!selected) {
    throw new Error("INVALID_RACER");
  }

  player.coins -= bet;

  const winner = chooseWinner();

  const won = winner.id === selected.id;

  const payout = won
    ? bet * selected.odds
    : 0;

  const xp = won ? 30 : 5;

  player.coins += payout;
  player.xp += xp;
  player.gamesPlayed++;

  if (won) {
    player.wins++;
    player.streak++;

    player.bestStreak = Math.max(
      player.bestStreak,
      player.streak,
    );
  } else {
    player.losses++;
    player.streak = 0;
  }

  const levelUp = applyLevelUp(player);

  updateAchievements(player);

  await updatePlayer(player);

  return {
    winner,
    selected,
    bet,
    payout,
    won,
    xp,
    levelUp,
  };
}

export const RACING_MIN_BET = MIN_BET;
export const RACING_MAX_BET = MAX_BET;
