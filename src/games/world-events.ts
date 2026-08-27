import { GamePlayer } from "./types";
import { AIRouter } from "../ai/router";
import { generateWorldEventNarration } from "./ai-narrator";

export type WorldEventType =
  | "boss_spawn"
  | "boss_defeat"
  | "rare_loot"
  | "level_milestone"
  | "new_player"
  | "season_start"
  | "season_end"
  | "guild_war"
  | "world_boss_participation"
  | "dungeon_completion";

export type WorldEvent = {
  id: string;
  type: WorldEventType;
  timestamp: number;
  playerId?: string;
  playerName?: string;
  data: Record<string, unknown>;
  narration?: string;
};

const recentEvents: WorldEvent[] = [];
const MAX_RECENT_EVENTS = 50;

let eventCounter = 0;

function generateEventId(): string {
  eventCounter++;
  return `event_${Date.now()}_${eventCounter}`;
}

export function recordWorldEvent(
  type: WorldEventType,
  player?: GamePlayer,
  data: Record<string, unknown> = {},
): WorldEvent {
  const event: WorldEvent = {
    id: generateEventId(),
    type,
    timestamp: Date.now(),
    playerId: player?.userId,
    playerName: player?.username,
    data,
  };

  recentEvents.unshift(event);

  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.pop();
  }

  return event;
}

export function getRecentWorldEvents(limit = 10): WorldEvent[] {
  return recentEvents.slice(0, limit);
}

export function shouldAnnounceEvent(type: WorldEventType): boolean {
  switch (type) {
    case "boss_spawn":
    case "boss_defeat":
    case "rare_loot":
    case "level_milestone":
    case "new_player":
    case "season_start":
    case "season_end":
      return true;
    default:
      return false;
  }
}

export function getEventEmoji(type: WorldEventType): string {
  switch (type) {
    case "boss_spawn": return "🚨";
    case "boss_defeat": return "🏆";
    case "rare_loot": return "🏆";
    case "level_milestone": return "⚡";
    case "new_player": return "🌑";
    case "season_start": return "🔥";
    case "season_end": return "❄️";
    case "guild_war": return "⚔️";
    case "world_boss_participation": return "🌍";
    case "dungeon_completion": return "🏰";
    default: return "✨";
  }
}

export function getEventTitle(type: WorldEventType): string {
  switch (type) {
    case "boss_spawn": return "WORLD BOSS SPAWNED";
    case "boss_defeat": return "WORLD EVENT";
    case "rare_loot": return "WORLD ANNOUNCEMENT";
    case "level_milestone": return "THE REALM HAS TAKEN NOTICE";
    case "new_player": return "A NEW SOUL HAS ENTERED ASHENWAKE";
    case "season_start": return "NEW SEASON BEGINS";
    case "season_end": return "SEASON CONCLUDES";
    case "guild_war": return "GUILD WAR";
    case "world_boss_participation": return "WORLD BOSS BATTLE";
    case "dungeon_completion": return "DUNGEON CONQUERED";
    default: return "WORLD EVENT";
  }
}

type AnnounceableEventType = "boss_spawn" | "boss_defeat" | "rare_loot" | "level_milestone" | "new_player";

export async function announceWorldEvent(
  router: AIRouter,
  event: WorldEvent,
): Promise<string | null> {
  if (!shouldAnnounceEvent(event.type)) {
    return null;
  }

  const announceType = event.type as AnnounceableEventType;

  const narration = await generateWorldEventNarration(router, announceType, {
    playerName: event.playerName,
    playerLevel: event.data.playerLevel as number,
    bossName: event.data.bossName as string,
    itemName: event.data.itemName as string,
    regionName: event.data.regionName as string,
  });

  event.narration = narration.text;

  const emoji = getEventEmoji(event.type);
  const title = getEventTitle(event.type);

  return `${emoji} **${title}**\n\n${narration.text}`;
}

export function checkLevelMilestone(level: number): boolean {
  const milestones = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100];
  return milestones.includes(level);
}

export function getWorldEventFeed(): string {
  const events = getRecentWorldEvents(5);

  if (events.length === 0) {
    return "No recent world events.";
  }

  return events
    .map((event) => {
      const emoji = getEventEmoji(event.type);
      const timeAgo = formatTimeAgo(event.timestamp);
      const playerText = event.playerName ? ` — ${event.playerName}` : "";
      return `${emoji} ${event.type.replace(/_/g, " ")}${playerText} (${timeAgo})`;
    })
    .join("\n");
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
