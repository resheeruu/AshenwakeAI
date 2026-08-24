import WebSocket from "ws";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

const url = "wss://gateway.discord.gg/?v=10&encoding=json";

console.log("🔌 Connecting directly to Discord Gateway...");
console.log("🌐", url);

const ws = new WebSocket(url, {
  handshakeTimeout: 15000,
});

let heartbeatTimer;
let finished = false;

const timeout = setTimeout(() => {
  if (finished) return;

  console.error("❌ Gateway test timed out after 30 seconds.");
  ws.close();
  process.exit(1);
}, 30000);

function stop(code = 0) {
  if (finished) return;

  finished = true;
  clearTimeout(timeout);

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  try {
    ws.close();
  } catch {}

  process.exit(code);
}

ws.on("open", () => {
  console.log("✅ WebSocket connected.");
});

ws.on("message", (raw) => {
  let packet;

  try {
    packet = JSON.parse(raw.toString());
  } catch {
    console.error("❌ Invalid JSON received from Discord.");
    return;
  }

  console.log(`📨 Discord opcode=${packet.op}`);

  // Discord HELLO
  if (packet.op === 10) {
    const interval = packet.d?.heartbeat_interval;

    console.log("👋 Discord HELLO received.");
    console.log("💓 Heartbeat interval:", interval);

    const intents =
      1 |
      512 |
      4096 |
      32768 |
      65536;

    const identify = {
      op: 2,
      d: {
        token,
        intents,
        properties: {
          os: "linux",
          browser: "AshenAI",
          device: "AshenAI",
        },
      },
    };

    console.log("🔐 Sending IDENTIFY...");
    ws.send(JSON.stringify(identify));

    if (interval) {
      heartbeatTimer = setInterval(() => {
        console.log("💓 Sending heartbeat...");

        ws.send(
          JSON.stringify({
            op: 1,
            d: null,
          }),
        );
      }, interval);
    }
  }

  // Heartbeat ACK
  if (packet.op === 11) {
    console.log("💚 Heartbeat ACK received.");
  }

  // Dispatch event
  if (packet.op === 0) {
    console.log(`📦 DISPATCH: ${packet.t}`);

    if (packet.t === "READY") {
      console.log("");
      console.log("=================================");
      console.log("🎉 DISCORD BOT READY!");
      console.log("=================================");
      console.log("Bot:", packet.d?.user?.username);
      console.log("Bot ID:", packet.d?.user?.id);
      console.log("Guilds:", packet.d?.guilds?.length ?? 0);
      console.log("");

      stop(0);
    }
  }

  // Invalid session
  if (packet.op === 9) {
    console.error("❌ Discord returned INVALID SESSION.");
    console.error("Resumable:", packet.d);

    stop(1);
  }
});

ws.on("close", (code, reason) => {
  if (finished) return;

  console.log(
    `🔴 Gateway closed: code=${code} reason=${reason?.toString() || "none"}`,
  );

  stop(1);
});

ws.on("error", (error) => {
  console.error("❌ WebSocket error:", error.message);
});
