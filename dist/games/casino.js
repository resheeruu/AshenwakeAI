"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var casino_exports = {};
__export(casino_exports, {
  CASINO_JACKPOT_RATE: () => CASINO_JACKPOT_RATE,
  CASINO_MAX_WAGER: () => CASINO_MAX_WAGER,
  CASINO_MIN_WAGER: () => CASINO_MIN_WAGER,
  getCasinoStats: () => getCasinoStats,
  getJackpot: () => getJackpot,
  playCasino: () => playCasino
});
module.exports = __toCommonJS(casino_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_lock = require("./lock");
var import_config = require("./config");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const JACKPOT_FILE = import_path.default.join(DATA_DIR, "casino-jackpot.json");
const MIN_WAGER = import_config.GAME_CONFIG.casino.minWager;
const MAX_WAGER = import_config.GAME_CONFIG.casino.maxWager;
const DEFAULT_JACKPOT = import_config.GAME_CONFIG.casino.defaultJackpot;
const JACKPOT_RATE = import_config.GAME_CONFIG.casino.jackpotRate;
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
async function ensureJackpot() {
  await import_fs.default.promises.mkdir(DATA_DIR, { recursive: true });
  if (!import_fs.default.existsSync(JACKPOT_FILE)) {
    await import_fs.default.promises.writeFile(
      JACKPOT_FILE,
      JSON.stringify({ pool: DEFAULT_JACKPOT }, null, 2),
      "utf8"
    );
  }
}
async function getCasinoStats(player) {
  const wagered = player.casinoWagered ?? 0;
  const won = player.casinoWon ?? 0;
  const lost = player.casinoLost ?? 0;
  return {
    wins: player.casinoWins ?? 0,
    losses: player.casinoLosses ?? 0,
    wagered,
    won,
    lost,
    net: won - lost,
    jackpot: await getJackpot()
  };
}
async function getJackpot() {
  return (0, import_lock.withGlobalLock)("casino:jackpot", async () => {
    await ensureJackpot();
    try {
      const raw = await import_fs.default.promises.readFile(
        JACKPOT_FILE,
        "utf8"
      );
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.pool === "number" && Number.isFinite(parsed.pool)) {
        return Math.max(0, Math.floor(parsed.pool));
      }
    } catch {
    }
    return DEFAULT_JACKPOT;
  });
}
async function setJackpot(pool) {
  await (0, import_lock.withGlobalLock)("casino:jackpot", async () => {
    await ensureJackpot();
    const temporary = `${JACKPOT_FILE}.tmp`;
    await import_fs.default.promises.writeFile(
      temporary,
      JSON.stringify(
        {
          pool: Math.max(0, Math.floor(pool))
        },
        null,
        2
      ),
      "utf8"
    );
    await import_fs.default.promises.rename(temporary, JACKPOT_FILE);
  });
}
async function addToJackpot(amount) {
  return (0, import_lock.withGlobalLock)("casino:jackpot", async () => {
    await ensureJackpot();
    let current = DEFAULT_JACKPOT;
    try {
      const raw = await import_fs.default.promises.readFile(JACKPOT_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.pool === "number" && Number.isFinite(parsed.pool)) {
        current = Math.max(0, Math.floor(parsed.pool));
      }
    } catch {
    }
    const next = current + Math.max(0, Math.floor(amount));
    const temporary = `${JACKPOT_FILE}.tmp`;
    await import_fs.default.promises.writeFile(
      temporary,
      JSON.stringify({ pool: next }, null, 2),
      "utf8"
    );
    await import_fs.default.promises.rename(temporary, JACKPOT_FILE);
    return next;
  });
}
function validateWager(player, wager) {
  if (!Number.isInteger(wager)) {
    throw new Error("WAGER_MUST_BE_WHOLE_NUMBER");
  }
  if (wager < MIN_WAGER) {
    throw new Error(
      `MINIMUM_WAGER:${MIN_WAGER}`
    );
  }
  if (wager > MAX_WAGER) {
    throw new Error(
      `MAXIMUM_WAGER:${MAX_WAGER}`
    );
  }
  if (wager > player.coins) {
    throw new Error("INSUFFICIENT_COINS");
  }
}
function applyCasinoResult(player, wager, payout, won) {
  player.coins -= wager;
  player.coins += payout;
  player.casinoWagered = (player.casinoWagered ?? 0) + wager;
  if (won) {
    player.casinoWins = (player.casinoWins ?? 0) + 1;
    player.casinoWon = (player.casinoWon ?? 0) + payout;
  } else {
    player.casinoLosses = (player.casinoLosses ?? 0) + 1;
    player.casinoLost = (player.casinoLost ?? 0) + wager;
  }
}
function finish(game, wager, payout, won, message, jackpotContribution, jackpotHit = false) {
  return {
    game,
    wager,
    payout,
    net: payout - wager,
    won,
    message,
    jackpotContribution,
    jackpotHit
  };
}
async function playCasino(player, game, wager) {
  validateWager(player, wager);
  let payout = 0;
  let won = false;
  let message = "";
  const jackpotContribution = Math.floor(
    wager * JACKPOT_RATE
  );
  await addToJackpot(jackpotContribution);
  if (game === "slots") {
    const symbols = [
      "\u{1F352}",
      "\u{1F34B}",
      "\u{1F514}",
      "\u{1F48E}",
      "7\uFE0F\u20E3"
    ];
    const reels = [
      symbols[randomInt(0, symbols.length - 1)],
      symbols[randomInt(0, symbols.length - 1)],
      symbols[randomInt(0, symbols.length - 1)]
    ];
    const counts = /* @__PURE__ */ new Map();
    for (const symbol of reels) {
      counts.set(
        symbol,
        (counts.get(symbol) ?? 0) + 1
      );
    }
    const highestCount = Math.max(
      ...counts.values()
    );
    if (reels.every(
      (symbol) => symbol === "7\uFE0F\u20E3"
    )) {
      const jackpot = await getJackpot();
      payout = jackpot;
      won = true;
      await setJackpot(DEFAULT_JACKPOT);
      message = `${reels.join(" ")}

\u{1F525} **JACKPOT!**
\u{1F4B0} You won **${jackpot.toLocaleString()} coins**!`;
      applyCasinoResult(
        player,
        wager,
        payout,
        won
      );
      return finish(
        game,
        wager,
        payout,
        won,
        message,
        jackpotContribution,
        true
      );
    }
    if (highestCount === 3) {
      payout = wager * 8;
      won = true;
      message = `${reels.join(" ")}

\u{1F389} **Three of a kind!**`;
    } else if (highestCount === 2) {
      payout = wager * 2;
      won = true;
      message = `${reels.join(" ")}

\u2728 **Pair!**`;
    } else {
      message = `${reels.join(" ")}

\u{1F480} **No match.**`;
    }
  }
  if (game === "coinflip") {
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const playerChoice = Math.random() < 0.5 ? "heads" : "tails";
    won = playerChoice === result;
    payout = won ? wager * 2 : 0;
    message = `\u{1FA99} You chose **${playerChoice}**.
The coin landed on **${result}**.

` + (won ? "\u{1F389} **You win!**" : "\u{1F480} **You lose!**");
  }
  if (game === "dice") {
    const playerRoll = randomInt(1, 6);
    const houseRoll = randomInt(1, 6);
    if (playerRoll > houseRoll) {
      won = true;
      payout = wager * 2;
    } else if (playerRoll === houseRoll) {
      won = false;
      payout = wager;
    }
    message = `\u{1F3B2} Your roll: **${playerRoll}**
\u{1F3B2} House roll: **${houseRoll}**

` + (playerRoll > houseRoll ? "\u{1F389} **You win!**" : playerRoll === houseRoll ? "\u{1F91D} **Draw \u2014 your wager is returned.**" : "\u{1F480} **The house wins.**");
  }
  if (game === "crystal") {
    const roll = Math.random();
    if (roll < 0.05) {
      payout = wager * 10;
      won = true;
      message = "\u{1F48E} **MYTHIC CRYSTAL!**\nYou found the perfect crystal!";
    } else if (roll < 0.2) {
      payout = wager * 4;
      won = true;
      message = "\u{1F48E} **Brilliant Crystal!**";
    } else if (roll < 0.5) {
      payout = wager * 2;
      won = true;
      message = "\u{1F48E} **Shining Crystal!**";
    } else {
      message = "\u{1FAA8} **The crystal shattered.**";
    }
  }
  if (game === "chest") {
    const roll = Math.random();
    if (roll < 0.02) {
      payout = wager * 20;
      won = true;
      message = "\u{1F451} **LEGENDARY CHEST!**\nThe chest contained an incredible treasure!";
    } else if (roll < 0.12) {
      payout = wager * 8;
      won = true;
      message = "\u{1F4B0} **Epic Chest!**\nA mountain of coins!";
    } else if (roll < 0.35) {
      payout = wager * 3;
      won = true;
      message = "\u2728 **Rare Chest!**\nYou found valuable treasure.";
    } else {
      message = "\u{1F4E6} **Empty Chest!**\nNothing but dust.";
    }
  }
  if (game === "jackpot") {
    const roll = Math.random();
    if (roll < 5e-3) {
      const jackpot = await getJackpot();
      payout = jackpot;
      won = true;
      await setJackpot(DEFAULT_JACKPOT);
      message = `\u{1F525} **MEGA JACKPOT!**
\u{1F4B0} You won **${jackpot.toLocaleString()} coins**!`;
    } else if (roll < 0.05) {
      payout = wager * 10;
      won = true;
      message = "\u{1F3B0} **BIG WIN!**\nThe jackpot wheel stops on a multiplier!";
    } else if (roll < 0.2) {
      payout = wager * 3;
      won = true;
      message = "\u{1F3B0} **Nice spin!**\nYou win a small prize.";
    } else {
      message = "\u{1F3B0} **No luck this time.**\nThe jackpot wheel stops on nothing.";
    }
  }
  if (game === "blackjack") {
    const playerCard = randomInt(1, 11);
    const dealerCard = randomInt(1, 11);
    if (playerCard > dealerCard) {
      won = true;
      payout = wager * 2;
      message = `\u{1F0CF} Your hand: **${playerCard}**
\u{1F0CF} Dealer: **${dealerCard}**

\u{1F389} **Blackjack win!**`;
    } else if (playerCard === dealerCard) {
      won = false;
      payout = wager;
      message = `\u{1F0CF} Your hand: **${playerCard}**
\u{1F0CF} Dealer: **${dealerCard}**

\u{1F91D} **Push \u2014 your wager is returned.**`;
    } else {
      message = `\u{1F0CF} Your hand: **${playerCard}**
\u{1F0CF} Dealer: **${dealerCard}**

\u{1F480} **Dealer wins.**`;
    }
  }
  applyCasinoResult(
    player,
    wager,
    payout,
    won
  );
  return finish(
    game,
    wager,
    payout,
    won,
    message,
    jackpotContribution,
    false
  );
}
const CASINO_MIN_WAGER = MIN_WAGER;
const CASINO_MAX_WAGER = MAX_WAGER;
const CASINO_JACKPOT_RATE = JACKPOT_RATE;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CASINO_JACKPOT_RATE,
  CASINO_MAX_WAGER,
  CASINO_MIN_WAGER,
  getCasinoStats,
  getJackpot,
  playCasino
});
