import WebSocket from "ws";

const url = "wss://gateway.discord.gg/?v=10&encoding=json";

console.log("🔌 RENDER DISCORD WEBSOCKET TEST");
console.log("URL:", url);

const ws = new WebSocket(url, {
  handshakeTimeout: 15000,
});

const timer = setTimeout(() => {
  console.log("❌ WebSocket timed out after 20 seconds");
  ws.terminate();
  process.exit(2);
}, 20000);

ws.on("open", () => {
  console.log("✅ WebSocket OPEN");
});

ws.on("message", (data) => {
  console.log("📨 Gateway message:");
  console.log(data.toString().slice(0, 1000));

  clearTimeout(timer);
  ws.close();
});

ws.on("close", (code, reason) => {
  clearTimeout(timer);
  console.log(
    `🔌 WebSocket CLOSED: code=${code} reason=${reason.toString()}`
  );
  process.exit(0);
});

ws.on("error", (error) => {
  clearTimeout(timer);
  console.log("❌ WebSocket ERROR:", error.message);
});
