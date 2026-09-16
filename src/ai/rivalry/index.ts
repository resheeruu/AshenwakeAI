/* ================================================================
 * RIVALRY MODULE
 *
 * Interactive participant detection and rivalry system.
 * Extends existing architecture — no duplicates.
 * ================================================================ */

export type {
  Participant,
  ParticipantClassification,
  RivalrySession,
  RivalryTurn,
  RivalryTrigger,
  RivalryConfig,
  RivalrySessionStatus,
  ChallengeDomain,
} from "./types";

export { DEFAULT_RIVALRY_CONFIG } from "./types";

export {
  classifyParticipant,
  reclassifyFromResponse,
} from "./classifier";

export {
  detectRivalryIntent,
  isAshenAIMentioned,
  extractMentionedIds,
  isRefusal,
  isEndRivalryIntent,
} from "./detector";

export {
  createSession,
  getActiveSession,
  isOpponent,
  recordAshenAITurn,
  recordOpponentTurn,
  endSession,
  getNextChallenge,
  isOpponentTimedOut,
  getActiveSessionCount,
  startSessionCleanup,
  stopSessionCleanup,
} from "./session-manager";

export {
  generateOpeningChallenge,
  generateChallenge,
  generateRoast,
  generateAcknowledgment,
  generateRefusalResponse,
  generateWaitingResponse,
  generateSessionEnd,
  classifyOpponentResponse,
  buildRivalrySystemPrompt,
} from "./response-generator";
