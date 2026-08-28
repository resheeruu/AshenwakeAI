import {
  REST,
  Routes,
} from "discord.js";

import { config } from "../config/env";
import { CommandBuilder } from "./definitions";

/*
 * Synchronize AshenAI slash commands globally.
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
  const rest = new REST({
    version: "10",
  }).setToken(
    config.discord.token,
  );

  const commandData = commands.map(
    (command) => command.toJSON(),
  );

  console.log(
    `⚡ Synchronizing ${commandData.length} global slash commands...`,
  );

  try {
    await rest.put(
      Routes.applicationCommands(
        config.discord.clientId,
      ),
      {
        body: commandData,
      },
    );

    console.log(
      `✅ Global commands synchronized: ${commandData.length}`,
    );
  } catch (error) {
    console.error("❌ Failed to synchronize global commands:", error);
    console.error("⚠️ Bot will continue with existing commands.");
  }
}
