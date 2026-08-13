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

async function check() {
  const commands = (await rest.get(
    Routes.applicationGuildCommands(clientId, guildId)
  )) as any[];

  console.log(`Found ${commands.length} guild commands:\n`);

  for (const command of commands) {
    console.log(
      `ID: ${command.id}\n` +
      `Name: /${command.name}\n` +
      `Description: ${command.description}\n` +
      `---`
    );
  }
}

check().catch((error) => {
  console.error("❌ Check failed:", error);
  process.exit(1);
});
