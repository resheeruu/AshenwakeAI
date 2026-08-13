import {
  REST,
  Routes,
} from "discord.js";

import { config } from "../config/env";
import { CommandBuilder } from "./definitions";

/*
 * Synchronize AshenAI slash commands to the configured guild.
 *
 * Guild commands are used during development because Discord
 * updates them much faster than global commands.
 *
 * We intentionally do NOT delete global commands on every
 * startup. That was an unnecessary API request and slowed
 * startup.
 */
export async function syncCommands(
  commands: CommandBuilder[],
): Promise<void> {
  if (!config.discord.guildId) {
    throw new Error(
      "DISCORD_GUILD_ID is required.",
    );
  }

  const rest = new REST({
    version: "10",
  }).setToken(
    config.discord.token,
  );

  const commandData = commands.map(
    (command) => command.toJSON(),
  );

  console.log(
    `⚡ Synchronizing ${commandData.length} guild slash commands...`,
  );

  await rest.put(
    Routes.applicationGuildCommands(
      config.discord.clientId,
      config.discord.guildId,
    ),
    {
      body: commandData,
    },
  );

  console.log(
    `✅ Guild commands synchronized: ${commandData.length}`,
  );
}
