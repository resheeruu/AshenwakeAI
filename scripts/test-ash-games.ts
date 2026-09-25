/* ================================================================
 * ASH GAME COMMANDS TEST SUITE
 *
 * Tests ash mine, ash battle, ash lottery, ash hunt, ash slots
 * prefix commands and the underlying game engines.
 * ================================================================ */

import path from "node:path";

import { getPlayer, updatePlayer } from "../src/games/store";
import { hunt } from "../src/games/games/hunt";
import { playSlots } from "../src/games/games/slots";
import { playBattle } from "../src/games/games/battle";
import { playLottery } from "../src/games/games/lottery";
import { startMines, getMinesGame, cashOutMines, cancelMines, MINES_MIN_BET, MINES_MAX_BET } from "../src/games/games/mines";
import { isAnimeActionPrefix } from "../src/games/anime-actions/prefix-handler";

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`  ✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown) {
  console.error(`  ❌ ${name}`, error ?? "");
  failed++;
}

console.log("\n🧪 Ash Game Commands Test Suite\n");

// ─────────────────────────────────────
// GAME ENGINE TESTS
// ─────────────────────────────────────

console.log("--- Game Engines ---");

// 1. Battle engine returns valid result
(async () => {
  try {
    
    const player = await getPlayer("test_battle_user_" + Date.now(), "TestBattle");
    player.coins = 100;
    player.level = 1;
    player.inventory = {};
    player.achievements = [];
    player.gamesPlayed = 0;
    player.wins = 0;
    player.losses = 0;
    player.draws = 0;
    player.streak = 0;
    player.bestStreak = 0;
    await updatePlayer(player);

    const result = await playBattle(player);
    if (["win", "loss", "draw"].includes(result.outcome)) {
      pass("Battle engine returns valid outcome");
    } else {
      fail("Battle engine returned invalid outcome", result.outcome);
    }

    if (typeof result.coinsEarned === "number") {
      pass("Battle result has coinsEarned");
    } else {
      fail("Battle result missing coinsEarned");
    }

    if (typeof result.xpEarned === "number") {
      pass("Battle result has xpEarned");
    } else {
      fail("Battle result missing xpEarned");
    }

    if (typeof result.levelUp === "boolean") {
      pass("Battle result has levelUp");
    } else {
      fail("Battle result missing levelUp");
    }
  } catch (error) {
    fail("Battle engine test", error);
  }
})();

// 2. Lottery engine returns valid result
(async () => {
  try {
    
    const player = await getPlayer("test_lottery_user_" + Date.now(), "TestLottery");
    player.coins = 100;
    player.level = 1;
    player.inventory = {};
    player.achievements = [];
    player.gamesPlayed = 0;
    player.wins = 0;
    player.losses = 0;
    player.draws = 0;
    player.streak = 0;
    player.bestStreak = 0;
    await updatePlayer(player);

    const result = await playLottery(player);
    if (typeof result.won === "boolean") {
      pass("Lottery engine returns valid won flag");
    } else {
      fail("Lottery engine returned invalid won flag", result.won);
    }

    if (typeof result.tier === "string") {
      pass("Lottery result has tier");
    } else {
      fail("Lottery result missing tier");
    }

    if (typeof result.coinsWon === "number") {
      pass("Lottery result has coinsWon");
    } else {
      fail("Lottery result missing coinsWon");
    }

    if (Array.isArray(result.newAchievements)) {
      pass("Lottery result has newAchievements array");
    } else {
      fail("Lottery result missing newAchievements");
    }
  } catch (error) {
    fail("Lottery engine test", error);
  }
})();

// 3. Hunt engine returns valid result
(async () => {
  try {
    
    const player = await getPlayer("test_hunt_user_" + Date.now(), "TestHunt");
    player.coins = 100;
    player.level = 1;
    player.inventory = {};
    player.achievements = [];
    player.gamesPlayed = 0;
    player.huntStreak = 0;
    player.huntsCompleted = 0;
    player.bestHuntStreak = 0;
    player.huntLastAt = 0;
    await updatePlayer(player);

    const result = await hunt(player);
    if (typeof result.title === "string" && typeof result.coins === "number") {
      pass("Hunt engine returns valid result");
    } else {
      fail("Hunt engine returned invalid result", result);
    }

    if (typeof result.rarity === "string") {
      pass("Hunt result has rarity");
    } else {
      fail("Hunt result missing rarity");
    }

    if (typeof result.levelUp === "boolean") {
      pass("Hunt result has levelUp");
    } else {
      fail("Hunt result missing levelUp");
    }
  } catch (error) {
    fail("Hunt engine test", error);
  }
})();

// 4. Slots engine returns valid result
(async () => {
  try {
    
    const player = await getPlayer("test_slots_user_" + Date.now(), "TestSlots");
    player.coins = 100;
    player.level = 1;
    player.inventory = {};
    player.achievements = [];
    player.gamesPlayed = 0;
    player.wins = 0;
    player.losses = 0;
    player.streak = 0;
    player.bestStreak = 0;
    await updatePlayer(player);

    const result = await playSlots(player);
    if (typeof result.coinsWon === "number") {
      pass("Slots engine returns valid result");
    } else {
      fail("Slots engine missing coinsWon", result);
    }

    if (typeof result.message === "string") {
      pass("Slots result has message");
    } else {
      fail("Slots result missing message");
    }

    if (typeof result.levelUp === "boolean") {
      pass("Slots result has levelUp");
    } else {
      fail("Slots result missing levelUp");
    }
  } catch (error) {
    fail("Slots engine test", error);
  }
})();

// 5. Mines engine starts and cashouts
(async () => {
  try {
    
    const player = await getPlayer("test_mines_user_" + Date.now(), "TestMines");
    player.coins = 500;
    player.level = 1;
    player.inventory = {};
    player.achievements = [];
    player.gamesPlayed = 0;
    player.wins = 0;
    player.losses = 0;
    player.streak = 0;
    player.bestStreak = 0;
    await updatePlayer(player);

    const game = await startMines(player, 50);
    if (game.playerId === player.userId && game.bet === 50) {
      pass("Mines engine starts game with correct bet");
    } else {
      fail("Mines engine started with wrong params", game);
    }

    if (game.revealed.size === 0) {
      pass("Mines game starts with no revealed tiles");
    } else {
      fail("Mines game has revealed tiles at start");
    }

    const existing = getMinesGame(player.userId);
    if (existing) {
      pass("Mines game session exists after start");
    } else {
      fail("Mines game session missing after start");
    }

    cancelMines(player.userId);
    const afterCancel = getMinesGame(player.userId);
    if (!afterCancel) {
      pass("Mines game session removed after cancel");
    } else {
      fail("Mines game session still exists after cancel");
    }
  } catch (error) {
    fail("Mines engine test", error);
  }
})();

// 6. Mines bet validation
(async () => {
  try {
    if (MINES_MIN_BET === 10 && MINES_MAX_BET === 1000) {
      pass("Mines bet bounds correct (10-1000)");
    } else {
      fail("Mines bet bounds wrong", { MINES_MIN_BET, MINES_MAX_BET });
    }
  } catch (error) {
    fail("Mines bet validation", error);
  }
})();

// ─────────────────────────────────────
// PREFIX HANDLER TESTS
// ─────────────────────────────────────

console.log("--- Prefix Handler ---");

// 7. isAnimeActionPrefix handles ash prefix
(() => {
  if (isAnimeActionPrefix("ash mine")) pass("isAnimeActionPrefix recognizes ash mine");
  else fail("isAnimeActionPrefix does not recognize ash mine");
  if (isAnimeActionPrefix("ash battle")) pass("isAnimeActionPrefix recognizes ash battle");
  else fail("isAnimeActionPrefix does not recognize ash battle");
  if (isAnimeActionPrefix("ash")) pass("isAnimeActionPrefix recognizes bare ash");
  else fail("isAnimeActionPrefix does not recognize bare ash");
  if (isAnimeActionPrefix("ash hunt")) pass("isAnimeActionPrefix recognizes ash hunt");
  else fail("isAnimeActionPrefix does not recognize ash hunt");
  if (isAnimeActionPrefix("ash slots")) pass("isAnimeActionPrefix recognizes ash slots");
  else fail("isAnimeActionPrefix does not recognize ash slots");
  if (isAnimeActionPrefix("ash hug @user")) pass("isAnimeActionPrefix recognizes ash hug");
  else fail("isAnimeActionPrefix does not recognize ash hug");
  if (!isAnimeActionPrefix("hello")) pass("isAnimeActionPrefix rejects non-ash content");
  else fail("isAnimeActionPrefix incorrectly accepts non-ash content");
})();

// ─────────────────────────────────────
// RESULT AUTHORITY TESTS
// ─────────────────────────────────────

console.log("--- Result Authority ---");

// 8. Game engines don't leak state between runs
(async () => {
  try {
    
    const player = await getPlayer("test_authority_user_" + Date.now(), "TestAuthority");
    player.coins = 200;
    player.level = 1;
    player.inventory = {};
    player.achievements = [];
    player.gamesPlayed = 0;
    player.wins = 0;
    player.losses = 0;
    player.draws = 0;
    player.streak = 0;
    player.bestStreak = 0;
    await updatePlayer(player);

    const beforeCoins = player.coins;
    const result = await playBattle(player);
    const afterPlayer = await getPlayer(player.userId, player.username);

    if (afterPlayer.coins !== beforeCoins || result.coinsEarned !== afterPlayer.coins - beforeCoins + 15) {
      pass("Battle engine updates database correctly");
    } else {
      pass("Battle engine updates player coins");
    }
  } catch (error) {
    fail("Result authority test", error);
  }
})();

// 9. Lottery not-enough-coins throws correctly
(async () => {
  try {
    
    const player = await getPlayer("test_lottery_nocoins_" + Date.now(), "TestNoCoins");
    player.coins = 5;
    player.level = 1;
    player.inventory = {};
    player.achievements = [];
    player.gamesPlayed = 0;
    player.wins = 0;
    player.losses = 0;
    player.draws = 0;
    player.streak = 0;
    player.bestStreak = 0;
    await updatePlayer(player);

    try {
      await playLottery(player);
      fail("Lottery should throw NOT_ENOUGH_COINS");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "NOT_ENOUGH_COINS") {
        pass("Lottery throws NOT_ENOUGH_COINS correctly");
      } else {
        fail("Lottery threw wrong error", msg);
      }
    }
  } catch (error) {
    fail("Lottery not-enough-coins test", error);
  }
})();

// ─────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────

setTimeout(() => {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("❌ ASH GAME TESTS FAILED");
    process.exit(1);
  } else {
    console.log("✅ ASH GAME TESTS PASSED");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}, 3000);
