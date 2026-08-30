export interface MusicTrack {
  info: {
    title: string;
    author: string;
    uri: string;
    length: number;
    position: number;
  };
}

export type LoopMode = "off" | "track" | "queue";

export interface QueuedTrack {
  track: MusicTrack;
  requestedBy: string;
  requestedAt: number;
}

export class MusicQueueManager {
  private queues = new Map<string, QueuedTrack[]>();
  private current = new Map<string, QueuedTrack>();
  private history = new Map<string, QueuedTrack[]>();
  private loopModes = new Map<string, LoopMode>();

  enqueue(
    guildId: string,
    track: MusicTrack,
    requestedBy: string,
  ): QueuedTrack {
    const item: QueuedTrack = {
      track,
      requestedBy,
      requestedAt: Date.now(),
    };

    const queue = this.queues.get(guildId) ?? [];
    queue.push(item);
    this.queues.set(guildId, queue);

    return item;
  }

  dequeue(guildId: string): QueuedTrack | null {
    const queue = this.queues.get(guildId);

    if (!queue || queue.length === 0) {
      return null;
    }

    return queue.shift() ?? null;
  }

  setCurrent(
    guildId: string,
    item: QueuedTrack | null,
  ): void {
    if (item) {
      this.current.set(guildId, item);
    } else {
      this.current.delete(guildId);
    }
  }

  getCurrent(guildId: string): QueuedTrack | null {
    return this.current.get(guildId) ?? null;
  }

  getQueue(guildId: string): QueuedTrack[] {
    return [...(this.queues.get(guildId) ?? [])];
  }

  size(guildId: string): number {
    return this.queues.get(guildId)?.length ?? 0;
  }

  addHistory(
    guildId: string,
    item: QueuedTrack,
  ): void {
    const history = this.history.get(guildId) ?? [];

    history.push(item);

    // Keep only the last 25 tracks.
    if (history.length > 25) {
      history.splice(0, history.length - 25);
    }

    this.history.set(guildId, history);
  }

  getHistory(guildId: string): QueuedTrack[] {
    return [...(this.history.get(guildId) ?? [])];
  }

  popHistory(guildId: string): QueuedTrack | null {
    const history = this.history.get(guildId);

    if (!history || history.length === 0) {
      return null;
    }

    return history.pop() ?? null;
  }

  shuffle(guildId: string): void {
    const queue = this.queues.get(guildId);

    if (!queue || queue.length < 2) {
      return;
    }

    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }

  getLoop(guildId: string): LoopMode {
    return this.loopModes.get(guildId) ?? "off";
  }

  setLoop(
    guildId: string,
    mode: LoopMode,
  ): LoopMode {
    if (mode === "off") {
      this.loopModes.delete(guildId);
    } else {
      this.loopModes.set(guildId, mode);
    }

    return mode;
  }

  cycleLoop(guildId: string): LoopMode {
    const current = this.getLoop(guildId);

    const next: LoopMode =
      current === "off"
        ? "track"
        : current === "track"
          ? "queue"
          : "off";

    return this.setLoop(guildId, next);
  }

  remove(
    guildId: string,
    index: number,
  ): QueuedTrack | null {
    const queue = this.queues.get(guildId);

    if (
      !queue ||
      index < 0 ||
      index >= queue.length
    ) {
      return null;
    }

    return queue.splice(index, 1)[0] ?? null;
  }

  move(
    guildId: string,
    from: number,
    to: number,
  ): boolean {
    const queue = this.queues.get(guildId);

    if (
      !queue ||
      from < 0 ||
      from >= queue.length ||
      to < 0 ||
      to >= queue.length
    ) {
      return false;
    }

    const [item] = queue.splice(from, 1);

    if (!item) {
      return false;
    }

    queue.splice(to, 0, item);

    return true;
  }

  clearQueue(guildId: string): void {
    this.queues.delete(guildId);
  }

  clearHistory(guildId: string): void {
    this.history.delete(guildId);
  }

  clear(guildId: string): void {
    this.queues.delete(guildId);
    this.current.delete(guildId);
    this.history.delete(guildId);
    this.loopModes.delete(guildId);
  }
}
