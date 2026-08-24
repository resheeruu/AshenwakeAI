import { REST, Routes } from "discord.js";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("❌ DISCORD_TOKEN is missing");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

console.log("🔎 Testing Discord REST Gateway information...");
console.time("gateway-info");

try {
  const info = await rest.get(Routes.gatewayBot());

  console.timeEnd("gateway-info");

  console.log("✅ Gateway information received.");
  console.log("URL:", info.url);
  console.log("Shards:", info.shards);
  console.log("Session start limit:", info.session_start_limit);
} catch (error) {
  console.timeEnd("gateway-info");

  console.error("❌ Gateway information request failed.");

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
}
