import {
  Message,
  GuildMember,
} from "discord.js";

import { NodeMusicManager } from "./NodeMusicManager";
import { MusicSessionManager } from "./MusicSessionManager";
import { buildMusicPanel } from "./musicPanel";
import { logger } from "../logger";

const PREFIX = "!";

function getMember(message: Message): GuildMember | null {
  return message.member as GuildMember | null;
}

async function requireSession(
  message: Message,
  sessions: MusicSessionManager,
) {
  if (!message.guild) {
    await message.reply(
      "❌ Music commands can only be used in a server.",
    );
    return null;
  }

  const session = sessions.get(message.guild.id);

  if (!session) {
    await message.reply(
      "❌ There is no active music session yet.\nJoin a voice channel and use `!p <song>` to start one.",
    );
    return null;
  }

  return session;
}

async function requireMusicChannel(
  message: Message,
  sessions: MusicSessionManager,
) {
  const session = await requireSession(message, sessions);

  if (!session || !message.guild) {
    return null;
  }

  const member = getMember(message);

  if (!member?.voice.channel) {
    await message.reply(
      "❌ Join the active music voice channel first.",
    );
    return null;
  }

  if (member.voice.channel.id !== session.voiceChannelId) {
    await message.reply(
      `❌ You must be in <#${session.voiceChannelId}> to use this music session.`,
    );
    return null;
  }

  return session;
}

async function requireDJ(
  message: Message,
  sessions: MusicSessionManager,
) {
  const session = await requireMusicChannel(
    message,
    sessions,
  );

  if (!session) {
    return null;
  }

  if (
    !sessions.userCanControl(
      session.guildId,
      message.author.id,
    )
  ) {
    await message.reply(
      "🚫 You don't have music-control permission.\nOnly the music owner or a DJ can use this command.",
    );
    return null;
  }

  return session;
}

export async function handleMusicCommand(
  message: Message,
  music: NodeMusicManager | null,
  sessions: MusicSessionManager,
  musicReady = true,
): Promise<boolean> {
  if (message.author.bot) {
    return false;
  }

  const content = message.content.trim();

  if (!content.startsWith(PREFIX)) {
    return false;
  }

  const parts = content.split(/\s+/);

  const command = parts[0]
    .slice(PREFIX.length)
    .toLowerCase();

  const args = parts.slice(1).join(" ").trim();

  const musicCommands = new Set([
    "p",
    "play",
    "pause",
    "resume",
    "stop",
    "skip",
    "queue",
    "autoplay",
    "loop",
    "shuffle",
    "clearqueue",
    "remove",
    "move",
    "nowplaying",
    "claim",
    "dj",
    "music",
  ]);

  if (!musicCommands.has(command)) {
    return false;
  }

  if (!musicReady || !music) {
    await message.reply(
      "⚠️ The music system is currently unavailable. AshenAI's AI and Discord systems are still online.",
    );
    return true;
  }

  if (!message.guild) {
    await message.reply(
      "❌ Music commands can only be used in a server.",
    );
    return true;
  }

  // =====================================================
  // PLAY
  // =====================================================

  if (command === "p" || command === "play") {
    if (!args) {
      await message.reply(
        "🎵 Usage: `!p <song or URL>`",
      );
      return true;
    }

    const member = getMember(message);
    const voiceChannel = member?.voice.channel;

    if (!voiceChannel) {
      await message.reply(
        "❌ Join a voice channel first.",
      );
      return true;
    }

    let session = sessions.get(message.guild.id);

    if (!session) {
      session = sessions.createOrGet(
        message.guild,
        voiceChannel.id,
        message.author.id,
      );

      logger.info(
        `Music session created: guild=${message.guild.id} owner=${message.author.id}`,
      );
    }

    if (session.voiceChannelId !== voiceChannel.id) {
      await message.reply(
        `🚫 AshenAI is already playing music in <#${session.voiceChannelId}>.\nJoin that channel to request music.`,
      );
      return true;
    }

    if (
      !sessions.userCanRequest(
        message.guild,
        message.author.id,
      )
    ) {
      await message.reply(
        "🚫 You are not allowed to request music from outside the active music channel.",
      );
      return true;
    }

    sessions.markChannelOccupied(message.guild.id);

    try {
      logger.debug(
        `Music request: user=${message.author.id} query=${args}`,
      );

      await message.reply(
        `🔎 Searching for **${args}**...`,
      );

      const track = await music.play(
        message.guild.id,
        session.voiceChannelId,
        args,
        message.author.id,
      );

      logger.debug(
        "Music command result:",
      );

      if (!track) {
        await message.reply(
          "❌ I couldn't find that track.",
        );
        return true;
      }

      await message.reply(
        buildMusicPanel(
          session,
          {
            title: track.title,
            author: track.author,
            uri: track.uri,
            length: track.length,
          },
          "playing",
        ),
      );

      return true;
    } catch (error) {
      logger.error(
        "Music command error:",
      );

      await message.reply(
        `❌ I couldn't play that track. The issue has been logged.`,
      );

      return true;
    }
  }

  // =====================================================
  // PAUSE
  // =====================================================

  if (command === "pause") {
    const session = await requireDJ(
      message,
      sessions,
    );

    if (!session) return true;

    await music.pause(message.guild.id);

    await message.reply("⏸️ Music paused.");

    return true;
  }

  // =====================================================
  // RESUME
  // =====================================================

  if (command === "resume") {
    const session = await requireDJ(
      message,
      sessions,
    );

    if (!session) return true;

    await music.resume(message.guild.id);

    await message.reply("▶️ Music resumed.");

    return true;
  }

  // =====================================================
  // SKIP
  // =====================================================

  if (command === "skip") {
    const session = await requireDJ(
      message,
      sessions,
    );

    if (!session) return true;

    try {
      const next = await music.skip(
        message.guild.id,
      );

      if (!next) {
        await message.reply(
          "⏭️ Skipped. The queue is now empty.",
        );
        return true;
      }

      await message.reply(
        buildMusicPanel(
          session,
          {
            title: next.title,
            author: next.author,
            uri: next.uri,
            length: next.length,
          },
          "playing",
        ),
      );

      return true;
    } catch (error) {
      logger.error(
        "Music skip error:",
      );

      await message.reply(
        "❌ I couldn't skip the current track.",
      );

      return true;
    }
  }

  // =====================================================
  // QUEUE
  // =====================================================

  if (command === "queue") {
    const session = await requireMusicChannel(
      message,
      sessions,
    );

    if (!session) return true;

    const current = music.getCurrent(
      message.guild.id,
    );

    const queue = music.getQueue(
      message.guild.id,
    );

    if (!current && queue.length === 0) {
      await message.reply(
        "📭 The music queue is empty.",
      );
      return true;
    }

    const lines = [
      "📋 **AshenAI Music Queue**",
      "",
    ];

    if (current) {
      lines.push(
        `▶️ **Now Playing:** ${current.track.info.title}`,
      );
      lines.push("");
    }

    if (queue.length > 0) {
      queue.slice(0, 10).forEach((item, index) => {
        lines.push(
          `**${index + 1}.** ${item.track.info.title} — <@${item.requestedBy}>`,
        );
      });

      if (queue.length > 10) {
        lines.push("");
        lines.push(
          `…and ${queue.length - 10} more track(s).`,
        );
      }
    } else {
      lines.push("📭 No upcoming tracks.");
    }

    await message.reply(
      lines.join("\n"),
    );

    return true;
  }

  // =====================================================
  // AUTOPLAY
  // =====================================================

  if (command === "autoplay") {
    const session = await requireDJ(message, sessions);

    if (!session) return true;

    const current = music.isAutoplayEnabled(message.guild.id);
    const enabled = !current;

    music.setAutoplay(message.guild.id, enabled);

    await message.reply(
      enabled
        ? "🤖 **Autoplay enabled.** AshenAI Radio will continue with related tracks when the queue ends."
        : "⏹️ **Autoplay disabled.** Music will stop when the queue becomes empty.",
    );

    return true;
  }

  // =====================================================
  // LOOP
  // =====================================================

  if (command === "loop") {
    const session = await requireDJ(message, sessions);

    if (!session) return true;

    const mode = music.cycleLoop(message.guild.id);

    const labels = {
      off: "🔁 Loop **OFF**",
      track: "🔂 Looping **current track**",
      queue: "🔁 Looping **queue**",
    };

    await message.reply(labels[mode]);

    return true;
  }

  // =====================================================
  // SHUFFLE
  // =====================================================

  if (command === "shuffle") {
    const session = await requireDJ(message, sessions);

    if (!session) return true;

    const size = music.getQueueSize(message.guild.id);

    if (size < 2) {
      await message.reply(
        "🔀 You need at least **2 upcoming tracks** to shuffle.",
      );
      return true;
    }

    music.shuffleQueue(message.guild.id);

    await message.reply(
      `🔀 **Queue shuffled!** ${size} upcoming track(s) randomized.`,
    );

    return true;
  }

  // =====================================================
  // CLEAR QUEUE
  // =====================================================

  if (command === "clearqueue") {
    const session = await requireDJ(message, sessions);

    if (!session) return true;

    const size = music.getQueueSize(message.guild.id);

    if (size === 0) {
      await message.reply("📭 The upcoming queue is already empty.");
      return true;
    }

    music.clearUpcomingQueue(message.guild.id);

    await message.reply(
      `🧹 Cleared **${size}** upcoming track(s). The current track will continue playing.`,
    );

    return true;
  }

  // =====================================================
  // REMOVE
  // =====================================================

  if (command === "remove") {
    const session = await requireDJ(message, sessions);

    if (!session) return true;

    const index = Number(parts[1]);

    if (!Number.isInteger(index) || index < 1) {
      await message.reply(
        "❌ Usage: `!remove <queue number>`\nExample: `!remove 3`",
      );
      return true;
    }

    const removed = music.removeFromQueue(
      message.guild.id,
      index - 1,
    );

    if (!removed) {
      await message.reply(
        `❌ There is no track at queue position **${index}**.`,
      );
      return true;
    }

    await message.reply(
      `🗑️ Removed **${removed.track.info.title}** from the queue.`,
    );

    return true;
  }

  // =====================================================
  // MOVE
  // =====================================================

  if (command === "move") {
    const session = await requireDJ(message, sessions);

    if (!session) return true;

    const from = Number(parts[1]);
    const to = Number(parts[2]);

    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      to < 1
    ) {
      await message.reply(
        "❌ Usage: `!move <from> <to>`\nExample: `!move 5 1`",
      );
      return true;
    }

    const queueSize = music.getQueueSize(message.guild.id);

    if (from > queueSize || to > queueSize) {
      await message.reply(
        `❌ Queue positions must be between **1** and **${queueSize}**.`,
      );
      return true;
    }

    if (from === to) {
      await message.reply(
        "ℹ️ That track is already in that position.",
      );
      return true;
    }

    const moved = music.moveInQueue(
      message.guild.id,
      from - 1,
      to - 1,
    );

    if (!moved) {
      await message.reply(
        "❌ I couldn't move that track.",
      );
      return true;
    }

    await message.reply(
      `↕️ Moved queue position **${from} → ${to}**.`,
    );

    return true;
  }

  // =====================================================
  // NOW PLAYING
  // =====================================================

  if (command === "nowplaying") {
    const session = await requireMusicChannel(
      message,
      sessions,
    );

    if (!session) return true;

    const current = music.getCurrent(message.guild.id);

    if (!current) {
      await message.reply("📭 Nothing is currently playing.");
      return true;
    }

    const info = current.track.info;

    await message.reply(
      [
        "🎵 **Now Playing**",
        "",
        `🎶 **${info.title}**`,
        `👤 ${info.author || "Unknown artist"}`,
        `👤 Requested by <@${current.requestedBy}>`,
        `📋 Queue: **${music.getQueueSize(message.guild.id)}** upcoming`,
        `🤖 Autoplay: **${music.isAutoplayEnabled(message.guild.id) ? "ON" : "OFF"}**`,
        `🔁 Loop: **${music.getLoop(message.guild.id).toUpperCase()}**`,
      ].join("\n"),
    );

    return true;
  }

  // =====================================================
  // STOP
  // =====================================================

  if (command === "stop") {
    const session = await requireDJ(
      message,
      sessions,
    );

    if (!session) return true;

    await music.stop(message.guild.id);

    await message.reply("⏹️ Music stopped.");

    return true;
  }

  // =====================================================
  // CLAIM
  // =====================================================

  if (command === "claim") {
    const session = await requireMusicChannel(
      message,
      sessions,
    );

    if (!session) return true;

    if (session.ownerId === message.author.id) {
      await message.reply(
        "👑 You already own this music session.",
      );
      return true;
    }

    const owner =
      message.guild.members.cache.get(
        session.ownerId,
      );

    if (
      owner?.voice.channelId ===
      session.voiceChannelId
    ) {
      await message.reply(
        `🚫 The current owner <@${session.ownerId}> is still in the music channel.\nYou cannot claim the session yet.`,
      );
      return true;
    }

    sessions.claim(
      message.guild.id,
      message.author.id,
    );

    await message.reply(
      `👑 **${message.author.username}** is now the music session owner.`,
    );

    return true;
  }

  // =====================================================
  // DJ MANAGEMENT
  // =====================================================

  if (command === "dj") {
    const subcommand = parts[1]?.toLowerCase();

    if (
      subcommand !== "add" &&
      subcommand !== "remove"
    ) {
      await message.reply(
        "🎧 Usage:\n`!dj add @user`\n`!dj remove @user`",
      );
      return true;
    }

    const session = await requireDJ(
      message,
      sessions,
    );

    if (!session) return true;

    if (
      !sessions.isOwner(
        message.guild.id,
        message.author.id,
      )
    ) {
      await message.reply(
        "🚫 Only the music owner can manage DJs.",
      );
      return true;
    }

    const target =
      message.mentions.members?.first();


    if (!target) {
      await message.reply(
        "❌ Mention the user you want to manage.",
      );
      return true;
    }

    if (target.user.bot) {
      await message.reply(
        "❌ Bots cannot be added as DJs.",
      );
      return true;
    }

    if (target.id === session.ownerId) {
      await message.reply(
        "👑 The owner already has full music control.",
      );
      return true;
    }

    if (subcommand === "add") {
      sessions.addDJ(
        message.guild.id,
        target.id,
      );

      await message.reply(
        `🎧 <@${target.id}> is now a music DJ.`,
      );

      return true;
    }

    sessions.removeDJ(
      message.guild.id,
      target.id,
    );

    await message.reply(
      `🎵 <@${target.id}> is no longer a music DJ.`,
    );

    return true;
  }

  // =====================================================
  // MUSIC SESSION INFO
  // =====================================================

  if (command === "music") {
    const session =
      await requireMusicChannel(
        message,
        sessions,
      );

    if (!session) return true;

    const djText =
      session.djIds.size > 0
        ? [...session.djIds]
            .map((id) => `<@${id}>`)
            .join(", ")
        : "None";

    await message.reply(
      [
        "🎵 **AshenAI Music Session**",
        "",
        `📍 Channel: <#${session.voiceChannelId}>`,
        `👑 Owner: <@${session.ownerId}>`,
        `🎧 DJs: ${djText}`,
        "",
        "🎵 Request: `!p <song>`",
        "⏸️ Pause: `!pause`",
        "▶️ Resume: `!resume`",
        "⏭️ Skip: `!skip`",
        "⏹️ Stop: `!stop`",
        "🎵 Now Playing: `!nowplaying`",
        "📋 Queue: `!queue`",
        "🤖 Autoplay: `!autoplay`",
        "🔁 Loop: `!loop`",
        "🔀 Shuffle: `!shuffle`",
        "🧹 Clear queue: `!clearqueue`",
        "🗑️ Remove: `!remove <number>`",
        "↕️ Move: `!move <from> <to>`",
        "👑 Claim: `!claim`",
        "🎧 DJ management: `!dj add/remove @user`",
        "",
        "🚪 If everyone leaves, AshenAI disconnects after 60 seconds.",
      ].join("\n"),
    );

    return true;
  }

  return false;
}
