import { logger } from "../logger";
import { recordAudit } from "../security/audit";
import { loadGuildConfig } from "../core/guild-config";
import { getSupportCaseManager } from "./case-manager";
import { getDatabase, safeDbOperation } from "../database/database";
import type { AiCase, CaseType, CaseStatus, CaseAnalysis, CaseEvidence } from "./types";
import { canTransition } from "./types";

/* ================================================================
 * AI SUPPORT ORCHESTRATOR
 *
 * Sits between the conversational agent and the case manager.
 * Drives AI-powered case conversations, evidence collection,
 * analysis, escalation, and staff copilot features.
 *
 * Flow:
 *   Message → Detect case channel → Load case context →
 *   AI conversation → Evidence collection → Analysis →
 *   Lifecycle management → Staff notification
 * ================================================================ */

/* ================================================================
 * CONVERSATION STATE (per case, persisted in DB)
 * ================================================================ */

export interface CaseConversationState {
  caseId: string;
  phase: CasePhase;
  collectedInfo: CollectedInfo;
  pendingQuestions: string[];
  lastAiResponse: number;
  lastUserMessage: number;
  interactionCount: number;
  flags: CaseFlags;
}

export type CasePhase =
  | "initial_greeting"
  | "info_collection"
  | "evidence_collection"
  | "analysis"
  | "staff_review"
  | "resolution"
  | "closed";

export interface CollectedInfo {
  // Report-specific
  reportedUserId?: string;
  reportedUserName?: string;
  claimedBehavior?: string;
  approximateTime?: string;
  relevantChannel?: string;
  reporterExplanation?: string;

  // Appeal-specific
  appellantId?: string;
  originalAction?: string;
  originalReason?: string;
  appealReason?: string;
  supportingInfo?: string;

  // General
  subjectUser?: string;
  description?: string;
  additionalContext?: string;
}

export interface CaseFlags {
  needsEvidence: boolean;
  needsEscalation: boolean;
  highRisk: boolean;
  aiAnalysisComplete: boolean;
  staffNotified: boolean;
}

/* ================================================================
 * STAFF ROLE DETECTION
 * ================================================================ */

function getStaffRoleIds(guildId: string): string[] {
  const config = loadGuildConfig(guildId);
  return config.staff?.roleIds ?? [];
}

/* ================================================================
 * ORCHESTRATE CONVERSATION
 *
 * Main entry point. Called when a message arrives in a case channel.
 * Determines whether the sender is the case creator, staff, or neither,
 * and routes to the appropriate handler.
 * ================================================================ */

export interface OrchestrationResult {
  reply: string;
  shouldReply: boolean;
  caseUpdated: boolean;
  escalateToStaff: boolean;
  assignToStaff?: string;
  newStatus?: CaseStatus;
  evidence?: CaseEvidence[];
}

export async function orchestrateCaseConversation(
  caseId: string,
  channelId: string,
  userId: string,
  userName: string,
  content: string,
  guildId: string,
  mentionedUserIds: string[],
  options?: {
    isStaff?: boolean;
    discordMessageId?: string;
  },
): Promise<OrchestrationResult> {
  const caseManager = getSupportCaseManager();
  const aiCase = caseManager.getCase(caseId);

  if (!aiCase) {
    return {
      reply: "",
      shouldReply: false,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  // Guild isolation check
  if (aiCase.guildId !== guildId) {
    return {
      reply: "",
      shouldReply: false,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  // AI response deduplication: skip if this Discord message was already processed
  if (options?.discordMessageId) {
    const alreadyProcessed = safeDbOperation(() => {
      const db = getDatabase();
      const row = db.prepare(
        "SELECT 1 FROM support_case_messages WHERE discord_message_id = ? AND case_id = ?"
      ).get(options.discordMessageId, caseId);
      return !!row;
    }, false, `checkDuplicateMessage(${options.discordMessageId})`);

    if (alreadyProcessed) {
      // Already processed — return existing state without generating a new response
      return {
        reply: "",
        shouldReply: false,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }
  }

  // Load or initialize conversation state
  const convState = loadConversationState(caseId) || initializeConversationState(aiCase);

  // Stale data protection: reload case to ensure we're working with current state
  const currentCase = caseManager.getCase(caseId);
  if (!currentCase) {
    return {
      reply: "",
      shouldReply: false,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  // Determine sender role — use caller-provided isStaff if available,
  // otherwise fall back to checking assigned staff status
  const isCreator = currentCase.creatorId === userId;
  const isAssignedStaff = currentCase.assignedStaffId === userId;
  const isStaff = options?.isStaff ?? isAssignedStaff;

  // Staff copilot commands (staff-only)
  if (isStaff || isAssignedStaff) {
    const staffResult = await handleStaffInteraction(
      currentCase, convState, userId, userName, content, guildId
    );
    if (staffResult) {
      saveConversationState(caseId, convState);
      return staffResult;
    }
  }

  // If case is closed or resolved, no further conversation
  if (currentCase.status === "closed" || currentCase.status === "resolved") {
    return {
      reply: `This case has been **${currentCase.status}**. If you need further assistance, please create a new ticket.`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  // Record user message
  caseManager.addMessage(caseId, userId, content, false, options?.discordMessageId);
  convState.lastUserMessage = Date.now();
  convState.interactionCount++;

  // Route based on case type
  let result: OrchestrationResult;
  switch (currentCase.type) {
    case "report":
      result = await handleReportConversation(currentCase, convState, content, userId, guildId, mentionedUserIds);
      break;
    case "appeal":
      result = await handleAppealConversation(currentCase, convState, content, userId, guildId);
      break;
    case "support":
    default:
      result = await handleSupportConversation(currentCase, convState, content, userId, guildId);
      break;
  }

  // Record AI response
  if (result.reply) {
    caseManager.addMessage(caseId, "ai", result.reply, true);
    convState.lastAiResponse = Date.now();
  }

  // Update case summary if we collected new info
  if (result.caseUpdated) {
    updateCaseFromCollectedInfo(currentCase, convState);
  }

  saveConversationState(caseId, convState);

  // Log orchestration
  recordAudit({
    who: userId,
    whoName: userName,
    what: `Case ${caseId} interaction: phase=${convState.phase}`,
    where: "support-orchestrator",
    guildId,
    result: "success",
  });

  return result;
}

/* ================================================================
 * REPORT CONVERSATION
 * ================================================================ */

async function handleReportConversation(
  aiCase: AiCase,
  convState: CaseConversationState,
  content: string,
  userId: string,
  guildId: string,
  mentionedUserIds: string[],
): Promise<OrchestrationResult> {
  const lower = content.toLowerCase();
  const info = convState.collectedInfo;

  switch (convState.phase) {
    case "initial_greeting": {
      // If subject user was provided at creation, skip to behavior collection
      if (aiCase.subjectUserId) {
        info.reportedUserId = aiCase.subjectUserId;
        convState.phase = "info_collection";
        convState.pendingQuestions = ["claimed_behavior", "approximate_time"];
        return {
          reply: `I'll help you with your report. You're reporting <@${aiCase.subjectUserId}>.\n\nWhat behavior are you reporting them for?`,
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false,
        };
      }

      // Ask who is being reported
      convState.pendingQuestions = ["reported_user"];
      return {
        reply: "I'll help you file this report. **Who are you reporting?** Please mention them or provide their username.",
        shouldReply: true,
        caseUpdated: true,
        escalateToStaff: false,
      };
    }

    case "info_collection": {
      // Try to extract reported user from mentions
      if (convState.pendingQuestions.includes("reported_user")) {
        const mentioned = mentionedUserIds.find(id => id !== "ai");
        if (mentioned) {
          info.reportedUserId = mentioned;
          try {
            const member = await import("discord.js").then(d =>
              import("../logger").then(() => null) // placeholder
            );
            info.reportedUserName = mentioned;
          } catch {
            info.reportedUserName = mentioned;
          }
          convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "reported_user");
          convState.pendingQuestions.push("claimed_behavior");
        } else {
          // Try to extract from content
          const userMatch = content.match(/@(\w+)/);
          if (userMatch) {
            info.reportedUserName = userMatch[1];
            convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "reported_user");
            convState.pendingQuestions.push("claimed_behavior");
          } else {
            return {
              reply: "Please mention the user you're reporting (e.g., @username).",
              shouldReply: true,
              caseUpdated: false,
              escalateToStaff: false,
            };
          }
        }
      }

      // Collect claimed behavior
      if (convState.pendingQuestions.includes("claimed_behavior")) {
        info.claimedBehavior = content;
        convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "claimed_behavior");
        convState.pendingQuestions.push("approximate_time");
        return {
          reply: `Thank you. **What happened?** Please describe the behavior in detail.`,
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false,
        };
      }

      // Collect description/details
      if (convState.pendingQuestions.includes("description")) {
        info.description = content;
        convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "description");
        convState.pendingQuestions.push("evidence");
        return {
          reply: "Thank you for that detail. **Do you have any evidence?** This could be:\n• Message IDs\n• Screenshots\n• Links to messages\n• Channel names where it happened\n\nIf not, just say \"no\".",
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false,
        };
      }

      // Collect approximate time
      if (convState.pendingQuestions.includes("approximate_time")) {
        info.approximateTime = content;
        convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "approximate_time");
        convState.pendingQuestions.push("description");
        return {
          reply: "Got it. **Can you provide more details about what happened?** The more context you give, the better we can investigate.",
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false,
        };
      }

      // Collect evidence
      if (convState.pendingQuestions.includes("evidence")) {
        if (content.toLowerCase() !== "no" && content.toLowerCase() !== "none") {
          info.additionalContext = content;
        }
        convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "evidence");

        // Move to analysis phase
        convState.phase = "analysis";
        convState.flags.needsEvidence = false;

        // Generate AI analysis
        const analysis = generateReportAnalysis(aiCase, convState);

        return {
          reply: formatReportSummary(aiCase, convState, analysis),
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: true,
          newStatus: "waiting_staff",
          evidence: [],
        };
      }

      break;
    }

    case "analysis": {
      // User might be responding to analysis or adding more info
      if (/\b(more|add|also|forgot|update)\b/i.test(lower)) {
        convState.phase = "info_collection";
        convState.pendingQuestions = ["additional_info"];
        return {
          reply: "What additional information would you like to add?",
          shouldReply: true,
          caseUpdated: false,
          escalateToStaff: false,
        };
      }

      return {
        reply: "Your report has been submitted and is awaiting staff review. If you have additional evidence, you can add it here.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }

    case "staff_review":
    case "resolution": {
      return {
        reply: "Your report is being reviewed by staff. You'll be notified when there's an update.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }
  }

  return {
    reply: "",
    shouldReply: false,
    caseUpdated: false,
    escalateToStaff: false,
  };
}

/* ================================================================
 * APPEAL CONVERSATION
 * ================================================================ */

async function handleAppealConversation(
  aiCase: AiCase,
  convState: CaseConversationState,
  content: string,
  userId: string,
  guildId: string,
): Promise<OrchestrationResult> {
  const info = convState.collectedInfo;

  switch (convState.phase) {
    case "initial_greeting": {
      convState.phase = "info_collection";
      convState.pendingQuestions = ["appeal_reason"];
      return {
        reply: "I'll help you with your appeal. **Why do you believe the action should be reversed?**\n\nPlease provide:\n• The reason for your appeal\n• Any supporting information\n• Context that staff should consider",
        shouldReply: true,
        caseUpdated: true,
        escalateToStaff: false,
      };
    }

    case "info_collection": {
      if (convState.pendingQuestions.includes("appeal_reason")) {
        info.appealReason = content;
        convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "appeal_reason");
        convState.pendingQuestions.push("original_action");
        return {
          reply: "Thank you. **What was the original moderation action?** (e.g., ban, timeout, warn)\n\nIf you're not sure, just describe what happened.",
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false,
        };
      }

      if (convState.pendingQuestions.includes("original_action")) {
        info.originalAction = content;
        convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "original_action");
        convState.pendingQuestions.push("supporting_info");
        return {
          reply: "Got it. **Do you have any supporting information?** This could be:\n• Evidence that contradicts the original action\n• Context that wasn't considered\n• Changes in behavior\n\nIf not, just say \"no\".",
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false,
        };
      }

      if (convState.pendingQuestions.includes("supporting_info")) {
        if (content.toLowerCase() !== "no" && content.toLowerCase() !== "none") {
          info.supportingInfo = content;
        }
        convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "supporting_info");

        // Move to analysis phase
        convState.phase = "analysis";
        const analysis = generateAppealAnalysis(aiCase, convState);

        return {
          reply: formatAppealSummary(aiCase, convState, analysis),
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: true,
          newStatus: "waiting_staff",
        };
      }

      break;
    }

    case "analysis": {
      return {
        reply: "Your appeal has been submitted and is awaiting staff review. If you have additional information, you can add it here.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }

    case "staff_review":
    case "resolution": {
      return {
        reply: "Your appeal is being reviewed by staff. You'll be notified when there's an update.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }
  }

  return {
    reply: "",
    shouldReply: false,
    caseUpdated: false,
    escalateToStaff: false,
  };
}

/* ================================================================
 * GENERAL SUPPORT CONVERSATION
 * ================================================================ */

async function handleSupportConversation(
  aiCase: AiCase,
  convState: CaseConversationState,
  content: string,
  userId: string,
  guildId: string,
): Promise<OrchestrationResult> {
  const lower = content.toLowerCase();

  switch (convState.phase) {
    case "initial_greeting": {
      convState.phase = "info_collection";
      convState.pendingQuestions = ["issue_description"];
      return {
        reply: `Hello! I'm here to help. **Please describe your issue in detail.**\n\nThe more information you provide, the better I can assist you or escalate to the right person.`,
        shouldReply: true,
        caseUpdated: true,
        escalateToStaff: false,
      };
    }

    case "info_collection": {
      if (convState.pendingQuestions.includes("issue_description")) {
        convState.collectedInfo.description = content;
        convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "issue_description");

        // Check if this is a simple question we can answer
        if (isSimpleQuestion(lower)) {
          const answer = await handleSimpleQuery(content, guildId);
          if (answer) {
            convState.phase = "resolution";
            return {
              reply: answer,
              shouldReply: true,
              caseUpdated: true,
              escalateToStaff: false,
              newStatus: "resolved",
            };
          }
        }

        // Check if this needs escalation
        const shouldEscalate = detectEscalationNeeded(lower, convState.collectedInfo);
        if (shouldEscalate) {
          convState.flags.needsEscalation = true;
          convState.phase = "staff_review";
          return {
            reply: "Thank you for the details. This appears to require staff attention. I'm escalating this to our team now.\n\nA staff member will review your case shortly. You can continue adding information here if needed.",
            shouldReply: true,
            caseUpdated: true,
            escalateToStaff: true,
            newStatus: "escalated",
          };
        }

        convState.pendingQuestions.push("additional_context");
        return {
          reply: "I understand. **Is there any additional context you'd like to share?**\n\nFor example:\n• When did this start?\n• Have you tried any solutions?\n• Any error messages or screenshots?",
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false,
        };
      }

      if (convState.pendingQuestions.includes("additional_context")) {
        if (content.toLowerCase() !== "no" && content.toLowerCase() !== "none") {
          convState.collectedInfo.additionalContext = content;
        }
        convState.pendingQuestions = convState.pendingQuestions.filter(q => q !== "additional_context");

        // Escalate to staff
        convState.phase = "staff_review";
        convState.flags.needsEscalation = true;

        return {
          reply: "Thank you for the information. I'm escalating this to our support team.\n\n**What to expect:**\n• A staff member will review your case\n• You'll be notified when there's an update\n• You can continue adding information here\n\nIs there anything else you'd like to add before staff reviews this?",
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: true,
          newStatus: "waiting_staff",
        };
      }

      break;
    }

    case "analysis":
    case "staff_review": {
      return {
        reply: "Your case is being reviewed. You can continue adding information here if needed.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }

    case "resolution": {
      return {
        reply: "Your case has been resolved. If you need further assistance, please create a new ticket.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }
  }

  return {
    reply: "",
    shouldReply: false,
    caseUpdated: false,
    escalateToStaff: false,
  };
}

/* ================================================================
 * STAFF INTERACTION (Copilot)
 * ================================================================ */

async function handleStaffInteraction(
  aiCase: AiCase,
  convState: CaseConversationState,
  userId: string,
  userName: string,
  content: string,
  guildId: string,
): Promise<OrchestrationResult | null> {
  const lower = content.toLowerCase();
  const caseManager = getSupportCaseManager();

  // Staff copilot commands
  if (/\b(summarize|summary|sum up)\b/i.test(lower)) {
    const summary = generateCaseSummary(aiCase, convState);
    return {
      reply: summary,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  if (/\b(evidence|evidences)\b/i.test(lower)) {
    const evidence = caseManager.getEvidence(aiCase.id);
    if (evidence.length === 0) {
      return {
        reply: "No evidence has been collected for this case yet.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }
    const evidenceList = evidence.map((ev, i) =>
      `${i + 1}. **${ev.authorName || ev.authorId}**: ${ev.content || "(no content)"}${ev.messageUrl ? `\n   ${ev.messageUrl}` : ""}`
    ).join("\n\n");
    return {
      reply: `**Evidence collected:**\n\n${evidenceList}`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
      evidence,
    };
  }

  if (/\b(timeline|history|messages)\b/i.test(lower)) {
    const messages = caseManager.getMessages(aiCase.id, 50);
    if (messages.length === 0) {
      return {
        reply: "No messages in this case yet.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }
    const timeline = messages.map(m => {
      const time = new Date(m.createdAt).toLocaleString();
      const author = m.isAi ? "🤖 AI" : `<@${m.authorId}>`;
      return `**[${time}]** ${author}: ${m.content.substring(0, 200)}${m.content.length > 200 ? "..." : ""}`;
    }).join("\n");
    return {
      reply: `**Case Timeline:**\n\n${timeline}`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  if (/\b(assign|claim|take)\s*(this|case)?/i.test(lower)) {
    const updated = caseManager.assignCase(aiCase.id, userId, userId, aiCase.guildId);
    if (updated) {
      return {
        reply: `✅ Case ${aiCase.id} has been assigned to you.`,
        shouldReply: true,
        caseUpdated: true,
        escalateToStaff: false,
        assignToStaff: userId,
      };
    }
    return {
      reply: "❌ Failed to assign case. It may already be assigned.",
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  if (/\b(escalate|escalation|urgent|priority)\b/i.test(lower)) {
    if (canTransition(aiCase.status, "escalated")) {
      const updated = caseManager.transitionCase(aiCase.id, "escalated", userId, aiCase.guildId);
      if (updated) {
        return {
          reply: `✅ Case ${aiCase.id} has been **escalated**. Staff will be notified.`,
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: true,
          newStatus: "escalated",
        };
      }
    }
    return {
      reply: `❌ Cannot escalate from status "${aiCase.status}".`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  if (/\b(resolve|resolved|close|closed|done|complete)\b/i.test(lower)) {
    if (canTransition(aiCase.status, "resolved")) {
      const updated = caseManager.transitionCase(aiCase.id, "resolved", userId, aiCase.guildId);
      if (updated) {
        return {
          reply: `✅ Case ${aiCase.id} has been **resolved**.`,
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false,
          newStatus: "resolved",
        };
      }
    }
    return {
      reply: `❌ Cannot resolve from status "${aiCase.status}".`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  if (/\b(status)\b/i.test(lower)) {
    return {
      reply: `**Case Status:** ${aiCase.status}\n**Type:** ${aiCase.type}\n**Created:** ${new Date(aiCase.createdAt).toLocaleString()}\n**Updated:** ${new Date(aiCase.updatedAt).toLocaleString()}`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  if (/\b(what did|what does|what was|claim|claimed|reporter)\b/i.test(lower)) {
    const info = convState.collectedInfo;
    const parts: string[] = [];
    if (info.claimedBehavior) parts.push(`**Claimed behavior:** ${info.claimedBehavior}`);
    if (info.description) parts.push(`**Description:** ${info.description}`);
    if (info.appealReason) parts.push(`**Appeal reason:** ${info.appealReason}`);
    if (info.reportedUserName) parts.push(`**Reported user:** ${info.reportedUserName}`);

    if (parts.length === 0) {
      return {
        reply: "No claims have been recorded in this case yet.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }

    return {
      reply: parts.join("\n"),
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  if (/\b(recommend|suggestion|should|what do you think)\b/i.test(lower)) {
    const analysis = aiCase.aiAnalysis;
    if (analysis) {
      return {
        reply: `**AI Analysis:**\n${analysis.conclusion || "No conclusion"}\n\n**Recommendation:** ${analysis.recommendation || "No recommendation"}\n\n**Confidence:** ${analysis.confidence ? `${(analysis.confidence * 100).toFixed(0)}%` : "N/A"}`,
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false,
      };
    }
    return {
      reply: "No AI analysis available for this case yet.",
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
    };
  }

  // Not a staff copilot command — return null to let normal flow handle it
  return null;
}

/* ================================================================
 * ANALYSIS GENERATORS
 * ================================================================ */

function generateReportAnalysis(aiCase: AiCase, convState: CaseConversationState): CaseAnalysis {
  const info = convState.collectedInfo;
  const facts: string[] = [];
  const evidence: string[] = [];

  if (info.reportedUserName || info.reportedUserId) {
    facts.push(`Reported user: ${info.reportedUserName || info.reportedUserId}`);
  }
  if (info.claimedBehavior) {
    facts.push(`Claimed behavior: ${info.claimedBehavior}`);
  }
  if (info.approximateTime) {
    facts.push(`Approximate time: ${info.approximateTime}`);
  }
  if (info.description) {
    facts.push(`Description: ${info.description}`);
  }
  if (info.additionalContext) {
    evidence.push(`Reporter provided: ${info.additionalContext}`);
  }

  const hasEvidence = evidence.length > 0 || info.additionalContext;
  const hasDescription = !!info.description || !!info.claimedBehavior;

  let confidence = 0.3;
  if (hasDescription) confidence += 0.2;
  if (hasEvidence) confidence += 0.2;
  if (info.approximateTime) confidence += 0.1;
  if (info.reportedUserId) confidence += 0.1;
  confidence = Math.min(confidence, 0.9);

  const analysis: CaseAnalysis = {
    conclusion: hasDescription
      ? "Report submitted with sufficient detail for staff review."
      : "Report submitted but lacks detailed description.",
    confidence,
    facts,
    evidence,
    userClaim: info.claimedBehavior || info.description,
    aiInterpretation: hasEvidence
      ? "Based on the available evidence, the report appears to have supporting information."
      : "The report is based on the reporter's claim without additional evidence.",
    recommendation: confidence >= 0.6
      ? "Staff review recommended. Evidence appears sufficient for investigation."
      : "Staff review recommended. Additional evidence may strengthen the report.",
    evidenceMessageIds: [],
    analyzedAt: Date.now(),
  };

  // Store analysis on case
  const caseManager = getSupportCaseManager();
  caseManager.updateAnalysis(aiCase.id, analysis);

  return analysis;
}

function generateAppealAnalysis(aiCase: AiCase, convState: CaseConversationState): CaseAnalysis {
  const info = convState.collectedInfo;
  const facts: string[] = [];
  const evidence: string[] = [];

  if (info.originalAction) {
    facts.push(`Original action: ${info.originalAction}`);
  }
  if (info.appealReason) {
    facts.push(`Appeal reason: ${info.appealReason}`);
  }
  if (info.supportingInfo) {
    evidence.push(`Supporting information: ${info.supportingInfo}`);
  }

  const hasReason = !!info.appealReason;
  const hasSupportingInfo = !!info.supportingInfo;

  let confidence = 0.4;
  if (hasReason) confidence += 0.2;
  if (hasSupportingInfo) confidence += 0.2;
  if (info.originalAction) confidence += 0.1;
  confidence = Math.min(confidence, 0.9);

  const analysis: CaseAnalysis = {
    conclusion: hasReason
      ? "Appeal submitted with stated reason. Requires staff review of original action."
      : "Appeal submitted but reason is unclear.",
    confidence,
    facts,
    evidence,
    userClaim: info.appealReason,
    aiInterpretation: hasSupportingInfo
      ? "The appellant has provided supporting information that may warrant reconsideration."
      : "The appeal is based on the appellant's statement without additional supporting evidence.",
    recommendation: "Staff should review the original moderation action and compare against the appeal reason.",
    evidenceMessageIds: [],
    analyzedAt: Date.now(),
  };

  const caseManager = getSupportCaseManager();
  caseManager.updateAnalysis(aiCase.id, analysis);

  return analysis;
}

/* ================================================================
 * SUMMARY GENERATORS
 * ================================================================ */

function generateCaseSummary(aiCase: AiCase, convState: CaseConversationState): string {
  const parts: string[] = [];
  parts.push(`**Case ${aiCase.id}** — ${aiCase.type.charAt(0).toUpperCase() + aiCase.type.slice(1)}`);
  parts.push(`**Status:** ${aiCase.status}`);
  parts.push(`**Created:** ${new Date(aiCase.createdAt).toLocaleString()}`);

  if (aiCase.assignedStaffId) {
    parts.push(`**Assigned:** <@${aiCase.assignedStaffId}>`);
  }

  parts.push("");

  // Collected information
  const info = convState.collectedInfo;
  if (aiCase.type === "report") {
    if (info.reportedUserId) parts.push(`**Subject:** <@${info.reportedUserId}>`);
    if (info.claimedBehavior) parts.push(`**Claim:** ${info.claimedBehavior}`);
    if (info.description) parts.push(`**Details:** ${info.description}`);
    if (info.approximateTime) parts.push(`**Time:** ${info.approximateTime}`);
  } else if (aiCase.type === "appeal") {
    if (info.originalAction) parts.push(`**Original Action:** ${info.originalAction}`);
    if (info.appealReason) parts.push(`**Reason:** ${info.appealReason}`);
    if (info.supportingInfo) parts.push(`**Supporting Info:** ${info.supportingInfo}`);
  } else {
    if (info.description) parts.push(`**Issue:** ${info.description}`);
    if (info.additionalContext) parts.push(`**Additional Context:** ${info.additionalContext}`);
  }

  // AI Analysis
  if (aiCase.aiAnalysis) {
    parts.push("");
    parts.push("**AI Analysis:**");
    parts.push(aiCase.aiAnalysis.conclusion || "Pending");
    parts.push(`**Confidence:** ${aiCase.aiAnalysis.confidence ? `${(aiCase.aiAnalysis.confidence * 100).toFixed(0)}%` : "N/A"}`);
    parts.push(`**Recommendation:** ${aiCase.aiAnalysis.recommendation || "Staff review recommended"}`);
  }

  // Conversation state
  parts.push("");
  parts.push(`**Phase:** ${convState.phase}`);
  parts.push(`**Messages:** ${convState.interactionCount}`);

  return parts.join("\n");
}

function formatReportSummary(
  aiCase: AiCase,
  convState: CaseConversationState,
  analysis: CaseAnalysis,
): string {
  const info = convState.collectedInfo;
  const parts: string[] = [];

  parts.push("**Report Submitted**\n");

  if (info.reportedUserId) {
    parts.push(`**Reported User:** <@${info.reportedUserId}>`);
  }
  if (info.claimedBehavior) {
    parts.push(`**Claimed Behavior:** ${info.claimedBehavior}`);
  }
  if (info.description) {
    parts.push(`**Description:** ${info.description}`);
  }
  if (info.approximateTime) {
    parts.push(`**Approximate Time:** ${info.approximateTime}`);
  }

  parts.push("");
  parts.push("**AI Assessment:**");
  parts.push(analysis.conclusion || "Pending analysis");
  parts.push(`**Confidence:** ${analysis.confidence ? `${(analysis.confidence * 100).toFixed(0)}%` : "N/A"}`);
  parts.push(`**Recommendation:** ${analysis.recommendation || "Staff review recommended"}`);

  parts.push("");
  parts.push("This report has been escalated to staff for review. You'll be notified when there's an update.");

  return parts.join("\n");
}

function formatAppealSummary(
  aiCase: AiCase,
  convState: CaseConversationState,
  analysis: CaseAnalysis,
): string {
  const info = convState.collectedInfo;
  const parts: string[] = [];

  parts.push("**Appeal Submitted**\n");

  if (info.originalAction) {
    parts.push(`**Original Action:** ${info.originalAction}`);
  }
  if (info.appealReason) {
    parts.push(`**Appeal Reason:** ${info.appealReason}`);
  }
  if (info.supportingInfo) {
    parts.push(`**Supporting Information:** ${info.supportingInfo}`);
  }

  parts.push("");
  parts.push("**AI Assessment:**");
  parts.push(analysis.conclusion || "Pending analysis");
  parts.push(`**Recommendation:** ${analysis.recommendation || "Staff should review the original action"}`);

  parts.push("");
  parts.push("This appeal has been submitted for staff review. You'll be notified when there's a decision.");

  return parts.join("\n");
}

/* ================================================================
 * HELPERS
 * ================================================================ */

function isSimpleQuestion(lower: string): boolean {
  return /\b(how do|how can|what is|what are|where is|where can|when is|when does|can i|can you|is it|is there)\b/i.test(lower);
}

async function handleSimpleQuery(content: string, guildId: string): Promise<string | null> {
  const lower = content.toLowerCase();

  // Common support questions
  if (/\b(how do|how can)\b.*\b(change|set|update|modify)\b.*\b(nickname|name|username)\b/i.test(lower)) {
    return "To change your nickname:\n1. Click on your name in the member list\n2. Select \"Profile\"\n3. Click \"Edit Server Profile\"\n4. Change your nickname and save";
  }

  if (/\b(how do|how can)\b.*\b(get|earn|gain)\b.*\b(xp|level|experience)\b/i.test(lower)) {
    return "You earn XP by sending messages in the server. The more active you are, the higher your level!";
  }

  if (/\b(what|where)\b.*\b(role|roles?)\b.*\b(do i have|am i|get)\b/i.test(lower)) {
    return "You can check your roles by looking at your profile or asking a moderator.";
  }

  if (/\b(how do|how can)\b.*\b(report|flag)\b.*\b(someone|user|member)\b/i.test(lower)) {
    return "To report a user:\n• Use `/report` command\n• Or tell me \"report @user\" and I'll help you file a report";
  }

  return null;
}

function detectEscalationNeeded(lower: string, info: CollectedInfo): boolean {
  // High-priority keywords that need immediate staff attention
  const urgentKeywords = /\b(hack|hack|stolen|leaked|dox|doxxing|threat|threaten|suicide|self.harm|nsfw|explicit|illegal|scam|phishing)\b/i;
  if (urgentKeywords.test(lower)) return true;

  // If user explicitly asks for staff
  if (/\b(staff|mod|admin|moderator|human|person|real person)\b/i.test(lower)) return true;

  // If description is very long (detailed issue)
  if (info.description && info.description.length > 500) return true;

  return false;
}

/* ================================================================
 * CASE UPDATE FROM COLLECTED INFO
 * ================================================================ */

function updateCaseFromCollectedInfo(aiCase: AiCase, convState: CaseConversationState): void {
  const caseManager = getSupportCaseManager();
  const info = convState.collectedInfo;

  // Build summary from collected info
  const parts: string[] = [];
  if (aiCase.summary) parts.push(aiCase.summary);
  if (info.description) parts.push(`Description: ${info.description}`);
  if (info.claimedBehavior) parts.push(`Behavior: ${info.claimedBehavior}`);
  if (info.approximateTime) parts.push(`Time: ${info.approximateTime}`);
  if (info.reportedUserName) parts.push(`Reported user: ${info.reportedUserName}`);
  if (info.appealReason) parts.push(`Appeal reason: ${info.appealReason}`);
  if (info.originalAction) parts.push(`Original action: ${info.originalAction}`);
  if (info.supportingInfo) parts.push(`Supporting info: ${info.supportingInfo}`);

  if (parts.length > 0) {
    caseManager.updateSummary(aiCase.id, parts.join(" | "));
  }

  // Transition to investigating if we now have a reported user
  if (info.reportedUserId && !aiCase.subjectUserId && aiCase.status === "open") {
    caseManager.transitionCase(aiCase.id, "investigating", "system", aiCase.guildId);
  }
}

/* ================================================================
 * CONVERSATION STATE PERSISTENCE
 * ================================================================ */

// In-memory cache with DB persistence — bounded to prevent unbounded growth
const conversationStateCache = new Map<string, CaseConversationState>();
const MAX_CACHE_SIZE = 5000;

function evictOldestCacheEntries(): void {
  if (conversationStateCache.size <= MAX_CACHE_SIZE) return;
  // Evict oldest 20% of entries
  const entries = [...conversationStateCache.entries()]
    .sort((a, b) => a[1].lastUserMessage - b[1].lastUserMessage);
  const evictCount = Math.ceil(MAX_CACHE_SIZE * 0.2);
  for (let i = 0; i < evictCount && i < entries.length; i++) {
    conversationStateCache.delete(entries[i][0]);
  }
}

function loadConversationState(caseId: string): CaseConversationState | null {
  // Try cache first
  const cached = conversationStateCache.get(caseId);
  if (cached) return cached;

  // Load from DB
  return safeDbOperation(() => {
    const db = getDatabase();
    const row = db.prepare(
      "SELECT state_json FROM support_case_conversations WHERE case_id = ?"
    ).get(caseId) as any;
    if (!row) return null;
    const state = JSON.parse(row.state_json) as CaseConversationState;
    conversationStateCache.set(caseId, state);
    return state;
  }, null, `loadConversationState(${caseId})`);
}

function saveConversationState(caseId: string, state: CaseConversationState): void {
  // Update cache with bounds check
  evictOldestCacheEntries();
  conversationStateCache.set(caseId, state);

  // Persist to DB
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO support_case_conversations (case_id, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(case_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
    `).run(caseId, JSON.stringify(state), Date.now());
  } catch (error) {
    logger.warn(`Failed to persist conversation state for case ${caseId}`);
  }
}

function initializeConversationState(aiCase: AiCase): CaseConversationState {
  const state: CaseConversationState = {
    caseId: aiCase.id,
    phase: "initial_greeting",
    collectedInfo: {},
    pendingQuestions: [],
    lastAiResponse: 0,
    lastUserMessage: Date.now(),
    interactionCount: 0,
    flags: {
      needsEvidence: aiCase.type === "report",
      needsEscalation: false,
      highRisk: false,
      aiAnalysisComplete: false,
      staffNotified: false,
    },
  };

  // Pre-fill from existing case data
  if (aiCase.subjectUserId) {
    state.collectedInfo.reportedUserId = aiCase.subjectUserId;
  }
  if (aiCase.summary) {
    state.collectedInfo.description = aiCase.summary;
  }

  saveConversationState(aiCase.id, state);
  return state;
}

/* ================================================================
 * STAFF ACCESS CHECK
 *
 * NOTE: Staff access is now determined by the caller via the
 * isStaff option parameter. This function is retained for
 * backward compatibility but should not be the primary check.
 * The caller (support-channel.ts) should compute isStaff from
 * Discord role membership before calling orchestrateCaseConversation.
 * ================================================================ */

/* ================================================================
 * PUBLIC: Get conversation state for external access
 * ================================================================ */

export function getConversationState(caseId: string): CaseConversationState | null {
  return loadConversationState(caseId);
}

/* ================================================================
 * CLEANUP: Remove stale conversation states
 * ================================================================ */

const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const STATE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startConversationCleanup(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [caseId, state] of conversationStateCache) {
      if (now - state.lastUserMessage > STATE_TTL_MS) {
        conversationStateCache.delete(caseId);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function stopConversationCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
