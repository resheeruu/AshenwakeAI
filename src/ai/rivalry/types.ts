/* ================================================================
 * RIVALRY TYPES
 *
 * Domain types for interactive participant detection and rivalry.
 * No new architecture — extends existing systems.
 * ================================================================ */

export type ParticipantClassification =
  | "HUMAN"
  | "DISCORD_BOT"
  | "AI_PERSONA"
  | "FICTIONAL_PERSONA"
  | "UNKNOWN";

export interface Participant {
  id: string;
  discordUserId: string;
  displayName: string;
  discordBot: boolean;
  classification: ParticipantClassification;
  classificationConfidence: number;
  evidence: string[];
}

export type RivalrySessionStatus =
  | "active"
  | "ended_limit"
  | "ended_timeout"
  | "ended_refusal"
  | "ended_human"
  | "ended_error";

export type ChallengeDomain =
  | "reasoning"
  | "coding"
  | "knowledge"
  | "creativity"
  | "humor"
  | "problem_solving"
  | "consistency"
  | "response_quality";

export interface RivalryTurn {
  turnNumber: number;
  speaker: "ashenai" | "opponent";
  content: string;
  timestamp: number;
  challengeDomain?: ChallengeDomain;
}

export interface RivalrySession {
  id: string;
  guildId: string;
  channelId: string;
  initiatorUserId: string;
  ashenAIId: string;
  opponentId: string;
  opponentDisplayName: string;
  opponentClassification: ParticipantClassification;
  turn: number;
  maxTurns: number;
  startedAt: number;
  expiresAt: number;
  status: RivalrySessionStatus;
  turns: RivalryTurn[];
  usedChallenges: ChallengeDomain[];
  lastOpponentResponse: number;
  reason?: string;
}

export interface RivalryTrigger {
  isRivalry: boolean;
  isMentionTrigger: boolean;
  targetBotIds: string[];
  rivalryKeywords: string[];
  confidence: number;
}

export interface RivalryConfig {
  maxTurns: number;
  sessionDurationMs: number;
  opponentResponseTimeoutMs: number;
}

export const DEFAULT_RIVALRY_CONFIG: RivalryConfig = {
  maxTurns: 10,
  sessionDurationMs: 10 * 60 * 1000,
  opponentResponseTimeoutMs: 2 * 60 * 1000,
};
