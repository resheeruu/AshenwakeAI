import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import { AIRouter } from "../ai/router";
import { taskEngine } from "../agent/tasks";
import { AshenCommand } from "./definitions";

const MAX = 1900;

function taskText(task: any): string {
  const done = task.steps.filter(
    (s: any) =>
      s.status === "completed" ||
      s.status === "skipped",
  ).length;

  const steps = task.steps
    .map((s: any, i: number) => {
      const icon =
        s.status === "completed" ? "✅" :
        s.status === "failed" ? "❌" :
        s.status === "running" ? "🔄" :
        s.status === "skipped" ? "⏭️" :
        "⏳";

      return `${icon} ${i + 1}. ${s.title}`;
    })
    .join("\n");

  return [
    `🤖 **Task ${task.status.toUpperCase()}**`,
    `🆔 \`${task.id}\``,
    `🎯 ${task.goal}`,
    `📊 ${done}/${task.steps.length} steps`,
    "",
    steps,
    task.error
      ? `\n❌ ${task.error}`
      : "",
  ].join("\n").slice(0, MAX);
}

function statusText(task: any): string {
  const progress =
    task.steps.length === 0
      ? 0
      : Math.round(
          task.steps.filter(
            (s: any) =>
              s.status === "completed" ||
              s.status === "skipped",
          ).length /
          task.steps.length *
          100,
        );

  return [
    `🤖 **Task Status**`,
    `🆔 \`${task.id}\``,
    `📌 **${task.status.toUpperCase()}**`,
    `🎯 ${task.goal}`,
    `📊 ${progress}%`,
    `🔢 Step ${Math.min(
      task.currentStep + 1,
      task.steps.length,
    )}/${task.steps.length}`,
    "",
    ...task.steps.map(
      (s: any, i: number) =>
        `${s.status === "completed" ? "✅" :
          s.status === "failed" ? "❌" :
          s.status === "running" ? "🔄" : "⏳"} ` +
        `${i + 1}. ${s.title}`,
    ),
  ].join("\n").slice(0, MAX);
}

export function createTaskCommand(
  router: AIRouter,
): AshenCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("task")
      .setDescription("Manage AshenAI autonomous tasks")
      .addSubcommand(sub =>
        sub
          .setName("run")
          .setDescription("Create and run an autonomous task")
          .addStringOption(option =>
            option
              .setName("goal")
              .setDescription("What should AshenAI do?")
              .setRequired(true)
              .setMaxLength(1000),
          ),
      )
      .addSubcommand(sub =>
        sub
          .setName("status")
          .setDescription("Show task status")
          .addStringOption(option =>
            option
              .setName("id")
              .setDescription("Task ID")
              .setRequired(true),
          ),
      )
      .addSubcommand(sub =>
        sub
          .setName("list")
          .setDescription("List recent tasks"),
      )
      .addSubcommand(sub =>
        sub
          .setName("cancel")
          .setDescription("Cancel a task")
          .addStringOption(option =>
            option
              .setName("id")
              .setDescription("Task ID")
              .setRequired(true),
          ),
      ),

    async execute(
      interaction: ChatInputCommandInteraction,
    ): Promise<void> {
      const subcommand =
        interaction.options.getSubcommand();

      try {

        if (subcommand === "run") {
          const goal =
            interaction.options
              .getString("goal", true)
              .trim();

          const task =
            await taskEngine.planAndRun(
              router,
              goal,
            );

          await interaction.editReply(
            taskText(task),
          );

          return;
        }

        if (subcommand === "status") {
          const id =
            interaction.options
              .getString("id", true)
              .trim();

          const task =
            await taskEngine.get(id);

          if (!task) {
            await interaction.editReply(
              `❌ Task \`${id}\` was not found.`,
            );
            return;
          }

          await interaction.editReply(
            statusText(task),
          );

          return;
        }

        if (subcommand === "list") {
          const tasks =
            await taskEngine.list();

          const recent =
            tasks.slice(-10).reverse();

          if (recent.length === 0) {
            await interaction.editReply(
              "📭 No autonomous tasks yet.",
            );
            return;
          }

          const output = recent.map(
            (task: any) =>
              `• \`${task.id}\` — **${task.status}** — ${task.goal}`,
          ).join("\n");

          await interaction.editReply(
            `🤖 **Recent AshenAI Tasks**\n\n${output}`.slice(
              0,
              MAX,
            ),
          );

          return;
        }

        if (subcommand === "cancel") {
          const id =
            interaction.options
              .getString("id", true)
              .trim();

          const task =
            await taskEngine.cancel(id);

          await interaction.editReply(
            `🛑 Task \`${task.id}\` is now **${task.status}**.`,
          );

          return;
        }

        await interaction.editReply(
          "❌ Unknown task operation.",
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        await interaction.editReply(
          `❌ Task error: ${message}`.slice(
            0,
            MAX,
          ),
        );
      }
    },
  };
}
