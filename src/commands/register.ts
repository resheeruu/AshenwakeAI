import {
  REST,
  Routes,
} from "discord.js";

import { config } from "../config/env";
import { CommandBuilder } from "./definitions";
import { logger } from "../logger";

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

  logger.info(
    `Synchronizing ${commandData.length} global slash commands...`,
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

    logger.info(
      `Global commands synchronized: ${commandData.length}`,
    );
  } catch (error) {
    logger.error("Failed to synchronize global commands:", error instanceof Error ? error.message : String(error));
    logger.warn("Bot will continue with existing commands.");
  }
}
