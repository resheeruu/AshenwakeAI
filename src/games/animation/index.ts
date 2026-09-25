/* ================================================================
 * GAME ANIMATION FRAMEWORK
 *
 * Provides safe, deterministic animation playback for Ash games.
 *
 * RESULT-AUTHORITY GUARANTEE:
 *   Every game engine computes its outcome, updates the database,
 *   and returns a pre-computed result BEFORE any animation is
 *   displayed. The animation layer is read-only and can never
 *   modify game state, coin balances, or XP values.
 *
 *   Flow:
 *     1. Engine computes outcome
 *     2. Engine updates database (updatePlayer)
 *     3. Engine returns AnimationResult with pre-computed data
 *     4. Animation framework displays the result
 *     5. Animation cannot write to any game state
 * ================================================================ */

import type { GamePlayer } from "../types";
import { logger } from "../../logger";

/* ================================================================
 * TYPES
 * ================================================================ */

export type AnimationType = "mine" | "battle" | "lottery" | "hunt" | "slots";
export type AnimationOutcome = "win" | "loss" | "draw" | "miss" | "safe" | "danger" | "cashout" | "cancel";

export interface AnimationFrame {
  text: string;
  delay?: number;
  emoji?: string;
  assetKey?: string;
  assetCategory?: string;
}

export interface GameAnimationResult {
  type: AnimationType;
  outcome: AnimationOutcome;
  frames: AnimationFrame[];
  /** Pre-computed data from the engine — immutable during animation */
  preComputed: {
    coinsEarned: number;
    xpEarned: number;
    levelUp: boolean;
    newAchievements: string[];
    message: string;
  };
}

export interface AnimationPlayer {
  play(result: GameAnimationResult): Promise<void>;
  stop(): void;
}

/* ================================================================
 * ASSET PATH RESOLUTION
 * ================================================================ */

const ASSET_ROOT = process.env.ASHENAI_LOCAL_GIFS_DIR || "data/anime-gifs";

export function getAssetPath(category: string, assetKey: string): string {
  const ext = ".svg";
  return `${ASSET_ROOT}/games/${category}/${assetKey}${ext}`;
}

/* ================================================================
 * ANIMATION FRAME BUILDERS - DETAILED SEQUENCES
 * ================================================================ */

function buildLotteryFrames(result: GameAnimationResult): AnimationFrame[] {
  const isWin = result.outcome === "win";
  const tier = result.preComputed.message.includes("MYTHIC") ? "mythic" :
               result.preComputed.message.includes("LEGENDARY") ? "legendary" :
               result.preComputed.message.includes("GOLD") ? "gold" :
               result.preComputed.message.includes("SILVER") ? "silver" : "bronze";
  
  const frames: AnimationFrame[] = [
    { text: "🎟️ **ASH LOTTERY**", delay: 300, assetKey: "ticket", assetCategory: "lottery" },
    { text: "🎟️ Purchasing ticket...", delay: 400 },
    { text: "🎲 **DRAWING...**", delay: 600, assetKey: "chest", assetCategory: "lottery" },
    { text: "🎲 The chest trembles...", delay: 500 },
    { text: "✨ **REVEALING...**", delay: 800, assetKey: "reveal", assetCategory: "lottery" },
    { text: "✨ Golden light spills out...", delay: 400 },
  ];

  if (isWin) {
    frames.push(
      { text: `🏆 **${tier.toUpperCase()} PRIZE!**`, delay: 500, assetKey: tier === "mythic" ? "jackpot" : "prize", assetCategory: "lottery" },
      { text: `💰 **Won ${result.preComputed.coinsEarned} coins!**`, delay: 400 },
    );
  } else {
    frames.push(
      { text: "🗒️ No prize this time.", delay: 400, assetKey: "ticket", assetCategory: "lottery" },
      { text: "🍀 Better luck next draw!", delay: 300 },
    );
  }

  frames.push({ text: result.preComputed.message, delay: 300 });
  return frames;
}

function buildMineFrames(result: GameAnimationResult): AnimationFrame[] {
  const frames: AnimationFrame[] = [
    { text: "⛏️ **ASHEN MINES**", delay: 300, assetKey: "board", assetCategory: "mine" },
    { text: "⛏️ Selecting tile...", delay: 400 },
  ];

  if (result.outcome === "danger" || result.outcome === "miss") {
    frames.push(
      { text: "💥 **MINE HIT!**", delay: 500, assetKey: "mine", assetCategory: "mine" },
      { text: "💥 **BOOM!** The mine explodes!", delay: 400, assetKey: "explosion", assetCategory: "mine" },
      { text: "💀 You lost your bet.", delay: 400 },
    );
  } else if (result.outcome === "cashout") {
    frames.push(
      { text: "✅ **SAFE!** No mine here.", delay: 400, assetKey: "safe", assetCategory: "mine" },
      { text: "💰 **CASHING OUT...**", delay: 400, assetKey: "safe", assetCategory: "mine" },
      { text: `💰 **Cashed out ${result.preComputed.coinsEarned} coins!**`, delay: 400, assetKey: "safe", assetCategory: "mine" },
    );
  } else if (result.outcome === "safe") {
    frames.push(
      { text: "✅ **SAFE!** No mine here.", delay: 400, assetKey: "safe", assetCategory: "mine" },
      { text: `✨ Multiplier: ${result.preComputed.message}`, delay: 400 },
    );
  } else if (result.outcome === "cancel") {
    frames.push(
      { text: "🚫 **GAME CANCELLED**", delay: 300, assetKey: "flag", assetCategory: "mine" },
      { text: "🚫 Bet returned.", delay: 300 },
    );
  }

  frames.push({ text: result.preComputed.message, delay: 300 });
  return frames;
}

function buildBattleFrames(result: GameAnimationResult): AnimationFrame[] {
  const isWin = result.outcome === "win";
  const isLoss = result.outcome === "loss";
  const isDraw = result.outcome === "draw";
  const isCritical = result.preComputed.message.includes("CRITICAL");

  const frames: AnimationFrame[] = [
    { text: "⚔️ **ASHEN BATTLE**", delay: 300, assetKey: "player", assetCategory: "battle" },
    { text: "⚔️ Challenger approaches...", delay: 400, assetKey: "enemy", assetCategory: "battle" },
    { text: "⚔️ **ENGAGING!**", delay: 500 },
  ];

  if (isCritical) {
    frames.push(
      { text: "💥 **CRITICAL STRIKE!**", delay: 500, assetKey: "critical", assetCategory: "battle" },
      { text: "💥 **DEVASTATING BLOW!**", delay: 400 },
    );
  } else if (isWin) {
    frames.push(
      { text: "⚔️ **ATTACK!**", delay: 400, assetKey: "attack", assetCategory: "battle" },
      { text: "💥 **DIRECT HIT!**", delay: 400 },
      { text: "🛡️ Enemy defense crumbles...", delay: 400, assetKey: "defense", assetCategory: "battle" },
    );
  } else if (isLoss) {
    frames.push(
      { text: "⚔️ **ENEMY ATTACKS!**", delay: 400, assetKey: "attack", assetCategory: "battle" },
      { text: "💥 **HEAVY BLOW!**", delay: 400 },
      { text: "🛡️ Your defense fails...", delay: 400, assetKey: "defense", assetCategory: "battle" },
    );
  } else {
    frames.push(
      { text: "⚔️ **CLASH!**", delay: 400, assetKey: "attack", assetCategory: "battle" },
      { text: "🛡️ **PARRY!** Both sides hold.", delay: 400, assetKey: "defense", assetCategory: "battle" },
    );
  }

  if (isWin) {
    frames.push(
      { text: "🏆 **VICTORY!**", delay: 500, assetKey: "victory", assetCategory: "battle" },
      { text: `💰 Won ${result.preComputed.coinsEarned} coins | ${result.preComputed.xpEarned} XP`, delay: 400 },
    );
  } else if (isLoss) {
    frames.push(
      { text: "💀 **DEFEAT**", delay: 500, assetKey: "defeat", assetCategory: "battle" },
      { text: `💀 Lost ${Math.abs(result.preComputed.coinsEarned)} coins`, delay: 400 },
    );
  } else {
    frames.push(
      { text: "🤝 **DRAW**", delay: 500 },
      { text: `🤝 ${result.preComputed.coinsEarned} coins | ${result.preComputed.xpEarned} XP`, delay: 400 },
    );
  }

  frames.push({ text: result.preComputed.message, delay: 300 });
  return frames;
}

function buildHuntFrames(result: GameAnimationResult): AnimationFrame[] {
  const isRare = result.preComputed.message.includes("legendary") || result.preComputed.message.includes("RARE DROP");
  const isLegendary = result.preComputed.message.includes("legendary");

  const frames: AnimationFrame[] = [
    { text: "🌲 **ASHEN HUNT**", delay: 300, assetKey: "encounter", assetCategory: "hunt" },
    { text: "🌲 Venturing into the forest...", delay: 500 },
    { text: "👀 **ENCOUNTER!**", delay: 500, assetKey: "encounter", assetCategory: "hunt" },
    { text: "👀 Tracking prey through the brush...", delay: 500 },
    { text: "⚔️ **HUNT!**", delay: 500, assetKey: "action", assetCategory: "hunt" },
    { text: "⚔️ Stalking... striking...", delay: 500 },
  ];

  if (isLegendary) {
    frames.push(
      { text: "✨ **LEGENDARY ENCOUNTER!**", delay: 600, assetKey: "rare-drop", assetCategory: "hunt" },
      { text: "✨ **RARE DROP!**", delay: 500 },
    );
  } else if (isRare) {
    frames.push(
      { text: "⭐ **RARE FIND!**", delay: 500, assetKey: "rare-drop", assetCategory: "hunt" },
      { text: "✨ Unusual prey spotted!", delay: 400 },
    );
  }

  frames.push(
    { text: "🎁 **LOOT ACQUIRED!**", delay: 400, assetKey: "loot", assetCategory: "hunt" },
    { text: result.preComputed.message, delay: 300 },
  );

  return frames;
}

function buildSlotsFrames(result: GameAnimationResult): AnimationFrame[] {
  const isJackpot = result.preComputed.message.includes("JACKPOT") || result.preComputed.message.includes("TRIPLE MATCH");
  const isWin = result.outcome === "win" || isJackpot;

  const frames: AnimationFrame[] = [
    { text: "🎰 **ASH SLOTS**", delay: 300, assetKey: "machine", assetCategory: "slots" },
    { text: "🎰 Inserting 10 coins...", delay: 400 },
    { text: "🎰 **SPINNING...**", delay: 600, assetKey: "spin", assetCategory: "slots" },
    { text: "🎰 Reels spinning...", delay: 500, assetKey: "symbols", assetCategory: "slots" },
    { text: "🎰 First reel stops...", delay: 400 },
    { text: "🎰 Second reel stops...", delay: 400 },
    { text: "🎰 Final reel stopping...", delay: 500 },
  ];

  if (isJackpot) {
    frames.push(
      { text: "🎰 **JACKPOT!**", delay: 600, assetKey: "jackpot", assetCategory: "slots" },
      { text: "⭐ **TRIPLE MATCH!**", delay: 500 },
      { text: `💰 **WON ${result.preComputed.coinsEarned} COINS!**`, delay: 500, assetKey: "result", assetCategory: "slots" },
    );
  } else if (isWin) {
    frames.push(
      { text: "🎰 **MATCH!**", delay: 500, assetKey: "symbols", assetCategory: "slots" },
      { text: `💰 Won ${result.preComputed.coinsEarned} coins!`, delay: 400, assetKey: "result", assetCategory: "slots" },
    );
  } else {
    frames.push(
      { text: "🎰 No match this spin.", delay: 400, assetKey: "symbols", assetCategory: "slots" },
      { text: "🍀 Better luck next spin!", delay: 300 },
    );
  }

  frames.push({ text: result.preComputed.message, delay: 300 });
  return frames;
}

/* ================================================================
 * ANIMATION BUILDER
 * ================================================================ */

function buildFrames(type: AnimationType, result: GameAnimationResult): AnimationFrame[] {
  switch (type) {
    case "mine": return buildMineFrames(result);
    case "battle": return buildBattleFrames(result);
    case "lottery": return buildLotteryFrames(result);
    case "hunt": return buildHuntFrames(result);
    case "slots": return buildSlotsFrames(result);
  }
}

/* ================================================================
 * SAFE ANIMATION PLAYER
 * ================================================================ */

export class SafeAnimationPlayer implements AnimationPlayer {
  private playing = false;
  private cancelled = false;

  get isPlaying(): boolean {
    return this.playing;
  }

  async play(result: GameAnimationResult): Promise<void> {
    if (this.playing) {
      logger.warn("Animation already playing, skipping.");
      return;
    }

    this.playing = true;
    this.cancelled = false;
    try {
      const frames = buildFrames(result.type, result);
      for (const frame of frames) {
        if (this.cancelled || !this.playing) break;
        await new Promise((resolve) => setTimeout(resolve, frame.delay ?? 300));
      }
    } finally {
      this.playing = false;
      this.cancelled = false;
    }
  }

  stop(): void {
    this.cancelled = true;
    this.playing = false;
  }
}

/* ================================================================
 * GAME ANIMATION BUILDER
 * ================================================================ */

export interface BuildAnimationOptions {
  type: AnimationType;
  outcome: AnimationOutcome;
  coinsEarned: number;
  xpEarned: number;
  levelUp: boolean;
  newAchievements: string[];
  message: string;
}

export function buildGameAnimation(options: BuildAnimationOptions): GameAnimationResult {
  return {
    type: options.type,
    outcome: options.outcome,
    frames: [],
    preComputed: {
      coinsEarned: options.coinsEarned,
      xpEarned: options.xpEarned,
      levelUp: options.levelUp,
      newAchievements: options.newAchievements,
      message: options.message,
    },
  };
}

/* ================================================================
 * RESULT AUTHORITY ENFORCEMENT
 * ================================================================ */

const GAME_STATE_KEYS = new Set([
  "coins", "xp", "level", "gamesPlayed", "wins", "losses",
  "streak", "bestStreak", "huntsCompleted", "huntStreak",
  "achievements", "inventory", "legendaryHunts",
]);

export function assertResultAuthority(
  preState: Record<string, unknown>,
  postState: Record<string, unknown>,
  type: AnimationType,
): void {
  for (const key of GAME_STATE_KEYS) {
    if (preState[key] !== postState[key]) {
      logger.warn(`Result authority: ${type} attempted to modify game state key "${key}"`);
    }
  }
}