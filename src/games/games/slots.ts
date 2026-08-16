import { GamePlayer } from "../types";
import { updatePlayer } from "../store";
import {
  applyLevelUp,
  updateAchievements,
} from "../rewards";

export type SlotsResult = {
  symbols: string[];
  coinsSpent: number;
  coinsWon: number;
  xp: number;
  levelUp: boolean;
  message: string;
};

const COST = 10;

const SYMBOLS = [
  "🍒",
  "🍋",
  "🔔",
  "💎",
  "🔥",
  "⭐",
];

function randomSymbol(): string {
  return SYMBOLS[
    Math.floor(Math.random() * SYMBOLS.length)
  ];
}

export async function playSlots(
  player: GamePlayer,
): Promise<SlotsResult> {
  if (player.coins < COST) {
    throw new Error("NOT_ENOUGH_COINS");
  }

  player.coins -= COST;

  const symbols = [
    randomSymbol(),
    randomSymbol(),
    randomSymbol(),
  ];

  let coinsWon = 0;
  let xp = 10;
  let message = "Nothing matched.";

  const [a, b, c] = symbols;

  if (a === b && b === c) {
    if (a === "💎") {
      coinsWon = 500;
      xp = 100;
      message = "💎💎💎 JACKPOT! Massive diamond jackpot!";
    } else if (a === "🔥") {
      coinsWon = 300;
      xp = 75;
      message = "🔥🔥🔥 ASHEN JACKPOT! The realm is burning!";
    } else if (a === "⭐") {
      coinsWon = 200;
      xp = 60;
      message = "⭐⭐⭐ STAR JACKPOT!";
    } else {
      coinsWon = 100;
      xp = 40;
      message = `${a}${a}${a} Triple match!`;
    }
  } else if (a === b || b === c || a === c) {
    coinsWon = 25;
    xp = 20;
    message = "✨ Two symbols matched!";
  } else {
    coinsWon = 0;
    xp = 5;
    message = "💨 No match. Better luck next spin!";
  }

  player.coins += coinsWon;
  player.xp += xp;

  const levelUp = applyLevelUp(player);

  updateAchievements(player);

  await updatePlayer(player);

  return {
    symbols,
    coinsSpent: COST,
    coinsWon,
    xp,
    levelUp,
    message,
  };
}
