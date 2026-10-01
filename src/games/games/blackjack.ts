import { GamePlayer } from "../types";
import { mutatePlayer } from "../store";
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
  startedAt: number;
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
  const now = Date.now();
  for (const [id, game] of sessions) {
    if (game.finished || (now - game.startedAt) > SESSION_MAX_AGE_MS) {
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
  const game = sessions.get(playerId);
  if (game && !game.finished) {
    const now = Date.now();
    if (game.startedAt && (now - game.startedAt) > SESSION_MAX_AGE_MS) {
      sessions.delete(playerId);
      return undefined;
    }
  }
  return game;
}

export async function startBlackjack(
  userId: string,
  username: string,
  bet: number,
): Promise<{
  game: BlackjackGame;
  immediateResult?: BlackjackResult;
}> {
  if (sessions.has(userId)) {
    throw new Error("BLACKJACK_ALREADY_ACTIVE");
  }

  if (!Number.isInteger(bet) || bet < 10) {
    throw new Error("INVALID_BLACKJACK_BET");
  }

  if (bet > 100000) {
    throw new Error("BLACKJACK_BET_TOO_HIGH");
  }

  const deck = createDeck();

  const { result: mutationResult } = await mutatePlayer(userId, async (p: GamePlayer) => {
    /*
     * Re-check under the store lock: the fast check above runs before the
     * first await, so two near-simultaneous starts could both pass it and
     * both debit. The session is created inside this mutator, so checking
     * here closes the race without a second debit.
     */
    if (sessions.has(userId)) {
      throw new Error("BLACKJACK_ALREADY_ACTIVE");
    }

    if (p.coins < bet) {
      throw new Error("NOT_ENOUGH_COINS");
    }

    p.coins -= bet;

    const game: BlackjackGame = {
      playerId: userId,
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
      startedAt: Date.now(),
    };

    sessions.set(userId, game);

    if (blackjack(game.playerCards)) {
      const result = await finishBlackjackInternal(p, game, "blackjack");
      return result;
    }

    return undefined;
  }, username);

  const game = sessions.get(userId)!;
  return { game, immediateResult: mutationResult };
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
  userId: string,
  username: string,
  game: BlackjackGame,
): Promise<BlackjackResult> {
  if (game.finished) {
    throw new Error("BLACKJACK_FINISHED");
  }

  /*
   * Claim the game SYNCHRONOUSLY before the first await. `finished` used
   * to be set only inside the settle mutator (after lock acquisition and
   * a file read), so a second Stand click during that window passed the
   * guard above and the payout was credited twice. Reset on failure so a
   * transient store error leaves the game playable instead of stranded.
   */
  game.finished = true;

  try {
    while (
      calculateTotal(game.dealerCards) < 17
    ) {
      game.dealerCards.push(draw(game.deck));
    }

    const playerTotal =
      calculateTotal(game.playerCards);

    const dealerTotal =
      calculateTotal(game.dealerCards);

    let resultType: "win" | "loss" | "push" | "blackjack" | "bust";

    if (playerTotal > 21) {
      resultType = "bust";
    } else if (dealerTotal > 21) {
      resultType = "win";
    } else if (playerTotal > dealerTotal) {
      resultType = "win";
    } else if (playerTotal < dealerTotal) {
      resultType = "loss";
    } else {
      resultType = "push";
    }

    const { result } = await mutatePlayer(userId, async (p: GamePlayer) => {
      return finishBlackjackInternal(p, game, resultType);
    }, username);

    return result;
  } catch (error) {
    game.finished = false;
    throw error;
  }
}

async function finishBlackjackInternal(
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