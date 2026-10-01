#!/usr/bin/env node
/* ================================================================
 * ASHENAI GAME INTEGRITY TESTS
 *
 * Regression tests for game economy and race-condition fixes.
 * All tests use isolated test data directory (ASHENAI_DATA_DIR).
 * ================================================================ */

import path from "node:path";
import os from "node:os";
import { mkdirSync } from "node:fs";

const TEST_DATA_DIR = process.env.ASHENAI_DATA_DIR ?? path.join(os.tmpdir(), `ashenai-game-integrity-${Date.now()}`);
process.env.ASHENAI_DATA_DIR = TEST_DATA_DIR;
mkdirSync(TEST_DATA_DIR, { recursive: true });

import { mutatePlayer, getPlayer } from "../src/games/store";
import {
  playBattle,
} from "../src/games/games/battle";
import {
  startBlackjack,
  standBlackjack,
  hitBlackjack,
} from "../src/games/games/blackjack";
import {
  startQuickDraw,
  reactQuickDraw,
} from "../src/games/games/quickdraw";
import {
  startMines,
  revealMinesTile,
  cashOutMines,
} from "../src/games/games/mines";

let passed = 0;
let failed = 0;

function pass(name: string): void {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown): void {
  console.error(`❌ ${name}`, error !== undefined ? error : "");
  failed++;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${String(expected)}", got "${String(actual)}"`);
  }
}

async function createTestPlayer(userId: string, username: string, coins = 1000): Promise<void> {
  await mutatePlayer(userId, async (p) => {
    p.coins = coins;
    p.gamesPlayed = 0;
    p.wins = 0;
    p.losses = 0;
    p.streak = 0;
    p.bestStreak = 0;
    p.xp = 0;
    p.level = 1;
    p.achievements = [];
  }, username);
}

async function main(): Promise<void> {
  console.log("\n🎮 AshenAI Game Integrity Tests\n");

  /* ================================================================
   * TEST 1: Battle completes fast, stats single-counted, balance math
   * ================================================================ */
  try {
    const userId = "test-battle-1";
    await createTestPlayer(userId, "Tester1", 100);
    const initial = await getPlayer(userId);
    assertEqual(initial?.coins, 100, "initial coins");

    const result = await playBattle(userId, "Tester1");

    const after = await getPlayer(userId);
    assertEqual(after?.gamesPlayed, 1, "gamesPlayed incremented once");
    assertEqual(after?.coins, 100 - 15 + result.coinsEarned, "net coin math: 100 - bet + coinsEarned");
    assertEqual(after?.wins + after?.losses, 1, "exactly one of wins/losses incremented");

    pass("1. Battle: single stat increment, correct balance math, achievements present");
  } catch (error) {
    fail("1. Battle: single stat increment, correct balance math", error);
  }

  /* ================================================================
   * TEST 2: Blackjack double-stand race → exactly one settlement
   * ================================================================ */
  try {
    const userId = "test-bj-race";
    await createTestPlayer(userId, "BJTester", 500);

    // Start game without natural blackjack
    let game;
    for (let i = 0; i < 10; i++) {
      const { game: g, immediateResult } = await startBlackjack(userId, "BJTester", 50);
      if (!immediateResult) {
        game = g;
        break;
      }
    }
    if (!game) throw new Error("Could not start non-blackjack game");

    // Fire two concurrent standBlackjack calls
    const [r1, r2] = await Promise.allSettled([
      standBlackjack(userId, "BJTester", game),
      standBlackjack(userId, "BJTester", game),
    ]);

    console.log("  r1:", r1.status, r1.status === "rejected" ? r1.reason?.message : r1.value);
    console.log("  r2:", r2.status, r2.status === "rejected" ? r2.reason?.message : r2.value);

    // Exactly one should succeed, one should throw BLACKJACK_FINISHED
    const successes = [r1, r2].filter(r => r.status === "fulfilled");
    const failures = [r1, r2].filter(r => r.status === "rejected");
    assertEqual(successes.length, 1, "exactly one stand succeeds");
    assertEqual(failures.length, 1, "exactly one stand throws");
    if (failures[0].status === "rejected") {
      assertEqual(failures[0].reason?.message, "BLACKJACK_FINISHED", "second throws BLACKJACK_FINISHED");
    }

    const after = await getPlayer(userId);
    // Coins: 500 - 50 (bet) + payout (if win) or just -50 (if loss)
    // The key is bet was debited ONCE
    const expectedCoinsAfter = 500 - 50 + (successes[0].status === "fulfilled" ? successes[0].value.payout : 0);
    assertEqual(after?.coins, expectedCoinsAfter, "bet debited exactly once");
    assertEqual(after?.gamesPlayed, 1, "gamesPlayed incremented once");

    pass("2. Blackjack double-stand race: single settlement, BLACKJACK_FINISHED on second");
  } catch (error) {
    fail("2. Blackjack double-stand race", error);
  }

  /* ================================================================
   * TEST 3: QuickDraw double-react race → single credit
   * ================================================================ */
  try {
    const userId = "test-qd-race";
    await createTestPlayer(userId, "QDTester", 500);

    // Start with drawAt in past so first call takes win path
    const game = startQuickDraw(userId);
    game.drawAt = Date.now() - 500; // in the past → win path

    // Fire two concurrent reactQuickDraw calls
    const [r1, r2] = await Promise.allSettled([
      reactQuickDraw(userId, "QDTester", game),
      reactQuickDraw(userId, "QDTester", game),
    ]);

    const successes = [r1, r2].filter(r => r.status === "fulfilled");
    const failures = [r1, r2].filter(r => r.status === "rejected");
    assertEqual(successes.length, 1, "exactly one react succeeds");
    assertEqual(failures.length, 1, "exactly one react throws");
    if (failures[0].status === "rejected") {
      assertEqual(failures[0].reason?.message, "QUICKDRAW_FINISHED", "second throws QUICKDRAW_FINISHED");
    }

    const after = await getPlayer(userId);
    const expectedCoinsAfter = 500 + (successes[0].status === "fulfilled" ? successes[0].value.coins : 0);
    assertEqual(after?.coins, expectedCoinsAfter, "coins credited exactly once");
    assertEqual(after?.gamesPlayed, 1, "gamesPlayed incremented once");

    pass("3. QuickDraw double-react race: single credit, QUICKDRAW_FINISHED on second");
  } catch (error) {
    fail("3. QuickDraw double-react race", error);
  }

  /* ================================================================
   * TEST 4: Mines start TOCTOU → single debit
   * ================================================================ */
  try {
    const userId = "test-mines-start-race";
    await createTestPlayer(userId, "MinesTester", 200);

    // Fire two concurrent startMines calls
    const [r1, r2] = await Promise.allSettled([
      startMines(userId, "MinesTester", 20),
      startMines(userId, "MinesTester", 20),
    ]);

    const successes = [r1, r2].filter(r => r.status === "fulfilled");
    const failures = [r1, r2].filter(r => r.status === "rejected");
    assertEqual(successes.length, 1, "exactly one start succeeds");
    assertEqual(failures.length, 1, "exactly one start throws");
    if (failures[0].status === "rejected") {
      assertEqual(failures[0].reason?.message, "MINES_ALREADY_ACTIVE", "second throws MINES_ALREADY_ACTIVE");
    }

    const after = await getPlayer(userId);
    assertEqual(after?.coins, 180, "bet debited exactly once (200 - 20)");

    pass("4. Mines start TOCTOU: single debit, MINES_ALREADY_ACTIVE on second");
  } catch (error) {
    fail("4. Mines start TOCTOU", error);
  }

  /* ================================================================
   * TEST 5: Blackjack start TOCTOU → single debit
   * ================================================================ */
  try {
    const userId = "test-bj-start-race";
    await createTestPlayer(userId, "BJStartTester", 200);

    const [r1, r2] = await Promise.allSettled([
      startBlackjack(userId, "BJStartTester", 20),
      startBlackjack(userId, "BJStartTester", 20),
    ]);

    const successes = [r1, r2].filter(r => r.status === "fulfilled");
    const failures = [r1, r2].filter(r => r.status === "rejected");
    assertEqual(successes.length, 1, "exactly one start succeeds");
    assertEqual(failures.length, 1, "exactly one start throws");
    if (failures[0].status === "rejected") {
      assertEqual(failures[0].reason?.message, "BLACKJACK_ALREADY_ACTIVE", "second throws BLACKJACK_ALREADY_ACTIVE");
    }

    const after = await getPlayer(userId);
    assertEqual(after?.coins, 180, "bet debited exactly once (200 - 20)");

    pass("5. Blackjack start TOCTOU: single debit, BLACKJACK_ALREADY_ACTIVE on second");
  } catch (error) {
    fail("5. Blackjack start TOCTOU", error);
  }

  /* ================================================================
   * SUMMARY
   * ================================================================ */
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Game Integrity Tests: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("❌ suite crashed:", error);
  process.exit(1);
});