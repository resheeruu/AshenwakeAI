import { Client } from "discord.js";
import { logger } from "../logger";

/* ================================================================
 * DISCORD SHARD HEALTH OBSERVABILITY
 *
 * Tracks gateway health metrics: reconnect count, latency, shard
 * state, consecutive reconnects, and last disconnect reason.
 *
 * Does NOT create a second Discord connection manager.
 * Does NOT override discord.js internal reconnection.
 * Simply observes and reports state for the status system.
 * ================================================================ */

export interface ShardInfo {
  id: number;
  status: string;
  ping: number;
  lastPingTimestamp: number;
  heartbeatAgeMs: number | null;
}

export interface DiscordHealthSnapshot {
  ready: boolean;
  readyAt: number;
  uptime: number;
  shardCount: number;
  shards: ShardInfo[];
  reconnectCount: number;
  consecutiveReconnectCount: number;
  lastReconnectAt: number;
  lastDisconnectReason: string;
  lastDisconnectCode: number | null;
  gatewayLatency: number;
  sessionInvalidated: boolean;
}

let client: Client | null = null;
let readyAt = 0;
let reconnectCount = 0;
let consecutiveReconnectCount = 0;
let lastReconnectAt = 0;
let lastDisconnectReason = "";
let lastDisconnectCode: number | null = null;
let sessionInvalidated = false;
let reconnectStartAt = 0;

export function initDiscordHealth(discordClient: Client): void {
  client = discordClient;

  discordClient.once("ready", () => {
    readyAt = Date.now();
  });

  discordClient.on("shardReconnecting", (shardId) => {
    if (reconnectStartAt === 0) {
      reconnectStartAt = Date.now();
    }
    consecutiveReconnectCount++;
    reconnectCount++;
    lastReconnectAt = Date.now();
    logger.debug(`[DiscordHealth] shard=${shardId} reconnecting (consecutive=${consecutiveReconnectCount})`);
  });

  discordClient.on("shardReady", (shardId) => {
    if (reconnectStartAt > 0) {
      const duration = Date.now() - reconnectStartAt;
      logger.info(`[DiscordHealth] shard=${shardId} ready after reconnect (${duration}ms)`);
      reconnectStartAt = 0;
    }
    consecutiveReconnectCount = 0;
  });

  discordClient.on("shardDisconnect", (event, shardId) => {
    lastDisconnectCode = event.code;
    lastDisconnectReason = event.reason || `code=${event.code}`;
    logger.debug(`[DiscordHealth] shard=${shardId} disconnected: ${lastDisconnectReason}`);
  });

  discordClient.on("invalidated", () => {
    sessionInvalidated = true;
    logger.warn("[DiscordHealth] session invalidated");
  });

  logger.info("[DiscordHealth] shard observability initialized");
}

export function getDiscordHealth(): DiscordHealthSnapshot {
  if (!client) {
    return {
      ready: false,
      readyAt: 0,
      uptime: 0,
      shardCount: 0,
      shards: [],
      reconnectCount: 0,
      consecutiveReconnectCount: 0,
      lastReconnectAt: 0,
      lastDisconnectReason: "",
      lastDisconnectCode: null,
      gatewayLatency: -1,
      sessionInvalidated: false,
    };
  }

  const shards: ShardInfo[] = [];

  if (client.ws && client.ws.shards) {
    for (const [id, shard] of client.ws.shards) {
      const lastPing = shard.lastPingTimestamp;
      const heartbeatAgeMs = lastPing > 0 ? Date.now() - lastPing : null;

      shards.push({
        id,
        status: String(shard.status),
        ping: shard.ping,
        lastPingTimestamp: lastPing,
        heartbeatAgeMs,
      });
    }
  }

  return {
    ready: client.isReady(),
    readyAt,
    uptime: readyAt > 0 ? Date.now() - readyAt : 0,
    shardCount: client.ws?.shards?.size ?? 0,
    shards,
    reconnectCount,
    consecutiveReconnectCount,
    lastReconnectAt,
    lastDisconnectReason,
    lastDisconnectCode,
    gatewayLatency: client.ws?.ping ?? -1,
    sessionInvalidated,
  };
}
