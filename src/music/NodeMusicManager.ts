import { Player, GuildQueue, QueueRepeatMode } from "discord-player";
import { YoutubeiExtractor } from "discord-player-youtubei";
import type { Client } from "discord.js";
import { logger } from "../logger";
import {
  MusicQueueManager,
  type LoopMode,
  type QueuedTrack,
  type MusicTrack,
} from "./MusicQueueManager";

const URL_PATTERN = /^https?:\/\//i;
const SEARCH_PREFIX_PATTERN = /^(ytsearch|scsearch|spsearch|soundcloud:|youtube:|attachment):/i;

function isUrl(query: string): boolean {
  return URL_PATTERN.test(query.trim());
}

function hasSearchPrefix(query: string): boolean {
  return SEARCH_PREFIX_PATTERN.test(query.trim());
}

export class NodeMusicManager {
  public readonly player: Player;

  private readonly queue = new MusicQueueManager();

  private readonly volumes = new Map<string, number>();

  private readonly autoplayEnabled = new Map<string, boolean>();

  constructor(client: Client) {
    this.player = new Player(client);

    this.player.events.on("error", (queue, error) => {
      logger.error(`[Music] Error guild=${queue.id}: ${error.message}`);
    });

    this.player.events.on("playerError", (queue, error) => {
      logger.error(`[Music] Player error guild=${queue.id}: ${error.message}`);
    });

    this.player.events.on("audioTrackAdd", (queue, track) => {
      logger.debug(`[Music] Track added guild=${queue.id} title=${track.title}`);
    });

    this.player.events.on("emptyQueue", (queue) => {
      logger.debug(`[Music] Queue empty guild=${queue.id}`);
      this.handleQueueEmpty(queue.id);
    });

    this.player.events.on("playerFinish", (queue, track) => {
      logger.debug(`[Music] Track finished guild=${queue.id} title=${track.title}`);
      this.handleTrackFinished(queue, track);
    });

    logger.info("[Music] Node music manager initialized (discord-player)");
  }

  async init(): Promise<void> {
    try {
      await this.player.extractors.loadDefault((ext) => ext !== "YouTubeExtractor");
      logger.info("[Music] Default extractors loaded (excluding built-in YouTube)");
    } catch (error) {
      logger.error(`[Music] Failed to load default extractors: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      await this.player.extractors.register(YoutubeiExtractor, {});
      logger.info("[Music] YoutubeiExtractor registered (innertube API)");
    } catch (error) {
      logger.error(`[Music] Failed to register YoutubeiExtractor: ${error instanceof Error ? error.message : String(error)}`);
      logger.warn("[Music] Falling back to built-in extractors only");
    }
  }

  private getGuildQueue(guildId: string): GuildQueue | null {
    return this.player.nodes.get(guildId) ?? null;
  }

  private ensureGuildQueue(guildId: string, channelId: string, shardId = 0): GuildQueue {
    let q = this.player.nodes.get(guildId);
    if (!q) {
      q = this.player.nodes.create(guildId, {
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 60_000,
        leaveOnEnd: false,
        leaveOnStop: false,
        selfDeaf: true,
        metadata: { guildId, channelId },
      });
    }
    return q;
  }

  private toMusicTrack(track: any): MusicTrack {
    return {
      info: {
        title: track.title ?? "Unknown",
        author: track.author ?? "Unknown",
        uri: track.url ?? "",
        length: track.durationMS ?? 0,
        position: 0,
      },
    };
  }

  private resolveSearchQuery(query: string): string {
    const trimmed = query.trim();
    if (isUrl(trimmed) || hasSearchPrefix(trimmed)) {
      return trimmed;
    }
    return `ytsearch:${trimmed}`;
  }

  async play(
    guildId: string,
    channelId: string,
    query: string,
    requestedBy = "unknown",
    shardId = 0,
  ): Promise<MusicTrack["info"] | null> {
    const queue = this.ensureGuildQueue(guildId, channelId, shardId);
    const resolvedQuery = this.resolveSearchQuery(query);

    let searchResult;
    try {
      searchResult = await this.player.search(resolvedQuery, {
        requestedBy: undefined,
      });
    } catch (error) {
      logger.error(`[Music] Search failed guild=${guildId} query="${resolvedQuery}" error=${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!searchResult || !searchResult.hasTracks()) {
      logger.warn(`[Music] No results guild=${guildId} query="${resolvedQuery}"`);
      return null;
    }

    const track = searchResult.tracks[0];
    if (!track) {
      return null;
    }

    const current = this.queue.getCurrent(guildId);

    if (current) {
      const queued = this.queue.enqueue(guildId, this.toMusicTrack(track), requestedBy);
      logger.info(`[Music] Queued guild=${guildId} position=${this.queue.size(guildId)} title=${queued.track.info.title}`);
      return queued.track.info;
    }

    const item: QueuedTrack = {
      track: this.toMusicTrack(track),
      requestedBy,
      requestedAt: Date.now(),
    };

    this.queue.setCurrent(guildId, item);

    try {
      await queue.connect(channelId);
    } catch (error) {
      logger.error(`[Music] Voice connect failed guild=${guildId} channel=${channelId} error=${error instanceof Error ? error.message : String(error)}`);
      this.queue.setCurrent(guildId, null);
      return null;
    }

    queue.tracks.add(track);

    try {
      await queue.node.play(track);
      logger.info(`[Music] Playing guild=${guildId} title=${track.title} source=${track.source}`);
    } catch (error) {
      logger.error(`[Music] Playback failed guild=${guildId} title=${track.title} error=${error instanceof Error ? error.message : String(error)}`);
      this.queue.setCurrent(guildId, null);
      return null;
    }

    return item.track.info;
  }

  private handleTrackFinished(queue: GuildQueue, track: any): void {
    const guildId = queue.id;
    const current = this.queue.getCurrent(guildId);

    if (!current) {
      return;
    }

    const loop = this.queue.getLoop(guildId);

    if (loop === "track") {
      const dpTrack = queue.tracks.data[0] ?? null;
      if (dpTrack) {
        queue.node.play(dpTrack).catch((error) => {
          logger.error(`[Music] Loop-track replay failed guild=${guildId} error=${error instanceof Error ? error.message : String(error)}`);
        });
      }
      return;
    }

    if (loop === "queue") {
      this.queue.enqueue(guildId, current.track, current.requestedBy);
    }

    this.queue.addHistory(guildId, current);
    this.queue.setCurrent(guildId, null);

    const next = this.queue.dequeue(guildId);

    if (!next) {
      this.handleQueueEmpty(guildId);
      return;
    }

    this.queue.setCurrent(guildId, next);

    const dpTrack = queue.tracks.data[0] ?? null;
    if (dpTrack) {
      queue.node.play(dpTrack).catch((error) => {
        logger.error(`[Music] Auto-play failed guild=${guildId} error=${error instanceof Error ? error.message : String(error)}`);
        this.queue.setCurrent(guildId, null);
      });
    }
  }

  private handleQueueEmpty(guildId: string): void {
    if (!this.isAutoplayEnabled(guildId)) {
      return;
    }

    const current = this.queue.getCurrent(guildId);
    if (!current) {
      return;
    }

    this.fillAutoplayQueue(guildId, current.track);
  }

  private async fillAutoplayQueue(
    guildId: string,
    seed: MusicTrack,
    requestedBy = "AshenAI Radio",
  ): Promise<number> {
    const existing = new Set<string>();
    const artists = new Set<string>();

    const current = this.queue.getCurrent(guildId);
    if (current) {
      existing.add(this.trackKey(current.track));
      artists.add(current.track.info.author?.toLowerCase().trim() || "");
    }

    for (const item of this.queue.getQueue(guildId)) {
      existing.add(this.trackKey(item.track));
      artists.add(item.track.info.author?.toLowerCase().trim() || "");
    }

    for (const item of this.queue.getHistory(guildId)) {
      existing.add(this.trackKey(item.track));
    }

    const seedArtist = seed.info.author?.trim() || "";
    const seedTitle = seed.info.title?.trim() || "";

    const searches = [
      seedArtist,
      `${seedArtist} ${seedTitle}`,
      seedTitle,
      `${seedArtist} similar`,
      `${seedArtist} mix`,
    ].filter(Boolean);

    const added = new Set<string>();
    let addedCount = 0;
    const target = 8;

    for (const search of searches) {
      if (addedCount >= target) break;

      try {
        const resolvedQuery = this.resolveSearchQuery(search);
        const result = await this.player.search(resolvedQuery, { requestedBy: undefined });
        if (!result || !result.hasTracks()) continue;

        for (const candidate of result.tracks) {
          if (addedCount >= target) break;

          const key = `${candidate.url?.toLowerCase().trim() || `${candidate.author}::${candidate.title}`.toLowerCase().trim()}`;

          if (existing.has(key) || added.has(key)) continue;

          const artist = candidate.author?.toLowerCase().trim() || "";
          if (artist && artists.has(artist) && addedCount < 4) continue;

          const musicTrack = this.toMusicTrack(candidate);
          this.queue.enqueue(guildId, musicTrack, requestedBy);

          added.add(key);
          existing.add(key);
          if (artist) artists.add(artist);
          addedCount++;

          logger.debug(`[Music] Radio add guild=${guildId} title=${candidate.title}`);
        }
      } catch (error) {
        logger.error(`[Music] Radio search failed guild=${guildId} query="${search}" error=${error instanceof Error ? error.message : String(error)}`);
      }
    }

    logger.info(`[Music] Radio filled guild=${guildId} added=${addedCount} queue=${this.queue.size(guildId)}`);
    return addedCount;
  }

  private trackKey(track: MusicTrack): string {
    return (
      track.info.uri?.toLowerCase().trim() ||
      `${track.info.author}::${track.info.title}`.toLowerCase().trim()
    );
  }

  isAutoplayEnabled(guildId: string): boolean {
    return this.autoplayEnabled.get(guildId) ?? true;
  }

  setAutoplay(guildId: string, enabled: boolean): boolean {
    this.autoplayEnabled.set(guildId, enabled);
    return enabled;
  }

  async pause(guildId: string): Promise<void> {
    const queue = this.getGuildQueue(guildId);
    if (!queue) return;
    queue.node.pause();
  }

  async resume(guildId: string): Promise<void> {
    const queue = this.getGuildQueue(guildId);
    if (!queue) return;
    queue.node.resume();
  }

  async skip(guildId: string): Promise<MusicTrack["info"] | null> {
    const queue = this.getGuildQueue(guildId);
    if (!queue) return null;

    const current = this.queue.getCurrent(guildId);
    if (!current) return null;

    this.queue.addHistory(guildId, current);
    this.queue.setCurrent(guildId, null);

    const next = this.queue.dequeue(guildId);

    if (!next && this.isAutoplayEnabled(guildId)) {
      const added = await this.fillAutoplayQueue(guildId, current.track);
      if (added > 0) {
        const radioNext = this.queue.dequeue(guildId);
        if (radioNext) {
          this.queue.setCurrent(guildId, radioNext);
          queue.node.stop();
          const dpTrack = queue.tracks.data[0] ?? null;
          if (dpTrack) {
            try {
              await queue.node.play(dpTrack);
            } catch (error) {
              logger.error(`[Music] Auto-play failed guild=${guildId} error=${error instanceof Error ? error.message : String(error)}`);
              this.queue.setCurrent(guildId, null);
            }
          }
          return radioNext.track.info;
        }
      }
    }

    if (!next) {
      queue.node.stop();
      return null;
    }

    this.queue.setCurrent(guildId, next);
    queue.node.stop();
    const dpTrack = queue.tracks.data[0] ?? null;
    if (dpTrack) {
      try {
        await queue.node.play(dpTrack);
      } catch (error) {
        logger.error(`[Music] Skip-play failed guild=${guildId} error=${error instanceof Error ? error.message : String(error)}`);
        this.queue.setCurrent(guildId, null);
      }
    }
    return next.track.info;
  }

  async stop(guildId: string): Promise<void> {
    const queue = this.getGuildQueue(guildId);
    this.queue.clear(guildId);
    if (!queue) return;
    queue.node.stop();
    this.cleanupGuildMaps(guildId);
  }

  async disconnect(guildId: string): Promise<void> {
    this.queue.clear(guildId);
    this.cleanupGuildMaps(guildId);
    const queue = this.getGuildQueue(guildId);
    if (!queue) return;
    queue.node.stop();
    queue.delete();
  }

  private cleanupGuildMaps(guildId: string): void {
    this.volumes.delete(guildId);
    this.autoplayEnabled.delete(guildId);
  }

  getLoopMode(guildId: string): LoopMode {
    return this.queue.getLoop(guildId);
  }

  setLoopMode(guildId: string, mode: LoopMode): LoopMode {
    const queue = this.getGuildQueue(guildId);
    if (queue) {
      queue.setRepeatMode(
        mode === "off"
          ? QueueRepeatMode.OFF
          : mode === "track"
            ? QueueRepeatMode.TRACK
            : QueueRepeatMode.QUEUE,
      );
    }
    return this.queue.setLoop(guildId, mode);
  }

  cycleLoopMode(guildId: string): LoopMode {
    return this.queue.cycleLoop(guildId);
  }

  getQueue(guildId: string): QueuedTrack[] {
    return this.queue.getQueue(guildId);
  }

  getCurrent(guildId: string): QueuedTrack | null {
    return this.queue.getCurrent(guildId);
  }

  shuffleQueue(guildId: string): void {
    this.queue.shuffle(guildId);
  }

  removeFromQueue(guildId: string, index: number): QueuedTrack | null {
    return this.queue.remove(guildId, index);
  }

  moveInQueue(guildId: string, from: number, to: number): boolean {
    return this.queue.move(guildId, from, to);
  }

  clearUpcomingQueue(guildId: string): void {
    this.queue.clearQueue(guildId);
  }

  getQueueSize(guildId: string): number {
    return this.queue.size(guildId);
  }

  clearQueue(guildId: string): void {
    this.queue.clear(guildId);
  }

  getPlayer(guildId: string) {
    return this.getGuildQueue(guildId);
  }

  async previous(guildId: string): Promise<MusicTrack["info"] | null> {
    const queue = this.getGuildQueue(guildId);
    if (!queue) return null;

    const previous = this.queue.popHistory(guildId);
    if (!previous) return null;

    const current = this.queue.getCurrent(guildId);
    if (current) {
      this.queue.enqueue(guildId, current.track, current.requestedBy);
    }

    this.queue.setCurrent(guildId, previous);

    queue.node.stop();
    const dpTrack = queue.tracks.data[0] ?? null;
    if (dpTrack) {
      try {
        await queue.node.play(dpTrack);
      } catch (error) {
        logger.error(`[Music] Previous-play failed guild=${guildId} error=${error instanceof Error ? error.message : String(error)}`);
        this.queue.setCurrent(guildId, null);
      }
    }

    return previous.track.info;
  }

  shuffle(guildId: string): number {
    this.queue.shuffle(guildId);
    return this.queue.size(guildId);
  }

  getLoop(guildId: string): LoopMode {
    return this.queue.getLoop(guildId);
  }

  cycleLoop(guildId: string): LoopMode {
    return this.queue.cycleLoop(guildId);
  }

  async setVolume(guildId: string, volume: number): Promise<number> {
    const queue = this.getGuildQueue(guildId);
    if (!queue) {
      throw new Error("Music player is not connected.");
    }

    const normalized = Math.max(0, Math.min(100, Math.round(volume)));
    queue.node.setVolume(normalized);
    this.volumes.set(guildId, normalized);
    return normalized;
  }

  getVolume(guildId: string): number {
    return this.volumes.get(guildId) ?? 100;
  }
}
