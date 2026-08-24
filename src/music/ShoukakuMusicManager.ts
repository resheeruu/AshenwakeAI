import {
  Connectors,
  LoadType,
  Shoukaku,
  type NodeOption,
  type Track,
} from "shoukaku";
import type { Client } from "discord.js";

export class ShoukakuMusicManager {
  public readonly shoukaku: Shoukaku;

  constructor(
    client: Client,
    lavalink: {
      url: string;
      auth: string;
      secure: boolean;
      name: string;
    },
  ) {
    const connector = new Connectors.DiscordJS(client);

    const node: NodeOption = {
      name: lavalink.name,
      url: lavalink.url,
      auth: lavalink.auth,
      secure: lavalink.secure,
    };

    this.shoukaku = new Shoukaku(connector, [node], {
      reconnectTries: 10,
      reconnectInterval: 5,
      resume: true,
      resumeTimeout: 30,
      resumeByLibrary: true,
      moveOnDisconnect: true,
      voiceConnectionTimeout: 30,
    });

    this.shoukaku.on("ready", (name, resumed) => {
      console.log(
        `🟢 LAVALINK READY: ${name} resumed=${resumed}`,
      );
    });

    this.shoukaku.on("error", (name, error) => {
      console.error(
        `❌ LAVALINK ERROR [${name}]:`,
        error instanceof Error ? error.message : String(error),
      );
    });

    this.shoukaku.on("close", (name, code, reason) => {
      console.warn(
        `⚠️ LAVALINK CLOSED [${name}]: code=${code} reason=${reason}`,
      );
    });

    this.shoukaku.on("debug", (name, message) => {
      console.log(
        `🔧 LAVALINK DEBUG [${name}]: ${message}`,
      );
    });
  }

  async play(
    guildId: string,
    channelId: string,
    query: string,
    shardId = 0,
  ): Promise<Track["info"] | null> {
    const node = this.shoukaku.getIdealNode();

    if (!node) {
      throw new Error("No Lavalink node is available.");
    }

    const identifier = this.normalizeQuery(query);

    console.log(`🎵 LAVALINK RESOLVE: ${identifier}`);

    const result = await node.rest.resolve(identifier);

    if (!result) {
      console.error("❌ Lavalink returned no result.");
      return null;
    }

    console.log(`🎵 LAVALINK LOAD TYPE: ${result.loadType}`);

    if (result.loadType === LoadType.ERROR) {
      throw new Error(
        `${result.data.message} (${result.data.cause})`,
      );
    }

    let track: Track | undefined;

    switch (result.loadType) {
      case LoadType.TRACK:
        track = result.data;
        break;

      case LoadType.SEARCH:
        track = result.data[0];
        break;

      case LoadType.PLAYLIST:
        track = result.data.tracks[0];
        break;

      case LoadType.EMPTY:
        return null;

      default:
        return null;
    }

    if (!track) {
      return null;
    }

    console.log(
      "🎵 LAVALINK TRACK:",
      JSON.stringify({
        title: track.info.title,
        author: track.info.author,
        uri: track.info.uri,
        source: track.info.sourceName,
        length: track.info.length,
        encodedLength: track.encoded?.length ?? 0,
      }),
    );

    console.log(
      `🎙️ VOICE CONNECT: guild=${guildId} channel=${channelId} shard=${shardId}`,
    );

    let player = this.shoukaku.players.get(guildId);

    if (player) {
      console.log(
        `♻️ REUSING EXISTING VOICE CONNECTION: guild=${guildId}`,
      );
    } else {
      player = await this.shoukaku.joinVoiceChannel({
        guildId,
        channelId,
        shardId,
        deaf: true,
        mute: false,
      });

      console.log(
        `🟢 VOICE CONNECTED: guild=${guildId} channel=${channelId}`,
      );
    }

    // Shoukaku 4.x player events.
    player.on("start", (data) => {
      console.log(
        `▶️ TRACK START: guild=${data.guildId} title=${data.track.info.title}`,
      );
    });

    player.on("update", (data) => {
      console.log(
        `🎧 PLAYER UPDATE: guild=${data.guildId} position=${data.state.position} connected=${data.state.connected} ping=${data.state.ping}`,
      );
    });

    player.on("exception", (data) => {
      console.error(
        `🚨 TRACK EXCEPTION: guild=${data.guildId}`,
        JSON.stringify(data.exception),
      );
    });

    player.on("stuck", (data) => {
      console.error(
        `🚨 TRACK STUCK: guild=${data.guildId} threshold=${data.thresholdMs}ms`,
      );
    });

    player.on("end", (data) => {
      console.log(
        `🏁 TRACK END: guild=${data.guildId} reason=${data.reason}`,
      );
    });

    player.on("closed", (data) => {
      console.error(
        `🔌 PLAYER WEBSOCKET CLOSED: guild=${data.guildId} code=${data.code} reason=${data.reason}`,
      );
    });

    console.log(
      `▶️ PLAYTRACK REQUEST: ${track.info.title}`,
    );

    await player.playTrack({
      track: {
        encoded: track.encoded,
      },
    });

    console.log(
      `🎵 LAVALINK PLAYING: ${track.info.title}`,
    );

    return track.info;
  }

  async stop(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);

    if (!player) {
      return;
    }

    await player.stopTrack();
  }

  async pause(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);

    if (!player) {
      return;
    }

    await player.setPaused(true);
  }

  async resume(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);

    if (!player) {
      return;
    }

    await player.setPaused(false);
  }

  async disconnect(guildId: string): Promise<void> {
    await this.shoukaku.leaveVoiceChannel(guildId);
  }

  getPlayer(guildId: string) {
    return this.shoukaku.players.get(guildId);
  }

  private normalizeQuery(query: string): string {
    const trimmed = query.trim();

    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://")
    ) {
      return trimmed;
    }

    return `scsearch:${trimmed}`;
  }
}
