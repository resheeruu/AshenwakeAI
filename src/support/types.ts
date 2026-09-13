export type CaseType = "support" | "report" | "appeal";

export type CaseStatus =
  | "open"
  | "investigating"
  | "waiting_user"
  | "waiting_staff"
  | "escalated"
  | "resolved"
  | "closed";

export const VALID_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ["investigating", "waiting_user", "waiting_staff", "escalated", "resolved"],
  investigating: ["waiting_user", "waiting_staff", "escalated", "resolved"],
  waiting_user: ["investigating", "waiting_staff", "escalated", "resolved"],
  waiting_staff: ["investigating", "waiting_user", "escalated", "resolved"],
  escalated: ["investigating", "resolved"],
  resolved: ["closed"],
  closed: [],
};

export interface AiCase {
  id: string;
  guildId: string;
  channelId: string;
  type: CaseType;
  status: CaseStatus;
  creatorId: string;
  subjectUserId?: string;
  assignedStaffId?: string;
  summary?: string;
  aiAnalysis?: CaseAnalysis;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface CaseAnalysis {
  conclusion?: string;
  confidence?: number;
  facts: string[];
  evidence: string[];
  userClaim?: string;
  aiInterpretation?: string;
  recommendation?: string;
  evidenceMessageIds: string[];
  analyzedAt: number;
}

export interface CaseMessage {
  id: string;
  caseId: string;
  authorId: string;
  content: string;
  isAi: boolean;
  createdAt: number;
}

export interface CaseEvidence {
  id: string;
  caseId: string;
  messageId: string;
  authorId: string;
  authorName?: string;
  content?: string;
  channelId?: string;
  channelName?: string;
  messageUrl?: string;
  attachmentUrls?: string[];
  collectedBy: string;
  createdAt: number;
}

export interface SupportConfig {
  enabled: boolean;
  channelId?: string;
  categoryId?: string;
  allowGeneralHelp: boolean;
  allowReports: boolean;
  allowAppeals: boolean;
}

export interface ReportConfig {
  enabled: boolean;
  categoryId?: string;
  requireEvidence: boolean;
  aiAnalysisEnabled: boolean;
  autoEscalateHighRisk: boolean;
}

export interface AppealConfig {
  enabled: boolean;
  categoryId?: string;
  aiAnalysisEnabled: boolean;
}

export interface SupportLoggingConfig {
  enabled: boolean;
  channelId?: string;
  includeModeration: boolean;
  includeTickets: boolean;
  includeReports: boolean;
  includeAppeals: boolean;
  includeAiActions: boolean;
}

export interface StaffConfig {
  roleIds: string[];
}

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function formatCaseId(id: string): string {
  return id.toUpperCase();
}
