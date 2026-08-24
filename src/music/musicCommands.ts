import {
  Message,
  GuildMember,
} from "discord.js";

import { ShoukakuMusicManager } from "./ShoukakuMusicManager";
import { MusicSessionManager } from "./MusicSessionManager";

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
  music: ShoukakuMusicManager,
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
    "claim",
    "dj",
    "music",
  ]);

  if (!musicCommands.has(command)) {
    return false;
  }

  if (!musicReady) {
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

      console.log(
        `👑 MUSIC SESSION CREATED: guild=${message.guild.id} owner=${message.author.id} channel=${voiceChannel.id}`,
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
      console.log(
        `🎵 MUSIC REQUEST: user=${message.author.id} query=${args}`,
      );

      await message.reply(
        `🔎 Searching for **${args}**...`,
      );

      const track = await music.play(
        message.guild.id,
        session.voiceChannelId,
        args,
      );

      console.log(
        "🎵 MUSIC COMMAND RETURN:",
        track
          ? JSON.stringify({
              title: track.title,
              author: track.author,
              uri: track.uri,
            })
          : "NULL",
      );

      if (!track) {
        await message.reply(
          "❌ I couldn't find that track.",
        );
        return true;
      }

      await message.reply(
        `🎵 Now playing **${track.title}**${
          track.author
            ? ` — ${track.author}`
            : ""
        }\n👑 Owner: <@${session.ownerId}>`,
      );

      return true;
    } catch (error) {
      console.error(
        "❌ SHOUKAKU MUSIC COMMAND ERROR:",
        error,
      );

      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error);

      await message.reply(
        `❌ I couldn't play that track.\n\`${errorMessage.slice(0, 500)}\``,
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
        "⏹️ Stop: `!stop`",
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
