import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

import type { MusicSession } from "./MusicSessionManager";

export type MusicPanelState =
  | "playing"
  | "paused"
  | "stopped";

export interface MusicPanelTrack {
  title: string;
  author?: string;
  uri?: string;
  length?: number;
  position?: number;
  volume?: number;
  loop?: "off" | "track" | "queue";
}

export function buildMusicPanel(
  session: MusicSession,
  track: MusicPanelTrack,
  state: MusicPanelState = "playing",
) {
  const length =
    typeof track.length === "number" && track.length > 0
      ? track.length
      : 0;

  const position =
    typeof track.position === "number" &&
    track.position >= 0
      ? Math.min(
          track.position,
          length || track.position,
        )
      : 0;

  const status =
    state === "playing"
      ? "▶️ Playing"
      : state === "paused"
        ? "⏸️ Paused"
        : "⏹️ Stopped";

  const progress =
    length > 0
      ? buildProgressBar(position, length)
      : "━━━━━━━━━━━━━━━━━━";

  const timeText =
    length > 0
      ? `${formatDuration(position)} / ${formatDuration(length)}`
      : "Live / Unknown";

  const volume =
    typeof track.volume === "number"
      ? Math.max(0, Math.min(100, track.volume))
      : 100;

  const loop =
    track.loop === "track"
      ? "🔂 Track"
      : track.loop === "queue"
        ? "🔁 Queue"
        : "➡️ Off";

  const embed = new EmbedBuilder()
    .setTitle("🎵 AshenAI Music")
    .setDescription(
      [
        `**${escapeMarkdown(track.title)}**`,
        track.author
          ? `👤 ${escapeMarkdown(track.author)}`
          : "",
        "",
        `${status}`,
        "",
        progress,
        `\`${timeText}\``,
        "",
        `🔊 Volume: **${volume}%**`,
        `🔁 Loop: **${loop}**`,
        "",
        `👑 <@${session.ownerId}>`,
        `📍 <#${session.voiceChannelId}>`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setFooter({
      text: "AshenAI Music • Owner/DJs control playback",
    });

  if (track.uri) {
    embed.setURL(track.uri);
  }

  return {
    embeds: [embed],
    components: buildMusicControls(state),
  };
}

export function buildStoppedMusicPanel(
  session: MusicSession,
) {
  return buildMusicPanel(
    session,
    {
      title: "Nothing playing",
      author: "AshenAI Music",
      length: 0,
      position: 0,
      volume: 100,
      loop: "off",
    },
    "stopped",
  );
}

export function buildMusicControls(
  state: MusicPanelState,
) {
  const isPlaying = state === "playing";
  const isStopped = state === "stopped";

  const playbackRow =
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ashen_music:previous")
        .setLabel("Previous")
        .setEmoji("⏮️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(false),

      new ButtonBuilder()
        .setCustomId(
          isPlaying
            ? "ashen_music:pause"
            : "ashen_music:resume",
        )
        .setLabel(isPlaying ? "Pause" : "Play")
        .setEmoji(isPlaying ? "⏸️" : "▶️")
        .setStyle(
          isPlaying
            ? ButtonStyle.Primary
            : ButtonStyle.Success,
        )
        .setDisabled(isStopped),

      new ButtonBuilder()
        .setCustomId("ashen_music:skip")
        .setLabel("Skip")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isStopped),

      new ButtonBuilder()
        .setCustomId("ashen_music:stop")
        .setLabel("Stop")
        .setEmoji("⏹️")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(isStopped),
    );

  const utilityRow =
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ashen_music:queue")
        .setLabel("Queue")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isStopped),

      new ButtonBuilder()
        .setCustomId("ashen_music:shuffle")
        .setLabel("Shuffle")
        .setEmoji("🔀")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isStopped),

      new ButtonBuilder()
        .setCustomId("ashen_music:loop")
        .setLabel("Loop")
        .setEmoji("🔁")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isStopped),

      new ButtonBuilder()
        .setCustomId("ashen_music:volume")
        .setLabel("Volume")
        .setEmoji("🔊")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isStopped),
    );

  const refreshRow =
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ashen_music:refresh")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isStopped),

      new ButtonBuilder()
        .setCustomId("ashen_music:disconnect")
        .setLabel("Disconnect")
        .setEmoji("🔌")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(false),
    );

  return [
    playbackRow,
    utilityRow,
    refreshRow,
  ];
}

function buildProgressBar(
  position: number,
  length: number,
): string {
  const total = 18;

  if (length <= 0) {
    return "━━━━━━━━━━━━━━━━━━";
  }

  const ratio = Math.max(
    0,
    Math.min(1, position / length),
  );

  const filled = Math.round(ratio * total);

  return (
    "━".repeat(Math.max(0, filled)) +
    "🔘" +
    "━".repeat(
      Math.max(0, total - filled),
    )
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);

  const hours = Math.floor(
    totalSeconds / 3600,
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );

  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(
      2,
      "0",
    )}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(
    2,
    "0",
  )}`;
}

function escapeMarkdown(value: string): string {
  return value.replace(
    /([\\`*_{}[\]()#+\-.!|>])/g,
    "\\$1",
  );
}
