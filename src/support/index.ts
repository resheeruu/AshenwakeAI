export { SupportCaseManager, getSupportCaseManager } from "./case-manager";
export type {
  AiCase,
  CaseType,
  CaseStatus,
  CaseMessage,
  CaseEvidence,
  CaseAnalysis,
  SupportConfig,
  ReportConfig,
  AppealConfig,
  SupportLoggingConfig,
  StaffConfig,
} from "./types";
export { canTransition, VALID_TRANSITIONS, formatCaseId } from "./types";
export {
  orchestrateCaseConversation,
  getConversationState,
  startConversationCleanup,
  stopConversationCleanup,
} from "./ai-orchestrator";
export type {
  CaseConversationState,
  CasePhase,
  CollectedInfo,
  CaseFlags,
  OrchestrationResult,
} from "./ai-orchestrator";
export {
  startSupportAutomation,
  stopSupportAutomation,
} from "./automation";
