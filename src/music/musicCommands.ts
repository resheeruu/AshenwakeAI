import {
  Message,
  GuildMember,
  TextChannel,
} from "discord.js";
import { Player } from "discord-player";

const PREFIX = "!";

export async function handleMusicCommand(
  message: Message,
  player: Player,
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
    await message.reply("🎵 Usage: `!p <song>`");
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

  if (!message.channel.isTextBased() || !("send" in message.channel)) {
    return true;
  }

  try {
    console.log(`🎵 !p received: ${args}`);

    try {
      const { execFileSync } = await import("child_process");
      const version = execFileSync("ffmpeg", ["-version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).split("\n")[0];

      console.log(`🎵 Music FFmpeg: ${version}`);
    } catch {
      console.log("❌ Music FFmpeg: NOT AVAILABLE");
    }

    await message.reply(`🔎 Searching for **${args}**...`);

    const result = await player.search(args, {
      requestedBy: message.author,
      searchEngine: "soundcloud",
    });

    if (!result.hasTracks()) {
      await message.reply("❌ I couldn't find that track.");
      return true;
    }

    const track = result.tracks[0];

    console.log(
      "🎵 TRACK DEBUG:",
      JSON.stringify({
        title: track.title,
        author: track.author,
        duration: track.duration,
        durationMS: track.durationMS,
        source: track.source,
        url: track.url,
        requestedBy: track.requestedBy?.id ?? null,
      }),
    );

    const extractor = track.extractor;

    console.log(
      "🎵 EXTRACTOR INFO:",
      JSON.stringify({
        extractor: extractor?.constructor?.name ?? null,
        extractorIdentifier: extractor?.identifier ?? null,
        trackSource: track.source,
        trackUrl: track.url,
      }),
    );

    if (extractor) {
      const originalStream = extractor.stream.bind(extractor);

      extractor.stream = async (streamTrack: any) => {
        console.log(
          "🎵 EXTRACTOR STREAM REQUEST:",
          JSON.stringify({
            title: streamTrack.title,
            url: streamTrack.url,
            source: streamTrack.source,
          }),
        );

        try {
          const stream = await originalStream(streamTrack);

          console.log(
            "🎵 EXTRACTOR STREAM RESULT:",
            JSON.stringify({
              type: typeof stream,
              constructor: stream?.constructor?.name ?? null,
              isString: typeof stream === "string",
              isReadable:
                !!stream &&
                typeof stream === "object" &&
                "on" in stream &&
                typeof (stream as any).on === "function",
              hasFmt:
                !!stream &&
                typeof stream === "object" &&
                "$fmt" in stream,
              streamUrl:
                typeof stream === "string"
                  ? stream.slice(0, 500)
                  : null,
            }),
          );

          return stream;
        } catch (error) {
          console.error("❌ EXTRACTOR STREAM ERROR:", error);
          throw error;
        }
      };
    }

    const playResult = await player.play(voiceChannel, track, {
      nodeOptions: {
        metadata: {
          channel: message.channel,
          requestedBy: message.author,
        },
      },
    });

    console.log("🎵 PLAY RESULT:", playResult);

    const queue = player.nodes.get(message.guild.id);

    console.log(
      "🎵 QUEUE STATE:",
      JSON.stringify({
        exists: Boolean(queue),
        connected: Boolean(queue?.connection),
        playing: queue?.isPlaying() ?? false,
        empty: queue?.isEmpty() ?? true,
        deleted: queue?.deleted ?? false,
      }),
    );

    await message.reply(
      `🎵 Added **${track.title}**${track.author ? ` — ${track.author}` : ""}`,
    );

    return true;
  } catch (error) {
    console.error("Music playback error:", error);

    await message.reply(
      `❌ Music playback failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    return true;
  }
}

