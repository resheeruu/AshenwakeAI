import type { Guild, GuildMember } from "discord.js";
import { logger } from "../logger";

export interface MusicSession {
  guildId: string;
  voiceChannelId: string;
  ownerId: string;
  djIds: Set<string>;
  createdAt: number;
  emptySince: number | null;
  emptyTimer: ReturnType<typeof setTimeout> | null;
}

export class MusicSessionManager {
  private sessions = new Map<string, MusicSession>();

  constructor(
    private readonly emptyTimeoutMs = 60_000,
    private readonly onEmptyTimeout?: (
      session: MusicSession,
    ) => Promise<void> | void,
  ) {}

  createOrGet(
    guild: Guild,
    voiceChannelId: string,
    ownerId: string,
  ): MusicSession {
    const existing = this.sessions.get(guild.id);

    if (existing) {
      // Never silently move an active music session to another
      // voice channel. The session keeps ownership of its original
      // music channel until it is explicitly disconnected.
      if (existing.voiceChannelId !== voiceChannelId) {
        return existing;
      }

      this.cancelEmptyTimer(existing);

      return existing;
    }

    const session: MusicSession = {
      guildId: guild.id,
      voiceChannelId,
      ownerId,
      djIds: new Set([ownerId]),
      createdAt: Date.now(),
      emptySince: null,
      emptyTimer: null,
    };

    this.sessions.set(guild.id, session);

    return session;
  }

  get(guildId: string): MusicSession | undefined {
    return this.sessions.get(guildId);
  }

  delete(guildId: string): void {
    const session = this.sessions.get(guildId);

    if (!session) {
      return;
    }

    this.cancelEmptyTimer(session);
    this.sessions.delete(guildId);
  }

  isOwner(guildId: string, userId: string): boolean {
    return this.sessions.get(guildId)?.ownerId === userId;
  }

  isDJ(guildId: string, userId: string): boolean {
    const session = this.sessions.get(guildId);

    if (!session) {
      return false;
    }

    return (
      session.ownerId === userId ||
      session.djIds.has(userId)
    );
  }

  claim(
    guildId: string,
    userId: string,
  ): boolean {
    const session = this.sessions.get(guildId);

    if (!session) {
      return false;
    }

    session.ownerId = userId;
    session.djIds.add(userId);

    return true;
  }

  addDJ(
    guildId: string,
    userId: string,
  ): boolean {
    const session = this.sessions.get(guildId);

    if (!session) {
      return false;
    }

    session.djIds.add(userId);

    return true;
  }

  removeDJ(
    guildId: string,
    userId: string,
  ): boolean {
    const session = this.sessions.get(guildId);

    if (!session || session.ownerId === userId) {
      return false;
    }

    session.djIds.delete(userId);

    return true;
  }

  markChannelOccupied(
    guildId: string,
  ): void {
    const session = this.sessions.get(guildId);

    if (!session) {
      return;
    }

    session.emptySince = null;
    this.cancelEmptyTimer(session);
  }

  markChannelEmpty(
    guild: Guild,
    guildId: string,
  ): void {
    const session = this.sessions.get(guildId);

    if (!session || session.emptyTimer) {
      return;
    }

    session.emptySince = Date.now();

    session.emptyTimer = setTimeout(
      async () => {
        const current = this.sessions.get(guildId);

        if (!current) {
          return;
        }

        current.emptyTimer = null;

        try {
          await this.onEmptyTimeout?.(current);
        } finally {
          this.delete(guildId);
        }
      },
      this.emptyTimeoutMs,
    );

    logger.info(
      `Music empty: guild=${guild.id} auto-disconnect in ${this.emptyTimeoutMs / 1000}s`,
    );
  }

  cancelEmptyTimer(
    session: MusicSession,
  ): void {
    if (session.emptyTimer) {
      clearTimeout(session.emptyTimer);
      session.emptyTimer = null;
    }

    session.emptySince = null;
  }

  getSnapshot(guildId: string) {
    const session = this.sessions.get(guildId);

    if (!session) {
      return null;
    }

    return {
      guildId: session.guildId,
      voiceChannelId: session.voiceChannelId,
      ownerId: session.ownerId,
      djIds: [...session.djIds],
      createdAt: session.createdAt,
      emptySince: session.emptySince,
    };
  }

  userCanControl(
    guildId: string,
    userId: string,
  ): boolean {
    return this.isDJ(guildId, userId);
  }

  userCanRequest(
    guild: Guild,
    userId: string,
  ): boolean {
    const session = this.sessions.get(guild.id);

    if (!session) {
      return false;
    }

    const member = guild.members.cache.get(userId);

    if (!member) {
      return false;
    }

    return member.voice.channelId === session.voiceChannelId;
  }
}
