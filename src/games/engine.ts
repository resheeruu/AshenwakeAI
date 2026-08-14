import crypto from "crypto";
import { GameSession } from "./types";

const sessions = new Map<string, GameSession>();

const SESSION_TIME = 10 * 60 * 1000;

export function createSession(
  game: string,
  playerIds: string[],
  state: Record<string, unknown> = {},
): GameSession {
  const now = Date.now();

  const session: GameSession = {
    id: crypto.randomUUID(),
    game,
    playerIds,
    createdAt: now,
    expiresAt: now + SESSION_TIME,
    state,
  };

  sessions.set(session.id, session);

  return session;
}

export function getSession(
  sessionId: string,
): GameSession | undefined {
  const session = sessions.get(sessionId);

  if (!session) {
    return undefined;
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return undefined;
  }

  return session;
}

export function updateSession(
  session: GameSession,
): void {
  sessions.set(session.id, session);
}

export function deleteSession(
  sessionId: string,
): void {
  sessions.delete(sessionId);
}

export function cleanupSessions(): void {
  const now = Date.now();

  for (const [id, session] of sessions) {
    if (now > session.expiresAt) {
      sessions.delete(id);
    }
  }
}

setInterval(cleanupSessions, 60_000).unref();
