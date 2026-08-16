import { GamePlayer } from "../types";
import { updatePlayer } from "../store";
import {
  applyLevelUp,
  updateAchievements,
} from "../rewards";

export type RouletteColor =
  | "red"
  | "black"
  | "green";

export type RouletteBetType =
  | "red"
  | "black"
  | "number";

export type RouletteResult = {
  number: number;
  color: RouletteColor;
  betType: RouletteBetType;
  bet: number;
  payout: number;
  won: boolean;
  xp: number;
  levelUp: boolean;
};

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9,
  12, 14, 16, 18,
  19, 21, 23, 25,
  27, 30, 32, 34, 36,
]);

const MIN_BET = 10;
const MAX_BET = 1000;

export function getRouletteColor(
  number: number,
): RouletteColor {
  if (number === 0) {
    return "green";
  }

  return RED_NUMBERS.has(number)
    ? "red"
    : "black";
}

export function spinRoulette(): number {
  return Math.floor(Math.random() * 37);
}

export async function playRoulette(
  player: GamePlayer,
  betType: RouletteBetType,
  bet: number,
  selectedNumber?: number,
): Promise<RouletteResult> {
  if (
    !Number.isInteger(bet) ||
    bet < MIN_BET ||
    bet > MAX_BET
  ) {
    throw new Error("INVALID_ROULETTE_BET");
  }

  if (player.coins < bet) {
    throw new Error("NOT_ENOUGH_COINS");
  }

  if (
    betType === "number" &&
    (
      selectedNumber === undefined ||
      !Number.isInteger(selectedNumber) ||
      selectedNumber < 0 ||
      selectedNumber > 36
    )
  ) {
    throw new Error("INVALID_ROULETTE_NUMBER");
  }

  player.coins -= bet;

  const number = spinRoulette();
  const color = getRouletteColor(number);

  let won = false;
  let payout = 0;

  if (
    betType === "red" ||
    betType === "black"
  ) {
    won = color === betType;

    if (won) {
      payout = bet * 2;
    }
  } else {
    won = number === selectedNumber;

    if (won) {
      payout = bet * 35;
    }
  }

  const xp = won
    ? betType === "number"
      ? 50
      : 25
    : 5;

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
    number,
    color,
    betType,
    bet,
    payout,
    won,
    xp,
    levelUp,
  };
}

export const ROULETTE_MIN_BET = MIN_BET;
export const ROULETTE_MAX_BET = MAX_BET;
