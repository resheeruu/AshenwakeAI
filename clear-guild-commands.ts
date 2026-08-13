import "dotenv/config";
import { REST, Routes } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  throw new Error(
    "DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID is missing."
  );
}

const rest = new REST({ version: "10" }).setToken(token);

async function clearCommands() {
  await rest.put(
    Routes.applicationGuildCommands(
      clientId,
      guildId
    ),
    { body: [] }
  );

  console.log("🧹 All guild slash commands removed.");
}

clearCommands().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});
