import {
  Connectors,
  LoadType,
  Shoukaku,
  type NodeOption,
  type Track,
} from "shoukaku";

import type { Client } from "discord.js";

import { logger } from "../logger";
import {
  MusicQueueManager,
  type LoopMode,
  type QueuedTrack,
} from "./MusicQueueManager";

export class ShoukakuMusicManager {
  public readonly shoukaku: Shoukaku;

  private readonly queue = new MusicQueueManager();

  private readonly listenersAttached =
    new Set<string>();

  private readonly manuallyStopped =
    new Set<string>();

  private readonly volumes =
    new Map<string, number>();

  private readonly autoplayEnabled =
    new Map<string, boolean>();

  constructor(
    client: Client,
    lavalink: {
      url: string;
      auth: string;
      secure: boolean;
      name: string;
    },
  ) {
    const connector =
      new Connectors.DiscordJS(client);

    const node: NodeOption = {
      name: lavalink.name,
      url: lavalink.url,
      auth: lavalink.auth,
      secure: lavalink.secure,
    };

    this.shoukaku = new Shoukaku(
      connector,
      [node],
      {
        reconnectTries: 10,
        reconnectInterval: 5,
        resume: true,
        resumeTimeout: 30,
        resumeByLibrary: true,
        moveOnDisconnect: true,
        voiceConnectionTimeout: 30,
      },
    );

    this.shoukaku.on(
      "ready",
      (name, resumed) => {
        logger.info(
          `Lavalink ready: ${name} resumed=${resumed}`,
        );
      },
    );

    this.shoukaku.on(
      "error",
      (name, error) => {
        logger.error(
          `Lavalink error [${name}]: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );

    this.shoukaku.on(
      "close",
      (name, code, reason) => {
        logger.warn(
          `Lavalink closed [${name}]: code=${code} reason=${reason}`,
        );
      },
    );

    this.shoukaku.on(
      "debug",
      (name, message) => {
        logger.debug(
          `Lavalink debug [${name}]: ${message}`,
        );
      },
    );
  }

  /*
   * =====================================================
   * RESOLVE + START / QUEUE
   * =====================================================
   */

  async play(
    guildId: string,
    channelId: string,
    query: string,
    requestedBy = "unknown",
    shardId = 0,
  ): Promise<Track["info"] | null> {
    const track =
      await this.resolveTrack(query);

    if (!track) {
      return null;
    }

    let player =
      this.shoukaku.players.get(guildId);

    if (!player) {
      logger.info(
        `Voice connect: guild=${guildId} channel=${channelId} shard=${shardId}`,
      );

      player =
        await this.shoukaku.joinVoiceChannel({
          guildId,
          channelId,
          shardId,
          deaf: true,
          mute: false,
        });

      logger.info(
        `Voice connected: guild=${guildId} channel=${channelId}`,
      );
    } else {
      logger.info(
        `Reusing voice connection: guild=${guildId}`,
      );
    }

    this.attachPlayerListeners(
      guildId,
      player,
    );

    const current =
      this.queue.getCurrent(guildId);

    if (current) {
      const queued =
        this.queue.enqueue(
          guildId,
          track,
          requestedBy,
        );

      logger.info(
        `Music queued: guild=${guildId} position=${this.queue.size(guildId)} title=${queued.track.info.title}`,
      );

      return track.info;
    }

    const item: QueuedTrack = {
      track,
      requestedBy,
      requestedAt: Date.now(),
    };

    this.queue.setCurrent(
      guildId,
      item,
    );

    this.manuallyStopped.delete(
      guildId,
    );

    await this.startTrack(
      guildId,
      item,
    );

    return track.info;
  }

  /*
   * =====================================================
   * RESOLVE TRACK
   * =====================================================
   */

  private async resolveTrack(
    query: string,
  ): Promise<Track | null> {
    const node =
      this.shoukaku.getIdealNode();

    if (!node) {
      throw new Error(
        "No Lavalink node is available.",
      );
    }

    const identifier =
      this.normalizeQuery(query);

    logger.debug(
      `Lavalink resolve: ${identifier}`,
    );

    const result =
      await node.rest.resolve(
        identifier,
      );

    if (!result) {
      logger.warn("Lavalink returned no result.");

      return null;
    }

    logger.debug(
      `Lavalink load type: ${result.loadType}`,
    );

    if (
      result.loadType ===
      LoadType.ERROR
    ) {
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

    logger.debug(
      "Lavalink track resolved",
    );

    return track;
  }

  /*
   * =====================================================
   * START TRACK
   * =====================================================
   */

  private async startTrack(
    guildId: string,
    item: QueuedTrack,
  ): Promise<void> {
    const player =
      this.shoukaku.players.get(
        guildId,
      );

    if (!player) {
      throw new Error(
        "Music player is no longer connected.",
      );
    }

    logger.debug(
      `PlayTrack request: ${item.track.info.title}`,
    );

    await player.setGlobalVolume(
      this.getVolume(guildId),
    );

    await player.playTrack({
      track: {
        encoded: item.track.encoded,
      },
    });

    logger.info(
      `Lavalink playing: ${item.track.info.title}`,
    );
  }

  /*
   * =====================================================
   * PLAYER EVENTS
   * =====================================================
   */

  /*
   * =====================================================
   * SMART AUTOPLAY
   * =====================================================
   */

  isAutoplayEnabled(guildId: string): boolean {
    return this.autoplayEnabled.get(guildId) ?? true;
  }

  setAutoplay(
    guildId: string,
    enabled: boolean,
  ): boolean {
    this.autoplayEnabled.set(guildId, enabled);
    return enabled;
  }

  private trackKey(track: Track): string {
    return (
      track.info.uri?.toLowerCase().trim()
      || `${track.info.author}::${track.info.title}`
        .toLowerCase()
        .trim()
    );
  }

  private async fillAutoplayQueue(
    guildId: string,
    seed: Track,
    requestedBy = "AshenAI Radio",
  ): Promise<number> {
    const node = this.shoukaku.getIdealNode();

    if (!node) {
      logger.warn(
        `Radio: no Lavalink node available guild=${guildId}`,
      );
      return 0;
    }

    const existing = new Set<string>();
    const artists = new Set<string>();

    const current = this.queue.getCurrent(guildId);

    if (current) {
      existing.add(this.trackKey(current.track));
      artists.add(
        current.track.info.author?.toLowerCase().trim() || "",
      );
    }

    for (const item of this.queue.getQueue(guildId)) {
      existing.add(this.trackKey(item.track));
      artists.add(
        item.track.info.author?.toLowerCase().trim() || "",
      );
    }

    for (const item of this.queue.getHistory(guildId)) {
      existing.add(this.trackKey(item.track));
    }

    const seedArtist =
      seed.info.author?.trim() || "";

    const seedTitle =
      seed.info.title?.trim() || "";

    /*
     * Search multiple related patterns.
     *
     * The order intentionally moves from:
     *   same artist
     *   same song/style
     *   related music
     *
     * This creates a radio-like flow instead of pure randomness.
     */
    const searches = [
      seedArtist,
      `${seedArtist} ${seedTitle}`,
      `${seedTitle}`,
      `${seedArtist} similar`,
      `${seedArtist} mix`,
    ].filter(Boolean);

    const added = new Set<string>();
    let addedCount = 0;

    const target = 8;

    for (const search of searches) {
      if (addedCount >= target) {
        break;
      }

      try {
        const result = await node.rest.resolve(
          `scsearch:${search}`,
        );

        if (
          !result ||
          result.loadType !== LoadType.SEARCH
        ) {
          continue;
        }

        for (const candidate of result.data) {
          if (addedCount >= target) {
            break;
          }

          if (
            !candidate.encoded ||
            !candidate.info.title
          ) {
            continue;
          }

          const key = this.trackKey(candidate);

          if (
            existing.has(key) ||
            added.has(key)
          ) {
            continue;
          }

          const artist =
            candidate.info.author
              ?.toLowerCase()
              .trim() || "";

          /*
           * Avoid filling the entire radio queue
           * with one artist.
           *
           * If the artist already appears in the
           * current queue, skip it when alternatives
           * are available.
           */
          if (
            artist &&
            artists.has(artist) &&
            addedCount < 4
          ) {
            continue;
          }

          this.queue.enqueue(
            guildId,
            candidate,
            requestedBy,
          );

          added.add(key);
          existing.add(key);

          if (artist) {
            artists.add(artist);
          }

          addedCount++;

          logger.debug(
            `Radio add: guild=${guildId} position=${this.queue.size(guildId)} title=${candidate.info.title}`,
          );
        }
      } catch (error) {
        logger.error(
          `Radio search failed: guild=${guildId} query="${search}"`,
        );
      }
    }

    logger.info(
      `Radio filled: guild=${guildId} added=${addedCount} queue=${this.queue.size(guildId)}`,
    );

    return addedCount;
  }

  private attachPlayerListeners(
    guildId: string,
    player: any,
  ): void {
    if (
      this.listenersAttached.has(
        guildId,
      )
    ) {
      return;
    }

    this.listenersAttached.add(
      guildId,
    );

    player.on(
      "start",
      (data: any) => {
        logger.debug(
          `Track start: guild=${data.guildId} title=${data.track.info.title}`,
        );
      },
    );

    player.on(
      "update",
      (data: any) => {
        logger.debug(
          `Player update: guild=${data.guildId} position=${data.state.position}`,
        );
      },
    );

    player.on(
      "exception",
      (data: any) => {
        logger.error(
          `Track exception: guild=${data.guildId}`,
        );
      },
    );

    player.on(
      "stuck",
      (data: any) => {
        logger.warn(
          `Track stuck: guild=${data.guildId} threshold=${data.thresholdMs}ms`,
        );
      },
    );

    player.on(
      "end",
      async (data: any) => {
        await this.handleTrackEnd(
          guildId,
          data,
        );
      },
    );

    player.on(
      "closed",
      (data: any) => {
        logger.warn(
          `Player websocket closed: guild=${data.guildId} code=${data.code}`,
        );
      },
    );
  }

  /*
   * =====================================================
   * TRACK END → NEXT TRACK
   * =====================================================
   */

  private async handleTrackEnd(
    guildId: string,
    data: any,
  ): Promise<void> {
    logger.debug(
      `Track end: guild=${guildId} reason=${data.reason}`,
    );

    if (this.manuallyStopped.has(guildId)) {
      logger.debug(
        `Track end ignored: manual stop guild=${guildId}`,
      );
      return;
    }

    const current = this.queue.getCurrent(guildId);

    if (!current) {
      logger.debug(
        `No current track: guild=${guildId}`,
      );
      return;
    }

    const loop = this.queue.getLoop(guildId);

    // Repeat the current track.
    if (loop === "track") {
      try {
        await this.startTrack(
          guildId,
          current,
        );

        return;
      } catch (error) {
        logger.error(
          `Failed to repeat track: guild=${guildId}`,
        );
      }
    }

    // Queue loop puts the finished track at the end.
    if (loop === "queue") {
      this.queue.enqueue(
        guildId,
        current.track,
        current.requestedBy,
      );
    }

    let next = this.queue.dequeue(guildId);

    /*
     * SMART AUTOPLAY
     *
     * When the queue becomes empty, generate related tracks
     * from the track that just finished.
     */
    if (!next && this.isAutoplayEnabled(guildId)) {
      logger.debug(
        `Autoplay triggered: guild=${guildId} seed="${current.track.info.title}"`,
      );

      const added = await this.fillAutoplayQueue(
        guildId,
        current.track,
      );

      if (added > 0) {
        next = this.queue.dequeue(guildId);
      }
    }


    if (!next) {
      this.queue.setCurrent(
        guildId,
        null,
      );

      logger.info(
        `Music queue empty: guild=${guildId}`,
      );

      return;
    }

    this.queue.addHistory(
      guildId,
      current,
    );

    this.queue.setCurrent(
      guildId,
      next,
    );

    try {
      await this.startTrack(
        guildId,
        next,
      );
    } catch (error) {
      logger.error(
        `Failed to start next track: guild=${guildId}`,
      );

      this.queue.setCurrent(
        guildId,
        null,
      );
    }
  }

  /*
   * =====================================================
   * PAUSE / RESUME
   * =====================================================
   */

  async pause(
    guildId: string,
  ): Promise<void> {
    const player =
      this.getPlayer(guildId);

    if (!player) {
      return;
    }

    await player.setPaused(true);
  }

  async resume(
    guildId: string,
  ): Promise<void> {
    const player =
      this.getPlayer(guildId);

    if (!player) {
      return;
    }

    await player.setPaused(false);
  }

  /*
   * =====================================================
   * SKIP
   * =====================================================
   */

  async skip(
    guildId: string,
  ): Promise<Track["info"] | null> {
    const player = this.getPlayer(guildId);

    if (!player) {
      return null;
    }

    const current = this.queue.getCurrent(guildId);

    if (!current) {
      return null;
    }

    const next = this.queue.dequeue(guildId);

    if (!next && this.isAutoplayEnabled(guildId)) {
      logger.debug(
        `Autoplay skip triggered: guild=${guildId} seed="${current.track.info.title}"`,
      );

      const added = await this.fillAutoplayQueue(
        guildId,
        current.track,
        "AshenAI Radio",
      );

      if (added > 0) {
        const radioNext = this.queue.dequeue(guildId);

        if (radioNext) {
          this.queue.setCurrent(
            guildId,
            radioNext,
          );

          this.manuallyStopped.add(guildId);

          await player.stopTrack();

          this.manuallyStopped.delete(guildId);

          await this.startTrack(
            guildId,
            radioNext,
          );

          return radioNext.track.info;
        }
      }
    }

    if (!next) {
      this.manuallyStopped.add(guildId);

      this.queue.setCurrent(
        guildId,
        null,
      );

      await player.stopTrack();

      return null;
    }

    this.queue.setCurrent(
      guildId,
      next,
    );

    this.manuallyStopped.add(guildId);

    await player.stopTrack();

    this.manuallyStopped.delete(guildId);

    await this.startTrack(
      guildId,
      next,
    );

    return next.track.info;
  }

  /*
   * =====================================================
   * STOP
   * =====================================================
   */

  async stop(
    guildId: string,
  ): Promise<void> {
    const player =
      this.getPlayer(guildId);

    this.manuallyStopped.add(
      guildId,
    );

    this.queue.clear(guildId);

    if (!player) {
      this.cleanupGuildMaps(guildId);
      return;
    }

    await player.stopTrack();
    this.cleanupGuildMaps(guildId);
  }

  /*
   * =====================================================
   * DISCONNECT
   * =====================================================
   */

  async disconnect(
    guildId: string,
  ): Promise<void> {
    this.manuallyStopped.add(
      guildId,
    );

    this.queue.clear(guildId);

    this.cleanupGuildMaps(guildId);

    await this.shoukaku.leaveVoiceChannel(
      guildId,
    );
  }

  /*
   * =====================================================
   * GUILD MAP CLEANUP
   * =====================================================
   */

  private cleanupGuildMaps(guildId: string): void {
    this.listenersAttached.delete(guildId);
    this.volumes.delete(guildId);
    this.autoplayEnabled.delete(guildId);
    this.manuallyStopped.delete(guildId);
  }

  /*
   * =====================================================
   * QUEUE ACCESS
   * =====================================================
   */

  getLoopMode(guildId: string): LoopMode {
    return this.queue.getLoop(guildId);
  }

  setLoopMode(
    guildId: string,
    mode: LoopMode,
  ): LoopMode {
    return this.queue.setLoop(guildId, mode);
  }

  cycleLoopMode(guildId: string): LoopMode {
    return this.queue.cycleLoop(guildId);
  }

  getQueue(
    guildId: string,
  ): QueuedTrack[] {
    return this.queue.getQueue(
      guildId,
    );
  }

  getCurrent(
    guildId: string,
  ): QueuedTrack | null {
    return this.queue.getCurrent(
      guildId,
    );
  }

  shuffleQueue(guildId: string): void {
    this.queue.shuffle(guildId);
  }

  removeFromQueue(
    guildId: string,
    index: number,
  ): QueuedTrack | null {
    return this.queue.remove(guildId, index);
  }

  moveInQueue(
    guildId: string,
    from: number,
    to: number,
  ): boolean {
    return this.queue.move(guildId, from, to);
  }

  clearUpcomingQueue(guildId: string): void {
    this.queue.clearQueue(guildId);
  }

  getQueueSize(
    guildId: string,
  ): number {
    return this.queue.size(
      guildId,
    );
  }

  clearQueue(
    guildId: string,
  ): void {
    this.queue.clear(guildId);
  }

  getPlayer(guildId: string) {
    return this.shoukaku.players.get(
      guildId,
    );
  }

  /*
   * =====================================================
   * PREVIOUS
   * =====================================================
   */

  async previous(
    guildId: string,
  ): Promise<Track["info"] | null> {
    const player = this.getPlayer(guildId);

    if (!player) {
      return null;
    }

    const previous =
      this.queue.popHistory(guildId);

    if (!previous) {
      return null;
    }

    const current =
      this.queue.getCurrent(guildId);

    if (current) {
      this.queue.enqueue(
        guildId,
        current.track,
        current.requestedBy,
      );
    }

    this.queue.setCurrent(
      guildId,
      previous,
    );

    this.manuallyStopped.add(guildId);

    await player.stopTrack();

    this.manuallyStopped.delete(guildId);

    await this.startTrack(
      guildId,
      previous,
    );

    return previous.track.info;
  }

  /*
   * =====================================================
   * SHUFFLE
   * =====================================================
   */

  shuffle(guildId: string): number {
    this.queue.shuffle(guildId);

    return this.queue.size(guildId);
  }

  /*
   * =====================================================
   * LOOP
   * =====================================================
   */

  getLoop(guildId: string): LoopMode {
    return this.queue.getLoop(guildId);
  }

  cycleLoop(guildId: string): LoopMode {
    return this.queue.cycleLoop(guildId);
  }

  /*
   * =====================================================
   * VOLUME
   * =====================================================
   */

  async setVolume(
    guildId: string,
    volume: number,
  ): Promise<number> {
    const player = this.getPlayer(guildId);

    if (!player) {
      throw new Error(
        "Music player is not connected.",
      );
    }

    const normalized = Math.max(
      0,
      Math.min(100, Math.round(volume)),
    );

    await player.setGlobalVolume(normalized);

    this.volumes.set(
      guildId,
      normalized,
    );

    return normalized;
  }

  getVolume(guildId: string): number {
    return this.volumes.get(guildId) ?? 100;
  }

  /*
   * =====================================================
   * QUERY NORMALIZATION
   * =====================================================
   */

  private normalizeQuery(
    query: string,
  ): string {
    const trimmed =
      query.trim();

    if (
      trimmed.startsWith(
        "http://",
      ) ||
      trimmed.startsWith(
        "https://",
      )
    ) {
      return trimmed;
    }

    return `scsearch:${trimmed}`;
  }
}
