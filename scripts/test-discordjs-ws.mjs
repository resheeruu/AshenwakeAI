import { REST } from "discord.js";
import {
  WebSocketManager,
  WebSocketShardEvents,
} from "@discordjs/ws";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("❌ DISCORD_TOKEN is missing");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

console.log("🔎 Fetching Gateway information...");

const gateway = await rest.get("/gateway/bot");

console.log("✅ Gateway REST works.");
console.log("Gateway:", gateway.url);
console.log("Shards:", gateway.shards);

const manager = new WebSocketManager({
  token,
  intents:
    1 |       // Guilds
    512 |     // GuildMessages
    4096 |    // MessageContent
    32768 |   // GuildVoiceStates
    65536,   // DirectMessages
  rest,
});

manager.on(WebSocketShardEvents.Hello, ({ shardId }) => {
  console.log(`👋 HELLO shard=${shardId}`);
  console.log("✅ @discordjs/ws accepted HELLO.");
});

manager.on(WebSocketShardEvents.Ready, ({ shardId, data }) => {
  console.log("");
  console.log("=================================");
  console.log("🎉 @discordjs/ws READY!");
  console.log("=================================");
  console.log("Shard:", shardId);
  console.log("Bot:", data.user?.username);
  console.log("Bot ID:", data.user?.id);
  console.log("Guilds:", data.guilds?.length ?? 0);
  console.log("");

  process.exit(0);
});

manager.on(WebSocketShardEvents.Error, ({ shardId, error }) => {
  console.error(`❌ WS ERROR shard=${shardId}`);
  console.error(error.stack ?? error.message);
});

manager.on(WebSocketShardEvents.Closed, ({ shardId, code }) => {
  console.error(`🔴 WS CLOSED shard=${shardId} code=${code}`);
});

console.log("🔌 Calling WebSocketManager.connect()...");

const timeout = setTimeout(() => {
  console.error("❌ @discordjs/ws timed out after 30 seconds.");
  process.exit(1);
}, 30000);

try {
  await manager.connect();

  clearTimeout(timeout);

  console.log("✅ WebSocketManager.connect() completed.");
} catch (error) {
  clearTimeout(timeout);

  console.error("❌ @discordjs/ws failed:");

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
}
