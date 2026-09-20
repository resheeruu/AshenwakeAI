/* ================================================================
 * RIVALRY SESSION MANAGER
 *
 * Manages rivalry session lifecycle, turn tracking, and loop protection.
 * Reuses existing AI-to-AI concepts without creating duplicate systems.
 *
 * Key constraints:
 * - Human must initiate every rivalry
 * - Max turns enforced
 * - Session timeout enforced
 * - Opponent response timeout enforced
 * - No duplicate responses
 * ================================================================ */

import { randomUUID } from "node:crypto";
import { logger } from "../../logger";
import type {
  RivalrySession,
  RivalryTurn,
  RivalryConfig,
  Participant,
  ParticipantClassification,
  ChallengeDomain,
} from "./types";
import { DEFAULT_RIVALRY_CONFIG } from "./types";

const activeSessions = new Map<string, RivalrySession>();
const SESSION_CLEANUP_INTERVAL_MS = 60_000;
const MAX_SESSIONS_PER_USER = 2;

/**
 * Create a new rivalry session.
 * Only valid when a human explicitly initiates.
 */
export function createSession(params: {
  guildId: string;
  channelId: string;
  initiatorUserId: string;
  ashenAIId: string;
  opponent: Participant;
  config?: Partial<RivalryConfig>;
}): RivalrySession {
  // Per-user session limit: prevent a user from creating too many concurrent sessions
  const userSessionCount = [...activeSessions.values()].filter(
    (s) => s.initiatorUserId === params.initiatorUserId && s.status === "active"
  ).length;
  if (userSessionCount >= MAX_SESSIONS_PER_USER) {
    logger.warn(
      `⚔️ Rivalry session limit reached for user ${params.initiatorUserId} (${userSessionCount}/${MAX_SESSIONS_PER_USER})`
    );
    // Return a dummy session that signals rejection — caller checks .status
    return {
      id: "rejected",
      guildId: params.guildId,
      channelId: params.channelId,
      initiatorUserId: params.initiatorUserId,
      ashenAIId: params.ashenAIId,
      opponentId: params.opponent.discordUserId,
      opponentDisplayName: params.opponent.displayName,
      opponentClassification: params.opponent.classification,
      turn: 0,
      maxTurns: 0,
      startedAt: Date.now(),
      expiresAt: Date.now(),
      status: "ended_error",
      turns: [],
      usedChallenges: [],
      lastOpponentResponse: Date.now(),
    };
  }

  const cfg = {
    ...DEFAULT_RIVALRY_CONFIG,
    ...params.config,
  };

  const now = Date.now();
  const session: RivalrySession = {
    id: randomUUID(),
    guildId: params.guildId,
    channelId: params.channelId,
    initiatorUserId: params.initiatorUserId,
    ashenAIId: params.ashenAIId,
    opponentId: params.opponent.discordUserId,
    opponentDisplayName: params.opponent.displayName,
    opponentClassification: params.opponent.classification,
    turn: 0,
    maxTurns: cfg.maxTurns,
    startedAt: now,
    expiresAt: now + cfg.sessionDurationMs,
    status: "active",
    turns: [],
    usedChallenges: [],
    lastOpponentResponse: now,
  };

  // Store keyed by channel (one active rivalry per channel)
  const channelKey = `${params.guildId}:${params.channelId}`;
  activeSessions.set(channelKey, session);

  logger.info(
    `⚔️ Rivalry session created: ${session.id} guild=${params.guildId} channel=${params.channelId} opponent=${params.opponent.displayName} (${params.opponent.classification})`
  );

  return session;
}

/**
 * Get the active session for a channel.
 */
export function getActiveSession(
  guildId: string,
  channelId: string
): RivalrySession | null {
  const key = `${guildId}:${channelId}`;
  const session = activeSessions.get(key);

  if (!session) return null;

  // Check expiry
  if (Date.now() > session.expiresAt) {
    session.status = "ended_timeout";
    session.reason = "session_expired";
    activeSessions.delete(key);
    logger.info(
      `⚔️ Rivalry session expired: ${session.id}`
    );
    return null;
  }

  // Check if already ended
  if (session.status !== "active") {
    activeSessions.delete(key);
    return null;
  }

  return session;
}

/**
 * Check if a user ID is the opponent in an active session.
 */
export function isOpponent(
  guildId: string,
  channelId: string,
  userId: string
): boolean {
  const session = getActiveSession(guildId, channelId);
  return session?.opponentId === userId;
}

/**
 * Record an AshenAI turn.
 */
export function recordAshenAITurn(
  session: RivalrySession,
  content: string,
  challengeDomain?: ChallengeDomain
): RivalryTurn {
  session.turn++;
  const turn: RivalryTurn = {
    turnNumber: session.turn,
    speaker: "ashenai",
    content,
    timestamp: Date.now(),
    challengeDomain,
  };
  session.turns.push(turn);

  if (challengeDomain) {
    session.usedChallenges.push(challengeDomain);
  }

  return turn;
}

/**
 * Record an opponent turn.
 * Returns null if the session has ended or the opponent's response is stale.
 */
export function recordOpponentTurn(
  session: RivalrySession,
  content: string
): RivalryTurn | null {
  if (session.status !== "active") return null;

  // Check turn limit
  if (session.turn >= session.maxTurns) {
    session.status = "ended_limit";
    session.reason = "max_turns_reached";
    logger.info(
      `⚔️ Rivalry session ended (limit): ${session.id} turns=${session.turn}`
    );
    return null;
  }

  // Check for duplicate response
  const lastTurn = session.turns[session.turns.length - 1];
  if (
    lastTurn &&
    lastTurn.speaker === "opponent" &&
    lastTurn.content === content
  ) {
    return null;
  }

  session.turn++;
  session.lastOpponentResponse = Date.now();

  const turn: RivalryTurn = {
    turnNumber: session.turn,
    speaker: "opponent",
    content,
    timestamp: Date.now(),
  };
  session.turns.push(turn);

  return turn;
}

/**
 * End a session with a reason.
 */
export function endSession(
  guildId: string,
  channelId: string,
  reason: RivalrySession["status"],
  detail?: string
): RivalrySession | null {
  const key = `${guildId}:${channelId}`;
  const session = activeSessions.get(key);

  if (!session) return null;

  session.status = reason;
  session.reason = detail;
  activeSessions.delete(key);

  logger.info(
    `⚔️ Rivalry session ended: ${session.id} reason=${reason} detail=${detail ?? "none"}`
  );

  return session;
}

/**
 * Get the next challenge domain that hasn't been used yet.
 * Rotates through domains to keep the rivalry varied.
 */
export function getNextChallenge(
  session: RivalrySession
): ChallengeDomain {
  const allDomains: ChallengeDomain[] = [
    "reasoning",
    "coding",
    "knowledge",
    "creativity",
    "humor",
    "problem_solving",
    "consistency",
    "response_quality",
  ];

  // Find domains not yet used
  const unused = allDomains.filter(
    (d) => !session.usedChallenges.includes(d)
  );

  if (unused.length > 0) {
    return unused[0];
  }

  // All used — cycle from the beginning
  return allDomains[session.turn % allDomains.length];
}

/**
 * Check if opponent has timed out (no response within timeout).
 */
export function isOpponentTimedOut(
  session: RivalrySession,
  timeoutMs: number
): boolean {
  return (
    Date.now() - session.lastOpponentResponse > timeoutMs
  );
}

/**
 * Get the number of active sessions (for monitoring).
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * Periodic cleanup of expired sessions.
 */
let cleanupTimer: ReturnType<typeof setInterval> | null =
  null;

export function startSessionCleanup(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of activeSessions) {
      if (now > session.expiresAt) {
        session.status = "ended_timeout";
        session.reason = "session_expired";
        activeSessions.delete(key);
        logger.info(
          `⚔️ Rivalry cleanup: expired session ${session.id}`
        );
      }
    }
  }, SESSION_CLEANUP_INTERVAL_MS);

  cleanupTimer.unref();
}

export function stopSessionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
