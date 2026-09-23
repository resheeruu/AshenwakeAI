"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var session_manager_exports = {};
__export(session_manager_exports, {
  createSession: () => createSession,
  endSession: () => endSession,
  getActiveSession: () => getActiveSession,
  getActiveSessionCount: () => getActiveSessionCount,
  getNextChallenge: () => getNextChallenge,
  isOpponent: () => isOpponent,
  isOpponentTimedOut: () => isOpponentTimedOut,
  recordAshenAITurn: () => recordAshenAITurn,
  recordOpponentTurn: () => recordOpponentTurn,
  startSessionCleanup: () => startSessionCleanup,
  stopSessionCleanup: () => stopSessionCleanup
});
module.exports = __toCommonJS(session_manager_exports);
var import_node_crypto = require("node:crypto");
var import_logger = require("../../logger");
var import_types = require("./types");
const activeSessions = /* @__PURE__ */ new Map();
const SESSION_CLEANUP_INTERVAL_MS = 6e4;
const MAX_SESSIONS_PER_USER = 2;
function createSession(params) {
  const userSessionCount = [...activeSessions.values()].filter(
    (s) => s.initiatorUserId === params.initiatorUserId && s.status === "active"
  ).length;
  if (userSessionCount >= MAX_SESSIONS_PER_USER) {
    import_logger.logger.warn(
      `\u2694\uFE0F Rivalry session limit reached for user ${params.initiatorUserId} (${userSessionCount}/${MAX_SESSIONS_PER_USER})`
    );
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
      lastOpponentResponse: Date.now()
    };
  }
  const cfg = {
    ...import_types.DEFAULT_RIVALRY_CONFIG,
    ...params.config
  };
  const now = Date.now();
  const session = {
    id: (0, import_node_crypto.randomUUID)(),
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
    lastOpponentResponse: now
  };
  const channelKey = `${params.guildId}:${params.channelId}`;
  activeSessions.set(channelKey, session);
  import_logger.logger.info(
    `\u2694\uFE0F Rivalry session created: ${session.id} guild=${params.guildId} channel=${params.channelId} opponent=${params.opponent.displayName} (${params.opponent.classification})`
  );
  return session;
}
function getActiveSession(guildId, channelId) {
  const key = `${guildId}:${channelId}`;
  const session = activeSessions.get(key);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    session.status = "ended_timeout";
    session.reason = "session_expired";
    activeSessions.delete(key);
    import_logger.logger.info(
      `\u2694\uFE0F Rivalry session expired: ${session.id}`
    );
    return null;
  }
  if (session.status !== "active") {
    activeSessions.delete(key);
    return null;
  }
  return session;
}
function isOpponent(guildId, channelId, userId) {
  const session = getActiveSession(guildId, channelId);
  return session?.opponentId === userId;
}
function recordAshenAITurn(session, content, challengeDomain) {
  session.turn++;
  const turn = {
    turnNumber: session.turn,
    speaker: "ashenai",
    content,
    timestamp: Date.now(),
    challengeDomain
  };
  session.turns.push(turn);
  if (challengeDomain) {
    session.usedChallenges.push(challengeDomain);
  }
  return turn;
}
function recordOpponentTurn(session, content) {
  if (session.status !== "active") return null;
  if (session.turn >= session.maxTurns) {
    session.status = "ended_limit";
    session.reason = "max_turns_reached";
    import_logger.logger.info(
      `\u2694\uFE0F Rivalry session ended (limit): ${session.id} turns=${session.turn}`
    );
    return null;
  }
  const lastTurn = session.turns[session.turns.length - 1];
  if (lastTurn && lastTurn.speaker === "opponent" && lastTurn.content === content) {
    return null;
  }
  session.turn++;
  session.lastOpponentResponse = Date.now();
  const turn = {
    turnNumber: session.turn,
    speaker: "opponent",
    content,
    timestamp: Date.now()
  };
  session.turns.push(turn);
  return turn;
}
function endSession(guildId, channelId, reason, detail) {
  const key = `${guildId}:${channelId}`;
  const session = activeSessions.get(key);
  if (!session) return null;
  session.status = reason;
  session.reason = detail;
  activeSessions.delete(key);
  import_logger.logger.info(
    `\u2694\uFE0F Rivalry session ended: ${session.id} reason=${reason} detail=${detail ?? "none"}`
  );
  return session;
}
function getNextChallenge(session) {
  const allDomains = [
    "reasoning",
    "coding",
    "knowledge",
    "creativity",
    "humor",
    "problem_solving",
    "consistency",
    "response_quality"
  ];
  const unused = allDomains.filter(
    (d) => !session.usedChallenges.includes(d)
  );
  if (unused.length > 0) {
    return unused[0];
  }
  return allDomains[session.turn % allDomains.length];
}
function isOpponentTimedOut(session, timeoutMs) {
  return Date.now() - session.lastOpponentResponse > timeoutMs;
}
function getActiveSessionCount() {
  return activeSessions.size;
}
let cleanupTimer = null;
function startSessionCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of activeSessions) {
      if (now > session.expiresAt) {
        session.status = "ended_timeout";
        session.reason = "session_expired";
        activeSessions.delete(key);
        import_logger.logger.info(
          `\u2694\uFE0F Rivalry cleanup: expired session ${session.id}`
        );
      }
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}
function stopSessionCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createSession,
  endSession,
  getActiveSession,
  getActiveSessionCount,
  getNextChallenge,
  isOpponent,
  isOpponentTimedOut,
  recordAshenAITurn,
  recordOpponentTurn,
  startSessionCleanup,
  stopSessionCleanup
});
