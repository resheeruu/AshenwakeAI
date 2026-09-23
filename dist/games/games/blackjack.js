"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var blackjack_exports = {};
__export(blackjack_exports, {
  BLACKJACK_MIN_BET: () => BLACKJACK_MIN_BET,
  calculateTotal: () => calculateTotal,
  cancelBlackjack: () => cancelBlackjack,
  cardText: () => cardText,
  getBlackjackGame: () => getBlackjackGame,
  handText: () => handText,
  hitBlackjack: () => hitBlackjack,
  standBlackjack: () => standBlackjack,
  startBlackjack: () => startBlackjack
});
module.exports = __toCommonJS(blackjack_exports);
var import_store = require("../store");
var import_rewards = require("../rewards");
const SUITS = ["\u2660\uFE0F", "\u2665\uFE0F", "\u2666\uFE0F", "\u2663\uFE0F"];
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
  ["A", 11]
];
const sessions = /* @__PURE__ */ new Map();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1e3;
const SESSION_MAX_AGE_MS = 10 * 60 * 1e3;
const cleanupTimer = setInterval(() => {
  for (const [id, game] of sessions) {
    if (game.finished) {
      sessions.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const [rank, value] of RANKS) {
      deck.push({
        rank,
        suit,
        value
      });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function cardText(card) {
  return `${card.rank}${card.suit}`;
}
function handText(cards) {
  return cards.map(cardText).join(" ");
}
function calculateTotal(cards) {
  let total = cards.reduce(
    (sum, card) => sum + card.value,
    0
  );
  let aces = cards.filter(
    (card) => card.rank === "A"
  ).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}
function draw(deck) {
  const card = deck.pop();
  if (!card) {
    throw new Error("BLACKJACK_DECK_EMPTY");
  }
  return card;
}
function blackjack(cards) {
  return cards.length === 2 && calculateTotal(cards) === 21;
}
function getBlackjackGame(playerId) {
  return sessions.get(playerId);
}
async function startBlackjack(player, bet) {
  if (sessions.has(player.userId)) {
    throw new Error("BLACKJACK_ALREADY_ACTIVE");
  }
  if (!Number.isInteger(bet) || bet < 10) {
    throw new Error("INVALID_BLACKJACK_BET");
  }
  if (bet > 1e5) {
    throw new Error("BLACKJACK_BET_TOO_HIGH");
  }
  if (player.coins < bet) {
    throw new Error("NOT_ENOUGH_COINS");
  }
  const deck = createDeck();
  player.coins -= bet;
  const game = {
    playerId: player.userId,
    deck,
    playerCards: [
      draw(deck),
      draw(deck)
    ],
    dealerCards: [
      draw(deck),
      draw(deck)
    ],
    bet,
    finished: false
  };
  sessions.set(player.userId, game);
  if (blackjack(game.playerCards)) {
    const result = await finishBlackjack(
      player,
      game,
      "blackjack"
    );
    return {
      game,
      immediateResult: result
    };
  }
  return { game };
}
function hitBlackjack(game) {
  if (game.finished) {
    throw new Error("BLACKJACK_FINISHED");
  }
  const card = draw(game.deck);
  game.playerCards.push(card);
  return card;
}
async function standBlackjack(player, game) {
  if (game.finished) {
    throw new Error("BLACKJACK_FINISHED");
  }
  while (calculateTotal(game.dealerCards) < 17) {
    game.dealerCards.push(draw(game.deck));
  }
  const playerTotal = calculateTotal(game.playerCards);
  const dealerTotal = calculateTotal(game.dealerCards);
  if (playerTotal > 21) {
    return finishBlackjack(
      player,
      game,
      "bust"
    );
  }
  if (dealerTotal > 21) {
    return finishBlackjack(
      player,
      game,
      "win"
    );
  }
  if (playerTotal > dealerTotal) {
    return finishBlackjack(
      player,
      game,
      "win"
    );
  }
  if (playerTotal < dealerTotal) {
    return finishBlackjack(
      player,
      game,
      "loss"
    );
  }
  return finishBlackjack(
    player,
    game,
    "push"
  );
}
async function finishBlackjack(player, game, result) {
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
  player.casinoWagered = (player.casinoWagered ?? 0) + game.bet;
  if (result === "win" || result === "blackjack") {
    player.casinoWins = (player.casinoWins ?? 0) + 1;
    player.casinoWon = (player.casinoWon ?? 0) + payout;
  } else if (result === "loss" || result === "bust") {
    player.casinoLosses = (player.casinoLosses ?? 0) + 1;
    player.casinoLost = (player.casinoLost ?? 0) + game.bet;
  }
  player.coins += payout;
  player.xp += xp;
  player.gamesPlayed++;
  if (result === "win" || result === "blackjack") {
    player.wins++;
    player.streak++;
    player.bestStreak = Math.max(
      player.bestStreak,
      player.streak
    );
  } else if (result === "loss" || result === "bust") {
    player.losses++;
    player.streak = 0;
  } else {
    player.draws++;
  }
  const levelUp = (0, import_rewards.applyLevelUp)(player);
  (0, import_rewards.updateAchievements)(player);
  await (0, import_store.updatePlayer)(player);
  sessions.delete(player.userId);
  return {
    result,
    payout,
    xp,
    levelUp,
    playerTotal: calculateTotal(
      game.playerCards
    ),
    dealerTotal: calculateTotal(
      game.dealerCards
    )
  };
}
function cancelBlackjack(playerId) {
  sessions.delete(playerId);
}
const BLACKJACK_MIN_BET = 10;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BLACKJACK_MIN_BET,
  calculateTotal,
  cancelBlackjack,
  cardText,
  getBlackjackGame,
  handText,
  hitBlackjack,
  standBlackjack,
  startBlackjack
});
