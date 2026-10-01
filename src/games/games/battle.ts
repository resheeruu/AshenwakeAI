import { GamePlayer } from "../types";
import { mutatePlayer } from "../store";
import { applyAward } from "../rewards";

export interface BattleResult {
  outcome: "win" | "loss" | "draw";
  playerHp: number;
  enemyHp: number;
  playerAttack: number;
  enemyAttack: number;
  coinsEarned: number;
  xpEarned: number;
  levelUp: boolean;
  newAchievements: string[];
}

const BASE_COST = 15;

const ENEMY_NAMES = [
  "Shadow Creep", "Stone Golem", "Venom Spider",
  "Iron Fang", "Dark Moth", "Crystal Wraith",
  "Bone Knight", "Frost Lurker", "Ember Fox",
  "Toxic Bloom", "Rust Bat", "Mire Walker",
];

export async function playBattle(userId: string, username: string): Promise<BattleResult> {
  const { result } = await mutatePlayer(userId, async (player: GamePlayer) => {
    if (player.coins < BASE_COST) {
      throw new Error("NOT_ENOUGH_COINS");
    }

    player.coins -= BASE_COST;

    const playerAttack = Math.floor(Math.random() * 20) + player.level * 2 + 1;
    const enemyAttack = Math.floor(Math.random() * 20) + 5;
    const playerHp = 100 + player.level * 10;
    const enemyHp = 80 + Math.floor(Math.random() * 20);

    let pHp = playerHp;
    let eHp = enemyHp;

    while (pHp > 0 && eHp > 0) {
      eHp -= playerAttack;
      if (eHp <= 0) break;
      pHp -= enemyAttack;
      if (pHp <= 0) break;
    }

    const outcome: "win" | "loss" | "draw" =
      pHp > 0 && eHp <= 0 ? "win" :
      pHp <= 0 && eHp > 0 ? "loss" : "draw";

    const enemyName = ENEMY_NAMES[Math.floor(Math.random() * ENEMY_NAMES.length)];

    /*
     * applyAward is the store-safe award path: mutatePlayer already holds
     * the game-players-store lock and persists after the mutator returns.
     * The previous `awardResult` call re-acquired that non-reentrant lock
     * and every battle died with LOCK_TIMEOUT after 15s.
     */
    const award = applyAward(player, outcome);

    if (outcome === "win" && enemyHp > 60) {
      if (!player.achievements.includes("battle_elite")) {
        player.achievements.push("battle_elite");
        award.newAchievements.push("battle_elite");
      }
    }

    return {
      outcome,
      playerHp: pHp,
      enemyHp: eHp,
      playerAttack,
      enemyAttack,
      coinsEarned: award.coins,
      xpEarned: award.xp,
      levelUp: award.levelUp,
      newAchievements: award.newAchievements,
    };
  }, username);

  return result;
}

export function getEnemyNames(): string[] {
  return ENEMY_NAMES;
}