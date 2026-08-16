import fs from "fs";
import path from "path";
import { GamePlayer } from "./types";
import { withGlobalLock, withPlayerLock } from "./lock";

export type CasinoGame =
  | "slots"
  | "coinflip"
  | "dice"
  | "blackjack"
  | "crystal"
  | "chest";

export type CasinoResult = {
  game: CasinoGame;
  wager: number;
  payout: number;
  net: number;
  won: boolean;
  message: string;
  jackpotContribution: number;
  jackpotHit: boolean;
};

const DATA_DIR = path.join(process.cwd(), "data");
const JACKPOT_FILE = path.join(DATA_DIR, "casino-jackpot.json");

const MIN_WAGER = 10;
const MAX_WAGER = 100_000;
const DEFAULT_JACKPOT = 10_000;

// 5% of every casino wager feeds the jackpot.
const JACKPOT_RATE = 0.05;

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

async function ensureJackpot(): Promise<void> {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  if (!fs.existsSync(JACKPOT_FILE)) {
    await fs.promises.writeFile(
      JACKPOT_FILE,
      JSON.stringify({ pool: DEFAULT_JACKPOT }, null, 2),
      "utf8",
    );
  }
}

export async function getCasinoStats(player: GamePlayer): Promise<{
  wins: number;
  losses: number;
  wagered: number;
  won: number;
  lost: number;
  net: number;
  jackpot: number;
}> {
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
    jackpot: await getJackpot(),
  };
}

export async function getJackpot(): Promise<number> {
  return withGlobalLock("casino:jackpot", async () => {
    await ensureJackpot();

    try {
      const raw = await fs.promises.readFile(
        JACKPOT_FILE,
        "utf8",
      );

      const parsed = JSON.parse(raw);

      if (
        parsed &&
        typeof parsed.pool === "number" &&
        Number.isFinite(parsed.pool)
      ) {
        return Math.max(0, Math.floor(parsed.pool));
      }
    } catch {
      // Fall through to the default.
    }

    return DEFAULT_JACKPOT;
  });
}

async function setJackpot(pool: number): Promise<void> {
  await withGlobalLock("casino:jackpot", async () => {
    await ensureJackpot();

    const temporary = `${JACKPOT_FILE}.tmp`;

    await fs.promises.writeFile(
      temporary,
      JSON.stringify(
        {
          pool: Math.max(0, Math.floor(pool)),
        },
        null,
        2,
      ),
      "utf8",
    );

    await fs.promises.rename(temporary, JACKPOT_FILE);
  });
}

async function addToJackpot(amount: number): Promise<number> {
  return withGlobalLock("casino:jackpot", async () => {
    await ensureJackpot();
    let current = DEFAULT_JACKPOT;
    try {
      const raw = await fs.promises.readFile(JACKPOT_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.pool === "number" && Number.isFinite(parsed.pool)) {
        current = Math.max(0, Math.floor(parsed.pool));
      }
    } catch {
      // Use default
    }

    const next = current + Math.max(0, Math.floor(amount));
    const temporary = `${JACKPOT_FILE}.tmp`;
    await fs.promises.writeFile(
      temporary,
      JSON.stringify({ pool: next }, null, 2),
      "utf8",
    );
    await fs.promises.rename(temporary, JACKPOT_FILE);
    return next;
  });
}

function validateWager(
  player: GamePlayer,
  wager: number,
): void {
  if (!Number.isInteger(wager)) {
    throw new Error("WAGER_MUST_BE_WHOLE_NUMBER");
  }

  if (wager < MIN_WAGER) {
    throw new Error(
      `MINIMUM_WAGER:${MIN_WAGER}`,
    );
  }

  if (wager > MAX_WAGER) {
    throw new Error(
      `MAXIMUM_WAGER:${MAX_WAGER}`,
    );
  }

  if (wager > player.coins) {
    throw new Error("INSUFFICIENT_COINS");
  }
}

function applyCasinoResult(
  player: GamePlayer,
  wager: number,
  payout: number,
  won: boolean,
): void {
  player.coins -= wager;
  player.coins += payout;

  player.casinoWagered =
    (player.casinoWagered ?? 0) + wager;

  if (won) {
    player.casinoWins =
      (player.casinoWins ?? 0) + 1;

    player.casinoWon =
      (player.casinoWon ?? 0) + payout;
  } else {
    player.casinoLosses =
      (player.casinoLosses ?? 0) + 1;

    player.casinoLost =
      (player.casinoLost ?? 0) + wager;
  }
}

function finish(
  game: CasinoGame,
  wager: number,
  payout: number,
  won: boolean,
  message: string,
  jackpotContribution: number,
  jackpotHit = false,
): CasinoResult {
  return {
    game,
    wager,
    payout,
    net: payout - wager,
    won,
    message,
    jackpotContribution,
    jackpotHit,
  };
}

export async function playCasino(
  player: GamePlayer,
  game: CasinoGame,
  wager: number,
): Promise<CasinoResult> {
  validateWager(player, wager);

  let payout = 0;
  let won = false;
  let message = "";

  /*
   * The wager contributes to the jackpot before
   * the game result is settled.
   */
  const jackpotContribution = Math.floor(
    wager * JACKPOT_RATE,
  );

  await addToJackpot(jackpotContribution);

  if (game === "slots") {
    const symbols = [
      "🍒",
      "🍋",
      "🔔",
      "💎",
      "7️⃣",
    ];

    const reels = [
      symbols[randomInt(0, symbols.length - 1)],
      symbols[randomInt(0, symbols.length - 1)],
      symbols[randomInt(0, symbols.length - 1)],
    ];

    const counts = new Map<string, number>();

    for (const symbol of reels) {
      counts.set(
        symbol,
        (counts.get(symbol) ?? 0) + 1,
      );
    }

    const highestCount = Math.max(
      ...counts.values(),
    );

    if (
      reels.every(
        (symbol) => symbol === "7️⃣",
      )
    ) {
      const jackpot = await getJackpot();

      payout = jackpot;
      won = true;

      await setJackpot(DEFAULT_JACKPOT);

      message =
        `${reels.join(" ")}\n\n` +
        `🔥 **JACKPOT!**\n` +
        `💰 You won **${jackpot.toLocaleString()} coins**!`;

      applyCasinoResult(
        player,
        wager,
        payout,
        won,
      );

      return finish(
        game,
        wager,
        payout,
        won,
        message,
        jackpotContribution,
        true,
      );
    }

    if (highestCount === 3) {
      payout = wager * 8;
      won = true;

      message =
        `${reels.join(" ")}\n\n` +
        "🎉 **Three of a kind!**";
    } else if (highestCount === 2) {
      payout = wager * 2;
      won = true;

      message =
        `${reels.join(" ")}\n\n` +
        "✨ **Pair!**";
    } else {
      message =
        `${reels.join(" ")}\n\n` +
        "💀 **No match.**";
    }
  }

  if (game === "coinflip") {
    const result =
      Math.random() < 0.5
        ? "heads"
        : "tails";

    const playerChoice =
      Math.random() < 0.5
        ? "heads"
        : "tails";

    won = playerChoice === result;
    payout = won ? wager * 2 : 0;

    message =
      `🪙 You chose **${playerChoice}**.\n` +
      `The coin landed on **${result}**.\n\n` +
      (won
        ? "🎉 **You win!**"
        : "💀 **You lose!**");
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

    message =
      `🎲 Your roll: **${playerRoll}**\n` +
      `🎲 House roll: **${houseRoll}**\n\n` +
      (playerRoll > houseRoll
        ? "🎉 **You win!**"
        : playerRoll === houseRoll
          ? "🤝 **Draw — your wager is returned.**"
          : "💀 **The house wins.**");
  }

  if (game === "crystal") {
    const roll = Math.random();

    if (roll < 0.05) {
      payout = wager * 10;
      won = true;

      message =
        "💎 **MYTHIC CRYSTAL!**\n" +
        "You found the perfect crystal!";
    } else if (roll < 0.20) {
      payout = wager * 4;
      won = true;

      message =
        "💎 **Brilliant Crystal!**";
    } else if (roll < 0.50) {
      payout = wager * 2;
      won = true;

      message =
        "💎 **Shining Crystal!**";
    } else {
      message =
        "🪨 **The crystal shattered.**";
    }
  }

  if (game === "chest") {
    const roll = Math.random();

    if (roll < 0.02) {
      payout = wager * 20;
      won = true;

      message =
        "👑 **LEGENDARY CHEST!**\n" +
        "The chest contained an incredible treasure!";
    } else if (roll < 0.12) {
      payout = wager * 8;
      won = true;

      message =
        "💰 **Epic Chest!**\n" +
        "A mountain of coins!";
    } else if (roll < 0.35) {
      payout = wager * 3;
      won = true;

      message =
        "✨ **Rare Chest!**\n" +
        "You found valuable treasure.";
    } else {
      message =
        "📦 **Empty Chest!**\n" +
        "Nothing but dust.";
    }
  }

  applyCasinoResult(
    player,
    wager,
    payout,
    won,
  );

  return finish(
    game,
    wager,
    payout,
    won,
    message,
    jackpotContribution,
    false,
  );
}

export const CASINO_MIN_WAGER = MIN_WAGER;
export const CASINO_MAX_WAGER = MAX_WAGER;
export const CASINO_JACKPOT_RATE = JACKPOT_RATE;
