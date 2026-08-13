import "dotenv/config";
import { REST, Routes } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  throw new Error(
    "DISCORD_TOKEN or DISCORD_CLIENT_ID is missing."
  );
}

const rest = new REST({ version: "10" })
  .setToken(token);

async function cleanup() {
  const globalCommands =
    (await rest.get(
      Routes.applicationCommands(clientId)
    )) as any[];

  console.log(
    `Found ${globalCommands.length} global commands.`
  );

  for (const command of globalCommands) {
    console.log(
      `Deleting global /${command.name} (${command.id})...`
    );

    await rest.delete(
      Routes.applicationCommand(
        clientId,
        command.id
      )
    );
  }

  console.log(
    "✅ Global commands completely cleaned."
  );
}

cleanup().catch((error) => {
  console.error("❌ Cleanup failed:", error);
  process.exit(1);
});
