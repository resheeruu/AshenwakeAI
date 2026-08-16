import {
  ChatInputCommandInteraction,
} from "discord.js";

import { AshenCommand } from "./definitions";
import { logger } from "../logger";
import { UsageStats } from "../analytics/usage-stats";

const ACTIVITY_INTERVAL_MS = 5 * 60 * 1000;

export class CommandHandler {
  private readonly commands = new Map<string, AshenCommand>();
  private readonly activity = new Map<string, number>();
  private readonly usageStats: UsageStats;

  private activityTimer: ReturnType<typeof setInterval>;

  constructor(
    commands: AshenCommand[] = [],
    usageStats: UsageStats,
  ) {
    this.usageStats = usageStats;
    this.registerMany(commands);

    this.activityTimer = setInterval(
      () => this.flushActivity(),
      ACTIVITY_INTERVAL_MS,
    );

    this.activityTimer.unref();
  }

  register(command: AshenCommand): void {
    this.commands.set(command.data.name, command);
  }

  registerMany(commands: AshenCommand[]): void {
    for (const command of commands) {
      this.register(command);
    }
  }

  async handle(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const commandName = interaction.commandName;

    const command = this.commands.get(commandName);

    if (!command) {
      throw new Error(
        `Command not found: /${commandName}`,
      );
    }

    /*
     * index.ts owns the initial Discord acknowledgement.
     * This handler must NEVER call reply() or deferReply().
     */
    if (
      !interaction.deferred &&
      !interaction.replied
    ) {
      throw new Error(
        `/${commandName} reached CommandHandler without being acknowledged.`,
      );
    }

    this.activity.set(
      commandName,
      (this.activity.get(commandName) ?? 0) + 1,
    );

    this.usageStats.recordCommand(
      interaction.user.id,
    );

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(
        `❌ /${commandName} failed:`,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  private flushActivity(): void {
    if (this.activity.size === 0) {
      return;
    }

    const summary = [...this.activity.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(
        ([command, count]) =>
          `/${command}=${count}`,
      )
      .join(" | ");

    logger.info(
      `📊 Command activity (last 5m) | ${summary}`,
    );

    this.activity.clear();
  }

  getCommands(): Map<string, AshenCommand> {
    return this.commands;
  }

  getActivity(): Map<string, number> {
    return new Map(this.activity);
  }

  destroy(): void {
    clearInterval(this.activityTimer);
  }
}
