import { GamePlayer } from "../types";
import { updatePlayer } from "../store";
import { applyLevelUp, updateAchievements, awardResult } from "../rewards";

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
const WIN_COINS = 30;
const LOSE_COINS = 5;
const DRAW_COINS = 10;
const WIN_XP = 25;
const LOSE_XP = 10;
const DRAW_XP = 15;

const ENEMY_NAMES = [
  "Shadow Creep", "Stone Golem", "Venom Spider",
  "Iron Fang", "Dark Moth", "Crystal Wraith",
  "Bone Knight", "Frost Lurker", "Ember Fox",
  "Toxic Bloom", "Rust Bat", "Mire Walker",
];

export async function playBattle(player: GamePlayer): Promise<BattleResult> {
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

  const result = await awardResult(player, outcome);

  const coinsEarned = outcome === "win" ? WIN_COINS : outcome === "loss" ? LOSE_COINS : DRAW_COINS;
  const xpEarned = outcome === "win" ? WIN_XP : outcome === "loss" ? LOSE_XP : DRAW_XP;

  player.gamesPlayed++;

  if (outcome === "win") {
    player.wins++;
    player.streak++;
    if (player.streak > player.bestStreak) {
      player.bestStreak = player.streak;
    }
  } else if (outcome === "loss") {
    player.losses++;
    player.streak = 0;
  } else {
    player.draws++;
  }

  if (outcome === "win" && enemyHp > 60) {
    if (!player.achievements.includes("battle_elite")) {
      player.achievements.push("battle_elite");
    }
  }

  updateAchievements(player);
  await updatePlayer(player);

  return {
    outcome,
    playerHp: pHp,
    enemyHp: eHp,
    playerAttack,
    enemyAttack,
    coinsEarned,
    xpEarned,
    levelUp: result.levelUp,
    newAchievements: result.newAchievements,
  };
}

export function getEnemyNames(): string[] {
  return ENEMY_NAMES;
}
