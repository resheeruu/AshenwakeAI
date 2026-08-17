/**
 * AshenAI Settlement & Concurrency Test Suite
 */

import { withLock, withPlayerLock, lockManager } from "../src/games/lock";
import { getPlayer, mutatePlayer, loadPlayers } from "../src/games/store";
import {
  settleWagerDeduction,
  settleCasinoPayout,
  settleGameResult,
  settleDailyClaim,
  settleInventoryChange,
  settleEquipmentChange,
  settleExactlyOnce,
} from "../src/games/settlement";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.error(`❌ FAILED: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n🧪 AshenAI Concurrency & Settlement Tests\n");

  /* =====================================================
     1. LOCK MANAGER TESTS
     ===================================================== */
  console.log("===== 1. LOCK MANAGER =====");

  // Test 1: Sequential execution on same key
  const executionOrder: number[] = [];
  const p1 = withLock("test-key", async () => {
    await new Promise((r) => setTimeout(r, 40));
    executionOrder.push(1);
  });
  const p2 = withLock("test-key", async () => {
    await new Promise((r) => setTimeout(r, 10));
    executionOrder.push(2);
  });
  const p3 = withLock("test-key", async () => {
    executionOrder.push(3);
  });

  await Promise.all([p1, p2, p3]);
  assert(
    executionOrder[0] === 1 && executionOrder[1] === 2 && executionOrder[2] === 3,
    "Sequential queue order maintained for identical key",
  );

  // Test 2: Parallel execution on different keys
  let keyAActive = false;
  let concurrentOverlap = false;

  const pa = withLock("key-A", async () => {
    keyAActive = true;
    await new Promise((r) => setTimeout(r, 50));
    keyAActive = false;
  });

  const pb = withLock("key-B", async () => {
    await new Promise((r) => setTimeout(r, 10));
    if (keyAActive) {
      concurrentOverlap = true;
    }
  });

  await Promise.all([pa, pb]);
  assert(concurrentOverlap, "Different keys execute concurrently without blocking");

  // Test 3: Lock cleanup
  assert(
    !lockManager.isLocked("test-key") && !lockManager.isLocked("key-A"),
    "Lock manager cleanly frees keys when queues empty",
  );

  /* =====================================================
     2. STORE CONCURRENCY TESTS
     ===================================================== */
  console.log("\n===== 2. STORE ATOMIC MUTATIONS =====");

  const testUserId = `test_user_${Date.now()}`;
  const initialPlayer = await getPlayer(testUserId, "TestRunner");
  assert(initialPlayer.coins === 100, "New player initialized with 100 coins");

  // Fire 30 concurrent increments of 10 coins each
  const parallelTasks: Promise<any>[] = [];
  for (let i = 0; i < 30; i++) {
    parallelTasks.push(
      mutatePlayer(testUserId, (p) => {
        p.coins += 10;
      }),
    );
  }

  await Promise.all(parallelTasks);

  const finalPlayer = await getPlayer(testUserId);
  assert(
    finalPlayer.coins === 100 + 30 * 10,
    `Zero lost updates under concurrency: expected 400 coins, got ${finalPlayer.coins}`,
  );

  // Test multi-player concurrent independence
  const userA = `user_a_${Date.now()}`;
  const userB = `user_b_${Date.now()}`;
  await Promise.all([
    mutatePlayer(userA, (p) => { p.coins = 500; }),
    mutatePlayer(userB, (p) => { p.coins = 900; }),
  ]);
  const pA = await getPlayer(userA);
  const pB = await getPlayer(userB);
  assert(pA.coins === 500 && pB.coins === 900, "Multi-player concurrent operations isolate properly");

  /* =====================================================
     3. SETTLEMENT ENGINE & DOUBLE-SPEND TESTS
     ===================================================== */
  console.log("\n===== 3. SETTLEMENT ENGINE & DOUBLE-SPEND PREVENTION =====");

  // Test 3.1: Wager deduction
  const wagerRes = await settleWagerDeduction(testUserId, 50);
  assert(
    wagerRes.data.remainingCoins === 350 && wagerRes.player.coins === 350,
    "Wager deduction subtracted 50 coins atomically",
  );

  // Test 3.2: Concurrent double-spend prevention
  // Player currently has 350 coins. We launch 10 concurrent requests to deduct 100 coins each.
  // Exactly 3 should succeed (total 300 coins deducted, remaining 50), and 7 should fail with INSUFFICIENT_COINS.
  let successfulDeductions = 0;
  let blockedDeductions = 0;

  const doubleSpendTasks: Promise<any>[] = [];
  for (let i = 0; i < 10; i++) {
    doubleSpendTasks.push(
      settleWagerDeduction(testUserId, 100)
        .then(() => { successfulDeductions++; })
        .catch((err) => {
          if (err.message === "INSUFFICIENT_COINS") {
            blockedDeductions++;
          }
        }),
    );
  }

  await Promise.all(doubleSpendTasks);
  const playerAfterRace = await getPlayer(testUserId);
  assert(
    successfulDeductions === 3 && blockedDeductions === 7 && playerAfterRace.coins === 50,
    `Double-spend race prevented: 3 succeeded, 7 blocked, final coins ${playerAfterRace.coins} (expected 50)`,
  );

  // Test 3.3: Casino payout settlement
  const payoutRes = await settleCasinoPayout(testUserId, {
    game: "slots",
    wager: 50,
    payout: 200,
    won: true,
    xp: 30,
  });
  assert(
    payoutRes.player.coins === 250 && payoutRes.player.casinoWins === 1,
    "Casino payout adds winning coins and increments casino stats",
  );
  assert(
    payoutRes.data.net === 150 && payoutRes.player.streak === 1,
    "Casino settlement records correct net payout and winning streak",
  );

  // Test 3.4: Game result settlement
  const gameRes = await settleGameResult(testUserId, {
    result: "win",
    coinsReward: 50,
    xpReward: 100,
  });
  assert(
    gameRes.player.wins >= 1 && gameRes.player.coins === 300,
    "Game result settlement records win and adds rewards",
  );

  // Test 3.5: Daily settlement & Cooldown
  const dailyRes = await settleDailyClaim(testUserId, 100, 25);
  assert(
    dailyRes.data.streak === 1 && dailyRes.player.coins === 400,
    "Daily reward claim succeeds on first attempt",
  );

  let dailyCooldownBlocked = false;
  try {
    await settleDailyClaim(testUserId, 100, 25);
  } catch (err: any) {
    if (err.message.startsWith("DAILY_COOLDOWN")) {
      dailyCooldownBlocked = true;
    }
  }
  assert(dailyCooldownBlocked, "Daily reward blocked within 24-hour cooldown period");

  // Test 3.6: Exactly-Once Claim Settlement (Idempotency)
  const claimId = `dungeon_clear_${testUserId}_round1`;
  let claimExecutionCount = 0;

  const claimTask = () =>
    settleExactlyOnce(testUserId, claimId, (player) => {
      claimExecutionCount++;
      player.coins += 500;
      return { bonus: "Dungeon Master Trophy", rewardCoins: 500 };
    });

  // Launch 5 concurrent claims with the same claim ID
  const claimResults = await Promise.all([
    claimTask(),
    claimTask(),
    claimTask(),
    claimTask(),
    claimTask(),
  ]);

  const claimedPlayer = await getPlayer(testUserId);
  const firstClaim = claimResults.find((r) => !r.data.alreadyClaimed);
  const duplicateClaims = claimResults.filter((r) => r.data.alreadyClaimed);

  assert(
    claimExecutionCount === 1,
    `Exactly-once settlement handler executed exactly 1 time (got ${claimExecutionCount})`,
  );
  assert(
    firstClaim !== undefined && duplicateClaims.length === 4,
    "Exactly 1 initial claim succeeded and 4 duplicates recognized as already claimed",
  );
  assert(
    claimedPlayer.coins === 900,
    `Player received reward exactly once: coins = ${claimedPlayer.coins} (expected 900)`,
  );

  // Test 3.7: Inventory settlement
  const invRes = await settleInventoryChange(testUserId, "mystic_gem", 3);
  assert(
    invRes.player.inventory["mystic_gem"] === 3,
    "Inventory settlement added 3 mystic gems",
  );

  await settleInventoryChange(testUserId, "mystic_gem", -2);
  const invUpdated = await getPlayer(testUserId);
  assert(
    invUpdated.inventory["mystic_gem"] === 1,
    "Inventory settlement decremented item count to 1",
  );

  let invOverdrawBlocked = false;
  try {
    await settleInventoryChange(testUserId, "mystic_gem", -10);
  } catch (err: any) {
    if (err.message === "INSUFFICIENT_ITEM_QUANTITY") {
      invOverdrawBlocked = true;
    }
  }
  assert(invOverdrawBlocked, "Inventory overdraw correctly blocked");

  // Test 3.8: Equipment settlement
  const testEquip = {
    id: "sword_001",
    name: "Ashen Blade",
    slot: "weapon" as const,
    rarity: "rare" as const,
    attack: 20,
    defense: 5,
    hp: 0,
    luck: 2,
    equipped: false,
  };

  await settleEquipmentChange(testUserId, "add", testEquip);
  const equipAdded = await getPlayer(testUserId);
  assert(
    equipAdded.equipment.some((e) => e.id === "sword_001"),
    "Equipment added to player equipment list",
  );

  await settleEquipmentChange(testUserId, "equip", testEquip);
  const equippedPlayer = await getPlayer(testUserId);
  const sword = equippedPlayer.equipment.find((e) => e.id === "sword_001");
  assert(sword?.equipped === true, "Equipment item marked equipped");

  /* =====================================================
     SUMMARY
     ===================================================== */
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed === 0) {
    console.log("🎉 ALL CONCURRENCY & SETTLEMENT TESTS PASSED");
  } else {
    console.log("❌ SOME TESTS FAILED");
    process.exit(1);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

runTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
