"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var discord_health_exports = {};
__export(discord_health_exports, {
  getDiscordHealth: () => getDiscordHealth,
  initDiscordHealth: () => initDiscordHealth
});
module.exports = __toCommonJS(discord_health_exports);
var import_logger = require("../logger");
let client = null;
let readyAt = 0;
let reconnectCount = 0;
let consecutiveReconnectCount = 0;
let lastReconnectAt = 0;
let lastDisconnectReason = "";
let lastDisconnectCode = null;
let sessionInvalidated = false;
let reconnectStartAt = 0;
function initDiscordHealth(discordClient) {
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
    import_logger.logger.debug(`[DiscordHealth] shard=${shardId} reconnecting (consecutive=${consecutiveReconnectCount})`);
  });
  discordClient.on("shardReady", (shardId) => {
    if (reconnectStartAt > 0) {
      const duration = Date.now() - reconnectStartAt;
      import_logger.logger.info(`[DiscordHealth] shard=${shardId} ready after reconnect (${duration}ms)`);
      reconnectStartAt = 0;
    }
    consecutiveReconnectCount = 0;
  });
  discordClient.on("shardDisconnect", (event, shardId) => {
    lastDisconnectCode = event.code;
    lastDisconnectReason = event.reason || `code=${event.code}`;
    import_logger.logger.debug(`[DiscordHealth] shard=${shardId} disconnected: ${lastDisconnectReason}`);
  });
  discordClient.on("invalidated", () => {
    sessionInvalidated = true;
    import_logger.logger.warn("[DiscordHealth] session invalidated");
  });
  import_logger.logger.info("[DiscordHealth] shard observability initialized");
}
function getDiscordHealth() {
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
      sessionInvalidated: false
    };
  }
  const shards = [];
  if (client.ws && client.ws.shards) {
    for (const [id, shard] of client.ws.shards) {
      const lastPing = shard.lastPingTimestamp;
      const heartbeatAgeMs = lastPing > 0 ? Date.now() - lastPing : null;
      shards.push({
        id,
        status: String(shard.status),
        ping: shard.ping,
        lastPingTimestamp: lastPing,
        heartbeatAgeMs
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
    sessionInvalidated
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getDiscordHealth,
  initDiscordHealth
});
