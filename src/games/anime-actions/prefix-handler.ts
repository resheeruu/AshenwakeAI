/* ================================================================
 * ANIME ACTION PREFIX HANDLER
 *
 * Parses "ash <action> @user" messages and dispatches to the
 * action engine. Integrates with the existing MessageCreate handler.
 * Supports: explicit mentions, reply-based targeting, raw IDs.
 * ================================================================ */

import type { Message, Client } from "discord.js";
import { UserRateLimiter } from "../../security/rate-limit";
import { logger } from "../../logger";
import { loadGuildConfig } from "../../core/guild-config";
import { getAction, getAllActions, getActionsByCategory, type ActionCategory } from "./definitions";
import { executeAction, buildDiscordResponse, type ActionResult } from "./engine";
import { animeEmote, type AnimeEmoteName } from "../../discord/anime-emotes";
import { getPlayer } from "../../games/store";
import { hunt } from "../../games/games/hunt";
import { playSlots } from "../../games/games/slots";
import { playBattle } from "../../games/games/battle";
import { playLottery } from "../../games/games/lottery";
import { startMines, getMinesGame, cashOutMines, cancelMines, revealMinesTile, MINES_MIN_BET, MINES_MAX_BET, MINES_GRID_SIZE, MINES_COUNT } from "../../games/games/mines";
import type { GamePlayer } from "../../games/types";

const PREFIX = "ash ";
const actionRateLimiter = new UserRateLimiter(15, 60_000);

/* ================================================================
 * PER-ACTION COOLDOWN TRACKING
 * ================================================================ */

const actionCooldowns = new Map<string, number>();

function checkCooldown(userId: string, actionName: string, cooldownMs: number): { allowed: boolean; retryAfterMs?: number } {
  const key = `${userId}:${actionName}`;
  const lastUsed = actionCooldowns.get(key) ?? 0;
  const now = Date.now();
  const elapsed = now - lastUsed;
  if (elapsed < cooldownMs) {
    return { allowed: false, retryAfterMs: cooldownMs - elapsed };
  }
  actionCooldowns.set(key, now);
  return { allowed: true };
}

const COOLDOWN_CLEANUP_INTERVAL = 5 * 60 * 1000;
const COOLDOWN_MAX_AGE = 60 * 60 * 1000;
const cooldownCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of actionCooldowns) {
    if (now - timestamp > COOLDOWN_MAX_AGE) {
      actionCooldowns.delete(key);
    }
  }
}, COOLDOWN_CLEANUP_INTERVAL);
cooldownCleanupTimer.unref();

/* ================================================================
 * HELP TEXT — dynamically derived from registry
 * ================================================================ */

const CATEGORY_META: Record<ActionCategory, { emoji: string; label: string }> = {
  affection: { emoji: "[affection]", label: "AFFECTION" },
  combat: { emoji: "[combat]", label: "COMBAT" },
  fun: { emoji: "[fun]", label: "FUN" },
};

function buildActionsHelp(): string {
  const lines: string[] = ["**ANIME ACTIONS**", ""];

  for (const category of ["affection", "combat", "fun"] as ActionCategory[]) {
    const meta = CATEGORY_META[category];
    const actions = getActionsByCategory(category);
    const names = actions.map((a) => `\`${a.name}\``).join(" \u2022 ");
    lines.push(`**${meta.label}**`);
    lines.push(names);
    lines.push("");
  }

  lines.push("**Usage:**");
  lines.push("  `ash <action> @user` — target a mentioned user");
  lines.push("  `ash <action>` — self-target (for actions that support it)");
  lines.push("  Reply to a message with `ash <action>` to target that user");
  lines.push("");
  lines.push("**Examples:**");
  lines.push("  `ash hug @friend` \u2022 `ash punch @rival` \u2022 `ash dance`");
  lines.push("  `ash cry` \u2022 `ash blush` \u2022 `ash celebrate`");
  lines.push("");
  lines.push("**Aliases:** `h`=hug, `pu`=punch, `hp`=headpat, `sl`=slap, `hf`=highfive");

  return lines.join("\n");
}

/* ================================================================
 * SAFE REPLIES
 *
 * Every reply echoes user-controlled text (action names, display
 * names), so suppress mention parsing entirely — a bot with
 * mention_everyone must never become a mass-ping tool because a
 * message contained "@everyone" as an argument.
 * ================================================================ */

export async function safeReply(
  message: Message,
  content: string | { content?: string; files?: unknown },
): Promise<void> {
  const payload = typeof content === "string" ? { content } : { ...content };
  await message
    .reply({ ...payload, allowedMentions: { parse: [] } } as never)
    .catch(() => {});
}

/* ================================================================
 * TARGET RESOLUTION
 * ================================================================ */

export interface TargetResolution {
  id: string | null;
  /** true when the message clearly tried to name a target */
  explicit: boolean;
  /** false when an explicitly named target could not be resolved */
  resolvable: boolean;
}

async function resolveTarget(
  message: Message,
  parts: string[],
): Promise<TargetResolution> {
  // 1. Explicit Discord mention (already resolved by Discord itself)
  if (message.mentions.users.size > 0) {
    const mentioned = message.mentions.users.first();
    if (mentioned) return { id: mentioned.id, explicit: true, resolvable: true };
  }

  // 2. Reply-based targeting — a reply names its author, INCLUDING
  //    replies to your own message (self-target semantics are then
  //    enforced by the self/bot guards below, so forbidden actions
  //    reject with the correct message instead of a usage error).
  if (message.reference?.messageId) {
    const referenceId = message.reference.messageId;
    const cached = message.channel.messages.cache.get(referenceId);

    if (cached) {
      return { id: cached.author.id, explicit: true, resolvable: true };
    } else {
      /*
       * Not in cache — fetch it from Discord so the documented
       * "reply to a message with `ash <action>`" flow works reliably.
       */
      try {
        const referenced = await message.fetchReference();
        return { id: referenced.author.id, explicit: true, resolvable: true };
      } catch {
        // Deleted or inaccessible referenced message — fall through.
      }
    }
  }

  // 3. Raw Discord user ID — but only if it actually resolves.
  if (parts[1]) {
    const idMatch = parts[1].match(/^<?@?!?(\d{17,20})>?$/);
    const rawId = idMatch ? idMatch[1] : /^\d{17,20}$/.test(parts[1]) ? parts[1] : null;
    if (rawId) {
      if (message.guild) {
        const member = await message.guild.members.fetch(rawId).catch(() => null);
        if (!member) {
          return { id: null, explicit: true, resolvable: false };
        }
      }
      return { id: rawId, explicit: true, resolvable: true };
    }
    /*
     * Token looks like a target attempt (@user, malformed <@id>,
     * partial digits) but parsed to nothing usable. Fail CLOSED:
     * reject instead of silently falling back to self-targeting.
     */
    if (/^@|^<@|^\d{10,}$/.test(parts[1])) {
      return { id: null, explicit: true, resolvable: false };
    }
  }

  return { id: null, explicit: false, resolvable: true };
}

/* ================================================================
 * PREFIX COMMAND PARSER
 * ================================================================ */

export function isAnimeActionPrefix(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  return trimmed === "ash" || trimmed.startsWith("ash ");
}

const GAME_NAMES = ["mine", "battle", "lottery", "hunt", "slots"] as const;
export type GameCommandName = (typeof GAME_NAMES)[number];

const GAME_HELP =
  "**GAMES**\n\n" +
  "`ash mine [bet]` — play Ashen Mines\n" +
  "`ash battle` — fight a foe\n" +
  "`ash lottery` — buy a lottery ticket\n" +
  "`ash hunt` — go hunting\n" +
  "`ash slots` — spin the reels\n\n" +
  "Examples: `ash mine 50` • `ash battle` • `ash lottery` • `ash hunt` • `ash slots`";

function isGameCommand(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  if (!trimmed.startsWith("ash ")) return false;
  const afterPrefix = trimmed.slice(4).trim();
  if (!afterPrefix) return false;
  const cmd = afterPrefix.split(/\s+/)[0];
  return GAME_NAMES.includes(cmd as GameCommandName);
}

async function handleGameCommand(
  message: Message,
  client: Client,
): Promise<boolean> {
  const { game, rest } = await parseGameCommand(message.content);
  const authorId = message.author.id;
  const botId = client.user?.id ?? "";

  const player = await getPlayer(authorId, message.author.username);

  switch (game) {
    case "mine": {
      const subcmd = rest[0];
      if (subcmd === "cancel") {
        const existing = getMinesGame(player.userId);
        if (!existing) {
          await safeReply(message, "💣 No active Mines game to cancel.");
          return true;
        }
        cancelMines(player.userId);
        await safeReply(message, "💣 Mines game cancelled.");
        return true;
      }

      if (subcmd === "reveal") {
        const existing = getMinesGame(player.userId);
        if (!existing) {
          await safeReply(message, "💣 No active Mines game. Type `ash mine <bet>` to start.");
          return true;
        }
        const tileStr = rest[1];
        if (!tileStr || !Number.isInteger(Number(tileStr))) {
          await safeReply(message, "💣 Usage: `ash mine reveal <tile>`");
          return true;
        }
        const tile = Number(tileStr);
        if (tile < 0 || tile >= MINES_GRID_SIZE) {
          await safeReply(message, `💣 Tile must be 0-${MINES_GRID_SIZE - 1}.`);
          return true;
        }
        try {
          const result = await revealMinesTile(player, existing, tile);
          if (result.mine) {
            await safeReply(message, `💣 💥 MINE! Game over. You lost your ${existing.bet} coins.`);
          } else {
            await safeReply(
              message,
              `💣 Revealed tile ${tile}. No mine!\nMultiplier: ${existing.multiplier.toFixed(2)}x\nType \`ash mine cashout\` to cash out or \`ash mine reveal <tile>\` to continue.`,
            );
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          await safeReply(message, `💣 ${msg}`);
        }
        return true;
      }

      if (subcmd === "cashout") {
        const existing = getMinesGame(player.userId);
        if (!existing) {
          await safeReply(message, "💣 No active Mines game. Type `ash mine <bet>` to start.");
          return true;
        }
        try {
          const result = await cashOutMines(player, existing);
          await safeReply(
            message,
            `💣 **Cashed out!**\n\nMultiplier: **${existing.multiplier.toFixed(2)}x**\nPayout: ${result.payout} coins\nXP: ${result.xp}\n${result.levelUp ? "🎊 Level Up!" : ""}`,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          await safeReply(message, `💣 ${msg}`);
        }
        return true;
      }

      let bet = 50;
      if (subcmd) {
        const parsed = Number(subcmd);
        if (!Number.isInteger(parsed) || parsed < MINES_MIN_BET || parsed > MINES_MAX_BET) {
          await safeReply(message, `Mines bet must be between ${MINES_MIN_BET} and ${MINES_MAX_BET} coins.`);
          return true;
        }
        bet = parsed;
      }
      try {
        if (getMinesGame(player.userId)) {
          await safeReply(message, "💣 You already have an active Mines game. Type `ash mine cancel` to abort.");
          return true;
        }
        const started = await startMines(player, bet);
        await safeReply(
          message,
          `💣 **Ashen Mines** started!\n\nBet: **${bet} coins**\nGrid: ${MINES_GRID_SIZE} tiles, ${MINES_COUNT} mines\nType \`ash mine reveal <tile>\` to reveal, \`ash mine cashout\` to cash out.\n\nFirst 3 tiles revealed automatically are safe!`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg === "NOT_ENOUGH_COINS") {
          await safeReply(message, "💣 Not enough coins to play Mines.");
        } else if (msg === "MINES_ALREADY_ACTIVE") {
          await safeReply(message, "💣 You already have an active Mines game.");
        } else {
          await safeReply(message, `💣 ${msg}`);
        }
      }
      return true;
    }

    case "battle": {
      try {
        const result = await playBattle(player);
        const emoji = result.outcome === "win" ? "⚔️ Victory" : result.outcome === "loss" ? "💀 Defeated" : "🤝 Draw";
        await safeReply(
          message,
          `${emoji} **Battle Result**\n\nOutcome: **${result.outcome}**\nCoins: ${result.coinsEarned} | XP: ${result.xpEarned}\n${result.levelUp ? "🎊 Level Up!" : ""}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg === "NOT_ENOUGH_COINS") {
          await safeReply(message, "⚔️ Not enough coins to battle (cost: 15 coins).");
        } else {
          await safeReply(message, `⚔️ ${msg}`);
        }
      }
      return true;
    }

    case "lottery": {
      try {
        const result = await playLottery(player);
        const emoji = result.won ? "🎉" : "🗒️";
        await safeReply(
          message,
          `${emoji} **Lottery Result**\n\nTier: **${result.tier.toUpperCase()}**\n${result.won ? `Won: **${result.coinsWon} coins**` : "No prize this time."}\n${result.levelUp ? "🎊 Level Up!" : ""}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg === "NOT_ENOUGH_COINS") {
          await safeReply(message, "🗒️ Not enough coins to buy a lottery ticket (cost: 20 coins).");
        } else {
          await safeReply(message, `🗒️ ${msg}`);
        }
      }
      return true;
    }

    case "hunt": {
      try {
        const result = await hunt(player);
        const emoji = result.rarity === "legendary" ? "👑" : result.rarity === "rare" ? "⭐" : "🎯";
        await safeReply(
          message,
          `${emoji} **Hunt Result**\n\n${result.title}\n${result.description}\nCoins: ${result.coins} | XP: ${result.xp}\nRarity: **${result.rarity}**\nStreak: ${result.streak} | Hunts: ${result.huntsCompleted}\n${result.levelUp ? "🎊 Level Up!" : ""}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.startsWith("HUNT_COOLDOWN")) {
          const remaining = Math.ceil(parseInt(msg.split(":")[1]) / 1000);
          await safeReply(message, `🎯 Hunting cooldown active. Try again in ${remaining}s.`);
        } else {
          await safeReply(message, `🎯 ${msg}`);
        }
      }
      return true;
    }

    case "slots": {
      try {
        const result = await playSlots(player);
        await safeReply(
          message,
          `🎰 **Slots Result**\n\n${result.message}\nCoins won: **${result.coinsWon}** | XP: ${result.xp}\n${result.levelUp ? "🎊 Level Up!" : ""}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg === "NOT_ENOUGH_COINS") {
          await safeReply(message, "🎰 Not enough coins to play Slots (cost: 10 coins).");
        } else {
          await safeReply(message, `🎰 ${msg}`);
        }
      }
      return true;
    }

    default:
      return false;
  }
}

async function parseGameCommand(content: string): Promise<{ game: GameCommandName; rest: string[] }> {
  const trimmed = content.trim().toLowerCase();
  const afterPrefix = trimmed.slice(4).trim();
  const parts = afterPrefix.split(/\s+/);
  const game = parts[0] as GameCommandName;
  return { game, rest: parts.slice(1) };
}

/**
 * Test seam for the guild feature-flag read and the action engine.
 * Production always uses loadGuildConfig / executeAction (the
 * defaults below); tests inject deterministic implementations to
 * prove flag/cooldown/concurrency behavior and isolate the handler
 * from provider network calls, without module patching.
 */
export interface AnimeActionDeps {
  loadConfig?: (guildId: string) => { social?: { animeActions?: boolean } } | undefined;
  runAction?: (
    actionName: string,
    message: Message,
    targetId: string | null,
    botId: string,
  ) => Promise<ActionResult | null>;
}

export async function handleAnimeAction(
  message: Message,
  client: Client,
  deps: AnimeActionDeps = {},
): Promise<boolean> {
  const content = message.content.trim();
  if (!isAnimeActionPrefix(content)) return false;

  if (isGameCommand(content)) {
    return handleGameCommand(message, client);
  }

  const rateLimit = actionRateLimiter.check(message.author.id);
  if (!rateLimit.allowed) {
    const retrySeconds = Math.ceil((rateLimit.retryAfterMs ?? 1000) / 1000);
    await safeReply(message, `Slow down! Try again in ${retrySeconds}s.`);
    return true;
  }

  /*
   * P2-3 — guild feature flag (social.animeActions, default ON).
   * Checked BEFORE any cooldown is consumed or any provider/media
   * work happens. DMs have no guild config and stay enabled. Config
   * read failures fail CLOSED (feature off) rather than ignoring
   * an admin's decision.
   */
  if (message.guildId) {
    let enabled = true;
    try {
      const loadConfig = deps.loadConfig ?? loadGuildConfig;
      const cfg = loadConfig(message.guildId);
      /*
       * Posture: only an explicit boolean `true` enables the feature
       * when a flag value is present. `false` denies; `undefined` or
       * `null` (no flag stored) falls back to the documented default
       * (enabled); ANY other value is a corrupt configuration and
       * fails CLOSED. A thrown read also fails CLOSED (below).
       */
      const flag = cfg?.social?.animeActions;
      enabled = flag === undefined || flag === null ? true : flag === true;
    } catch (error) {
      logger.warn(
        `Anime actions config read failed for guild ${message.guildId}: ${error instanceof Error ? error.message : String(error)} — failing closed`,
      );
      enabled = false;
    }
    if (!enabled) {
      await safeReply(
        message,
        "🚫 Anime actions are disabled in this server. A server admin can enable them in `/settings panel` (AI Social \u2192 Anime Actions) or with `/settings update social animeActions true`.",
      );
      return true;
    }
  }

  const afterPrefix = content.slice(3).trim();
  if (!afterPrefix) {
    await safeReply(message, buildActionsHelp());
    return true;
  }

  if (afterPrefix.toLowerCase() === "actions") {
    await safeReply(message, buildActionsHelp());
    return true;
  }

  const parts = afterPrefix.split(/\s+/);
  const actionName = parts[0]?.toLowerCase();
  if (!actionName) {
    await safeReply(message, buildActionsHelp());
    return true;
  }

  const action = getAction(actionName);
  if (!action) {
    await safeReply(
      message,
      `Unknown action: \`${actionName}\`. Type \`ash actions\` to see available actions.`,
    );
    return true;
  }

  const cooldown = checkCooldown(message.author.id, action.name, action.cooldownMs);
  if (!cooldown.allowed) {
    const retrySeconds = Math.ceil((cooldown.retryAfterMs ?? 1000) / 1000);
    const emoteStr = action.emoteName
      ? animeEmote(action.emoteName as AnimeEmoteName)
      : action.emoji;
    await safeReply(
      message,
      `${emoteStr} \`${action.name}\` is on cooldown. Try again in ${retrySeconds}s.`,
    );
    return true;
  }

  const botId = client.user?.id ?? "";
  const resolution = await resolveTarget(message, parts);

  /*
   * Fail closed: the message clearly named a target but it could
   * not be resolved (nonexistent member, malformed mention, garbage
   * after the action). Reject with guidance instead of silently
   * falling back to self-targeting.
   */
  if (resolution.explicit && !resolution.resolvable) {
    const emoteStr = action.emoteName
      ? animeEmote(action.emoteName as AnimeEmoteName)
      : action.emoji;
    await safeReply(
      message,
      `${emoteStr} I can't find that user here — mention them directly or reply to their message.`,
    );
    return true;
  }

  let targetId = resolution.id;

  if (action.targetRequired && !targetId) {
    const emoteStr = action.emoteName
      ? animeEmote(action.emoteName as AnimeEmoteName)
      : action.emoji;
    await safeReply(
      message,
      `${emoteStr} Who should ${actionName}? Usage: \`ash ${actionName} @user\``,
    );
    return true;
  }

  /*
   * Optional-target actions with no target supplied: default to the
   * author (self-target) ONLY when the action allows self-targeting.
   * Actions that forbid self-target (e.g. `wave`) execute targetless
   * instead — `targetRequired: false` must stay honorable, and a bare
   * invocation must never be mislabeled as a self-target attempt.
   */
  if (!action.targetRequired && !targetId && action.selfTargetAllowed) {
    targetId = message.author.id;
  }

  if (targetId === message.author.id && !action.selfTargetAllowed) {
    const emoteStr = action.emoteName
      ? animeEmote(action.emoteName as AnimeEmoteName)
      : action.emoji;
    await safeReply(message, `${emoteStr} You can't use \`${actionName}\` on yourself!`);
    return true;
  }

  if (targetId === botId && !action.botTargetAllowed) {
    const emoteStr = action.emoteName
      ? animeEmote(action.emoteName as AnimeEmoteName)
      : action.emoji;
    await safeReply(message, `${emoteStr} AshenAI refuses to be a target for that!`);
    return true;
  }

  const runner = deps.runAction ?? executeAction;
  const result = await runner(action.name, message, targetId, botId);
  if (!result) {
    await safeReply(message, `Unknown action: \`${actionName}\`.`);
    return true;
  }

  try {
    const response = await buildDiscordResponse(result);
    await safeReply(message, response);
  } catch (error) {
    logger.warn(`Anime action failed: ${error instanceof Error ? error.message : String(error)}`);
    await safeReply(message, result.text);
  }

  return true;
}
