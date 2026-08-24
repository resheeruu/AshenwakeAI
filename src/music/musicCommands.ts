import {
  Message,
  GuildMember,
} from "discord.js";
import { ShoukakuMusicManager } from "./ShoukakuMusicManager";

const PREFIX = "!";

export async function handleMusicCommand(
  message: Message,
  music: ShoukakuMusicManager,
  musicReady = true,
): Promise<boolean> {
  if (message.author.bot) return false;

  const content = message.content.trim();
  const lower = content.toLowerCase();

  if (!lower.startsWith(`${PREFIX}p`)) {
    return false;
  }

  if (!musicReady) {
    await message.reply(
      "⚠️ The music system is currently unavailable. AshenAI's AI and Discord systems are still online.",
    );
    return true;
  }

  const args = content.slice(2).trim();

  if (!args) {
    await message.reply("🎵 Usage: `!p <song or URL>`");
    return true;
  }

  if (!message.guild) {
    await message.reply("❌ Music commands can only be used in a server.");
    return true;
  }

  const member = message.member as GuildMember | null;
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await message.reply("❌ Join a voice channel first.");
    return true;
  }

  try {
    console.log(`🎵 !p received: ${args}`);

    await message.reply(`🔎 Searching for **${args}**...`);

    const track = await music.play(
      message.guild.id,
      voiceChannel.id,
      args,
    );

    console.log("🎵 MUSIC COMMAND RETURN:", track ? JSON.stringify({
      title: track.title,
      author: track.author,
      uri: track.uri,
    }) : "NULL");

    if (!track) {
      await message.reply("❌ I couldn't find that track.");
      return true;
    }

    await message.reply(
      `🎵 Now playing **${track.title}**${track.author ? ` — ${track.author}` : ""}`,
    );

    return true;
  } catch (error) {
    console.error("❌ SHOUKAKU MUSIC COMMAND ERROR:", error);

    const errorMessage =
      error instanceof Error ? error.message : String(error);

    await message.reply(
      `❌ I couldn't play that track.\n\`${errorMessage.slice(0, 500)}\``,
    );

    return true;
  }
}
