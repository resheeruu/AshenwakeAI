import { GamePlayer } from "../types";
import { updatePlayer } from "../store";
import {
  applyLevelUp,
  updateAchievements,
} from "../rewards";

export type Card = {
  rank: string;
  suit: string;
  value: number;
};

export type BlackjackGame = {
  playerId: string;
  deck: Card[];
  playerCards: Card[];
  dealerCards: Card[];
  bet: number;
  finished: boolean;
};

export type BlackjackResult = {
  result: "win" | "loss" | "push" | "blackjack" | "bust";
  payout: number;
  xp: number;
  levelUp: boolean;
  playerTotal: number;
  dealerTotal: number;
};


const SUITS = ["♠️", "♥️", "♦️", "♣️"];

const RANKS = [
  ["2", 2],
  ["3", 3],
  ["4", 4],
  ["5", 5],
  ["6", 6],
  ["7", 7],
  ["8", 8],
  ["9", 9],
  ["10", 10],
  ["J", 10],
  ["Q", 10],
  ["K", 10],
  ["A", 11],
] as const;

const sessions = new Map<string, BlackjackGame>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_MAX_AGE_MS = 10 * 60 * 1000;

const cleanupTimer = setInterval(() => {
  for (const [id, game] of sessions) {
    if (game.finished) {
      sessions.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const [rank, value] of RANKS) {
      deck.push({
        rank,
        suit,
        value,
      });
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

export function cardText(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function handText(cards: Card[]): string {
  return cards.map(cardText).join(" ");
}

export function calculateTotal(cards: Card[]): number {
  let total = cards.reduce(
    (sum, card) => sum + card.value,
    0,
  );

  let aces = cards.filter(
    (card) => card.rank === "A",
  ).length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function draw(deck: Card[]): Card {
  const card = deck.pop();

  if (!card) {
    throw new Error("BLACKJACK_DECK_EMPTY");
  }

  return card;
}

function blackjack(cards: Card[]): boolean {
  return (
    cards.length === 2 &&
    calculateTotal(cards) === 21
  );
}

export function getBlackjackGame(
  playerId: string,
): BlackjackGame | undefined {
  return sessions.get(playerId);
}

export async function startBlackjack(
  player: GamePlayer,
  bet: number,
): Promise<{
  game: BlackjackGame;
  immediateResult?: BlackjackResult;
}> {
  if (sessions.has(player.userId)) {
    throw new Error("BLACKJACK_ALREADY_ACTIVE");
  }

  if (!Number.isInteger(bet) || bet < 10) {
    throw new Error("INVALID_BLACKJACK_BET");
  }

  if (bet > 100000) {
    throw new Error("BLACKJACK_BET_TOO_HIGH");
  }

  if (player.coins < bet) {
    throw new Error("NOT_ENOUGH_COINS");
  }

  const deck = createDeck();

  player.coins -= bet;

  const game: BlackjackGame = {
    playerId: player.userId,
    deck,
    playerCards: [
      draw(deck),
      draw(deck),
    ],
    dealerCards: [
      draw(deck),
      draw(deck),
    ],
    bet,
    finished: false,
  };

  sessions.set(player.userId, game);

  if (blackjack(game.playerCards)) {
    const result = await finishBlackjack(
      player,
      game,
      "blackjack",
    );

    return {
      game,
      immediateResult: result,
    };
  }

  return { game };
}

export function hitBlackjack(
  game: BlackjackGame,
): Card {
  if (game.finished) {
    throw new Error("BLACKJACK_FINISHED");
  }

  const card = draw(game.deck);

  game.playerCards.push(card);

  return card;
}

export async function standBlackjack(
  player: GamePlayer,
  game: BlackjackGame,
): Promise<BlackjackResult> {
  if (game.finished) {
    throw new Error("BLACKJACK_FINISHED");
  }

  while (
    calculateTotal(game.dealerCards) < 17
  ) {
    game.dealerCards.push(draw(game.deck));
  }

  const playerTotal =
    calculateTotal(game.playerCards);

  const dealerTotal =
    calculateTotal(game.dealerCards);

  if (playerTotal > 21) {
    return finishBlackjack(
      player,
      game,
      "bust",
    );
  }

  if (dealerTotal > 21) {
    return finishBlackjack(
      player,
      game,
      "win",
    );
  }

  if (playerTotal > dealerTotal) {
    return finishBlackjack(
      player,
      game,
      "win",
    );
  }

  if (playerTotal < dealerTotal) {
    return finishBlackjack(
      player,
      game,
      "loss",
    );
  }

  return finishBlackjack(
    player,
    game,
    "push",
  );
}

async function finishBlackjack(
  player: GamePlayer,
  game: BlackjackGame,
  result:
    | "win"
    | "loss"
    | "push"
    | "blackjack"
    | "bust",
): Promise<BlackjackResult> {
  game.finished = true;

  let payout = 0;
  let xp = 5;

  if (result === "blackjack") {
    payout = Math.floor(game.bet * 2.5);
    xp = 50;
  } else if (result === "win") {
    payout = game.bet * 2;
    xp = 30;
  } else if (result === "push") {
    payout = game.bet;
    xp = 15;
  }

  // Casino accounting.
  player.casinoWagered =
    (player.casinoWagered ?? 0) + game.bet;

  if (
    result === "win" ||
    result === "blackjack"
  ) {
    player.casinoWins =
      (player.casinoWins ?? 0) + 1;

    player.casinoWon =
      (player.casinoWon ?? 0) + payout;
  } else if (
    result === "loss" ||
    result === "bust"
  ) {
    player.casinoLosses =
      (player.casinoLosses ?? 0) + 1;

    player.casinoLost =
      (player.casinoLost ?? 0) + game.bet;
  }

  player.coins += payout;
  player.xp += xp;
  player.gamesPlayed++;

  if (
    result === "win" ||
    result === "blackjack"
  ) {
    player.wins++;
    player.streak++;

    player.bestStreak = Math.max(
      player.bestStreak,
      player.streak,
    );
  } else if (
    result === "loss" ||
    result === "bust"
  ) {
    player.losses++;
    player.streak = 0;
  } else {
    player.draws++;
  }

  const levelUp = applyLevelUp(player);

  updateAchievements(player);

  await updatePlayer(player);

  sessions.delete(player.userId);

  return {
    result,
    payout,
    xp,
    levelUp,
    playerTotal: calculateTotal(
      game.playerCards,
    ),
    dealerTotal: calculateTotal(
      game.dealerCards,
    ),
  };
}

export function cancelBlackjack(
  playerId: string,
): void {
  sessions.delete(playerId);
}

export const BLACKJACK_MIN_BET = 10;
