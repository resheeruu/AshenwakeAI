"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ai_orchestrator_exports = {};
__export(ai_orchestrator_exports, {
  getConversationState: () => getConversationState,
  orchestrateCaseConversation: () => orchestrateCaseConversation,
  startConversationCleanup: () => startConversationCleanup,
  stopConversationCleanup: () => stopConversationCleanup
});
module.exports = __toCommonJS(ai_orchestrator_exports);
var import_logger = require("../logger");
var import_audit = require("../security/audit");
var import_guild_config = require("../core/guild-config");
var import_case_manager = require("./case-manager");
var import_database = require("../database/database");
var import_types = require("./types");
function getStaffRoleIds(guildId) {
  const config = (0, import_guild_config.loadGuildConfig)(guildId);
  return config.staff?.roleIds ?? [];
}
async function orchestrateCaseConversation(caseId, channelId, userId, userName, content, guildId, mentionedUserIds, options) {
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  const aiCase = caseManager.getCase(caseId);
  if (!aiCase) {
    return {
      reply: "",
      shouldReply: false,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  if (aiCase.guildId !== guildId) {
    return {
      reply: "",
      shouldReply: false,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  if (options?.discordMessageId) {
    const alreadyProcessed = (0, import_database.safeDbOperation)(() => {
      const db = (0, import_database.getDatabase)();
      const row = db.prepare(
        "SELECT 1 FROM support_case_messages WHERE discord_message_id = ? AND case_id = ?"
      ).get(options.discordMessageId, caseId);
      return !!row;
    }, false, `checkDuplicateMessage(${options.discordMessageId})`);
    if (alreadyProcessed) {
      return {
        reply: "",
        shouldReply: false,
        caseUpdated: false,
        escalateToStaff: false
      };
    }
  }
  const convState = loadConversationState(caseId) || initializeConversationState(aiCase);
  const currentCase = caseManager.getCase(caseId);
  if (!currentCase) {
    return {
      reply: "",
      shouldReply: false,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  const isCreator = currentCase.creatorId === userId;
  const isAssignedStaff = currentCase.assignedStaffId === userId;
  const isStaff = options?.isStaff ?? isAssignedStaff;
  if (isStaff || isAssignedStaff) {
    const staffResult = await handleStaffInteraction(
      currentCase,
      convState,
      userId,
      userName,
      content,
      guildId
    );
    if (staffResult) {
      saveConversationState(caseId, convState);
      return staffResult;
    }
  }
  if (currentCase.status === "closed" || currentCase.status === "resolved") {
    return {
      reply: `This case has been **${currentCase.status}**. If you need further assistance, please create a new ticket.`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  caseManager.addMessage(caseId, userId, content, false, options?.discordMessageId);
  convState.lastUserMessage = Date.now();
  convState.interactionCount++;
  let result;
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
  if (result.reply) {
    caseManager.addMessage(caseId, "ai", result.reply, true);
    convState.lastAiResponse = Date.now();
  }
  if (result.caseUpdated) {
    updateCaseFromCollectedInfo(currentCase, convState);
  }
  saveConversationState(caseId, convState);
  (0, import_audit.recordAudit)({
    who: userId,
    whoName: userName,
    what: `Case ${caseId} interaction: phase=${convState.phase}`,
    where: "support-orchestrator",
    guildId,
    result: "success"
  });
  return result;
}
async function handleReportConversation(aiCase, convState, content, userId, guildId, mentionedUserIds) {
  const lower = content.toLowerCase();
  const info = convState.collectedInfo;
  switch (convState.phase) {
    case "initial_greeting": {
      if (aiCase.subjectUserId) {
        info.reportedUserId = aiCase.subjectUserId;
        convState.phase = "info_collection";
        convState.pendingQuestions = ["claimed_behavior", "approximate_time"];
        return {
          reply: `I'll help you with your report. You're reporting <@${aiCase.subjectUserId}>.

What behavior are you reporting them for?`,
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false
        };
      }
      convState.pendingQuestions = ["reported_user"];
      return {
        reply: "I'll help you file this report. **Who are you reporting?** Please mention them or provide their username.",
        shouldReply: true,
        caseUpdated: true,
        escalateToStaff: false
      };
    }
    case "info_collection": {
      if (convState.pendingQuestions.includes("reported_user")) {
        const mentioned = mentionedUserIds.find((id) => id !== "ai");
        if (mentioned) {
          info.reportedUserId = mentioned;
          try {
            const member = await import("discord.js").then(
              (d) => import("../logger").then(() => null)
              // placeholder
            );
            info.reportedUserName = mentioned;
          } catch {
            info.reportedUserName = mentioned;
          }
          convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "reported_user");
          convState.pendingQuestions.push("claimed_behavior");
        } else {
          const userMatch = content.match(/@(\w+)/);
          if (userMatch) {
            info.reportedUserName = userMatch[1];
            convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "reported_user");
            convState.pendingQuestions.push("claimed_behavior");
          } else {
            return {
              reply: "Please mention the user you're reporting (e.g., @username).",
              shouldReply: true,
              caseUpdated: false,
              escalateToStaff: false
            };
          }
        }
      }
      if (convState.pendingQuestions.includes("claimed_behavior")) {
        info.claimedBehavior = content;
        convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "claimed_behavior");
        convState.pendingQuestions.push("approximate_time");
        return {
          reply: `Thank you. **What happened?** Please describe the behavior in detail.`,
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false
        };
      }
      if (convState.pendingQuestions.includes("description")) {
        info.description = content;
        convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "description");
        convState.pendingQuestions.push("evidence");
        return {
          reply: 'Thank you for that detail. **Do you have any evidence?** This could be:\n\u2022 Message IDs\n\u2022 Screenshots\n\u2022 Links to messages\n\u2022 Channel names where it happened\n\nIf not, just say "no".',
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false
        };
      }
      if (convState.pendingQuestions.includes("approximate_time")) {
        info.approximateTime = content;
        convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "approximate_time");
        convState.pendingQuestions.push("description");
        return {
          reply: "Got it. **Can you provide more details about what happened?** The more context you give, the better we can investigate.",
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false
        };
      }
      if (convState.pendingQuestions.includes("evidence")) {
        if (content.toLowerCase() !== "no" && content.toLowerCase() !== "none") {
          info.additionalContext = content;
        }
        convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "evidence");
        convState.phase = "analysis";
        convState.flags.needsEvidence = false;
        const analysis = generateReportAnalysis(aiCase, convState);
        return {
          reply: formatReportSummary(aiCase, convState, analysis),
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: true,
          newStatus: "waiting_staff",
          evidence: []
        };
      }
      break;
    }
    case "analysis": {
      if (/\b(more|add|also|forgot|update)\b/i.test(lower)) {
        convState.phase = "info_collection";
        convState.pendingQuestions = ["additional_info"];
        return {
          reply: "What additional information would you like to add?",
          shouldReply: true,
          caseUpdated: false,
          escalateToStaff: false
        };
      }
      return {
        reply: "Your report has been submitted and is awaiting staff review. If you have additional evidence, you can add it here.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false
      };
    }
    case "staff_review":
    case "resolution": {
      return {
        reply: "Your report is being reviewed by staff. You'll be notified when there's an update.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false
      };
    }
  }
  return {
    reply: "",
    shouldReply: false,
    caseUpdated: false,
    escalateToStaff: false
  };
}
async function handleAppealConversation(aiCase, convState, content, userId, guildId) {
  const info = convState.collectedInfo;
  switch (convState.phase) {
    case "initial_greeting": {
      convState.phase = "info_collection";
      convState.pendingQuestions = ["appeal_reason"];
      return {
        reply: "I'll help you with your appeal. **Why do you believe the action should be reversed?**\n\nPlease provide:\n\u2022 The reason for your appeal\n\u2022 Any supporting information\n\u2022 Context that staff should consider",
        shouldReply: true,
        caseUpdated: true,
        escalateToStaff: false
      };
    }
    case "info_collection": {
      if (convState.pendingQuestions.includes("appeal_reason")) {
        info.appealReason = content;
        convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "appeal_reason");
        convState.pendingQuestions.push("original_action");
        return {
          reply: "Thank you. **What was the original moderation action?** (e.g., ban, timeout, warn)\n\nIf you're not sure, just describe what happened.",
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false
        };
      }
      if (convState.pendingQuestions.includes("original_action")) {
        info.originalAction = content;
        convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "original_action");
        convState.pendingQuestions.push("supporting_info");
        return {
          reply: `Got it. **Do you have any supporting information?** This could be:
\u2022 Evidence that contradicts the original action
\u2022 Context that wasn't considered
\u2022 Changes in behavior

If not, just say "no".`,
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false
        };
      }
      if (convState.pendingQuestions.includes("supporting_info")) {
        if (content.toLowerCase() !== "no" && content.toLowerCase() !== "none") {
          info.supportingInfo = content;
        }
        convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "supporting_info");
        convState.phase = "analysis";
        const analysis = generateAppealAnalysis(aiCase, convState);
        return {
          reply: formatAppealSummary(aiCase, convState, analysis),
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: true,
          newStatus: "waiting_staff"
        };
      }
      break;
    }
    case "analysis": {
      return {
        reply: "Your appeal has been submitted and is awaiting staff review. If you have additional information, you can add it here.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false
      };
    }
    case "staff_review":
    case "resolution": {
      return {
        reply: "Your appeal is being reviewed by staff. You'll be notified when there's an update.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false
      };
    }
  }
  return {
    reply: "",
    shouldReply: false,
    caseUpdated: false,
    escalateToStaff: false
  };
}
async function handleSupportConversation(aiCase, convState, content, userId, guildId) {
  const lower = content.toLowerCase();
  switch (convState.phase) {
    case "initial_greeting": {
      convState.phase = "info_collection";
      convState.pendingQuestions = ["issue_description"];
      return {
        reply: `Hello! I'm here to help. **Please describe your issue in detail.**

The more information you provide, the better I can assist you or escalate to the right person.`,
        shouldReply: true,
        caseUpdated: true,
        escalateToStaff: false
      };
    }
    case "info_collection": {
      if (convState.pendingQuestions.includes("issue_description")) {
        convState.collectedInfo.description = content;
        convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "issue_description");
        if (isSimpleQuestion(lower)) {
          const answer = await handleSimpleQuery(content, guildId);
          if (answer) {
            convState.phase = "resolution";
            return {
              reply: answer,
              shouldReply: true,
              caseUpdated: true,
              escalateToStaff: false,
              newStatus: "resolved"
            };
          }
        }
        const shouldEscalate = detectEscalationNeeded(lower, convState.collectedInfo);
        if (shouldEscalate) {
          convState.flags.needsEscalation = true;
          convState.phase = "staff_review";
          return {
            reply: "Thank you for the details. This appears to require staff attention. I'm escalating this to our team now.\n\nA staff member will review your case shortly. You can continue adding information here if needed.",
            shouldReply: true,
            caseUpdated: true,
            escalateToStaff: true,
            newStatus: "escalated"
          };
        }
        convState.pendingQuestions.push("additional_context");
        return {
          reply: "I understand. **Is there any additional context you'd like to share?**\n\nFor example:\n\u2022 When did this start?\n\u2022 Have you tried any solutions?\n\u2022 Any error messages or screenshots?",
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false
        };
      }
      if (convState.pendingQuestions.includes("additional_context")) {
        if (content.toLowerCase() !== "no" && content.toLowerCase() !== "none") {
          convState.collectedInfo.additionalContext = content;
        }
        convState.pendingQuestions = convState.pendingQuestions.filter((q) => q !== "additional_context");
        convState.phase = "staff_review";
        convState.flags.needsEscalation = true;
        return {
          reply: "Thank you for the information. I'm escalating this to our support team.\n\n**What to expect:**\n\u2022 A staff member will review your case\n\u2022 You'll be notified when there's an update\n\u2022 You can continue adding information here\n\nIs there anything else you'd like to add before staff reviews this?",
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: true,
          newStatus: "waiting_staff"
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
        escalateToStaff: false
      };
    }
    case "resolution": {
      return {
        reply: "Your case has been resolved. If you need further assistance, please create a new ticket.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false
      };
    }
  }
  return {
    reply: "",
    shouldReply: false,
    caseUpdated: false,
    escalateToStaff: false
  };
}
async function handleStaffInteraction(aiCase, convState, userId, userName, content, guildId) {
  const lower = content.toLowerCase();
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  if (/\b(summarize|summary|sum up)\b/i.test(lower)) {
    const summary = generateCaseSummary(aiCase, convState);
    return {
      reply: summary,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  if (/\b(evidence|evidences)\b/i.test(lower)) {
    const evidence = caseManager.getEvidence(aiCase.id);
    if (evidence.length === 0) {
      return {
        reply: "No evidence has been collected for this case yet.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false
      };
    }
    const evidenceList = evidence.map(
      (ev, i) => `${i + 1}. **${ev.authorName || ev.authorId}**: ${ev.content || "(no content)"}${ev.messageUrl ? `
   ${ev.messageUrl}` : ""}`
    ).join("\n\n");
    return {
      reply: `**Evidence collected:**

${evidenceList}`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false,
      evidence
    };
  }
  if (/\b(timeline|history|messages)\b/i.test(lower)) {
    const messages = caseManager.getMessages(aiCase.id, 50);
    if (messages.length === 0) {
      return {
        reply: "No messages in this case yet.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false
      };
    }
    const timeline = messages.map((m) => {
      const time = new Date(m.createdAt).toLocaleString();
      const author = m.isAi ? "\u{1F916} AI" : `<@${m.authorId}>`;
      return `**[${time}]** ${author}: ${m.content.substring(0, 200)}${m.content.length > 200 ? "..." : ""}`;
    }).join("\n");
    return {
      reply: `**Case Timeline:**

${timeline}`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  if (/\b(assign|claim|take)\s*(this|case)?/i.test(lower)) {
    const updated = caseManager.assignCase(aiCase.id, userId, userId);
    if (updated) {
      return {
        reply: `\u2705 Case ${aiCase.id} has been assigned to you.`,
        shouldReply: true,
        caseUpdated: true,
        escalateToStaff: false,
        assignToStaff: userId
      };
    }
    return {
      reply: "\u274C Failed to assign case. It may already be assigned.",
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  if (/\b(escalate|escalation|urgent|priority)\b/i.test(lower)) {
    if ((0, import_types.canTransition)(aiCase.status, "escalated")) {
      const updated = caseManager.transitionCase(aiCase.id, "escalated", userId);
      if (updated) {
        return {
          reply: `\u2705 Case ${aiCase.id} has been **escalated**. Staff will be notified.`,
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: true,
          newStatus: "escalated"
        };
      }
    }
    return {
      reply: `\u274C Cannot escalate from status "${aiCase.status}".`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  if (/\b(resolve|resolved|close|closed|done|complete)\b/i.test(lower)) {
    if ((0, import_types.canTransition)(aiCase.status, "resolved")) {
      const updated = caseManager.transitionCase(aiCase.id, "resolved", userId);
      if (updated) {
        return {
          reply: `\u2705 Case ${aiCase.id} has been **resolved**.`,
          shouldReply: true,
          caseUpdated: true,
          escalateToStaff: false,
          newStatus: "resolved"
        };
      }
    }
    return {
      reply: `\u274C Cannot resolve from status "${aiCase.status}".`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  if (/\b(status)\b/i.test(lower)) {
    return {
      reply: `**Case Status:** ${aiCase.status}
**Type:** ${aiCase.type}
**Created:** ${new Date(aiCase.createdAt).toLocaleString()}
**Updated:** ${new Date(aiCase.updatedAt).toLocaleString()}`,
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  if (/\b(what did|what does|what was|claim|claimed|reporter)\b/i.test(lower)) {
    const info = convState.collectedInfo;
    const parts = [];
    if (info.claimedBehavior) parts.push(`**Claimed behavior:** ${info.claimedBehavior}`);
    if (info.description) parts.push(`**Description:** ${info.description}`);
    if (info.appealReason) parts.push(`**Appeal reason:** ${info.appealReason}`);
    if (info.reportedUserName) parts.push(`**Reported user:** ${info.reportedUserName}`);
    if (parts.length === 0) {
      return {
        reply: "No claims have been recorded in this case yet.",
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false
      };
    }
    return {
      reply: parts.join("\n"),
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  if (/\b(recommend|suggestion|should|what do you think)\b/i.test(lower)) {
    const analysis = aiCase.aiAnalysis;
    if (analysis) {
      return {
        reply: `**AI Analysis:**
${analysis.conclusion || "No conclusion"}

**Recommendation:** ${analysis.recommendation || "No recommendation"}

**Confidence:** ${analysis.confidence ? `${(analysis.confidence * 100).toFixed(0)}%` : "N/A"}`,
        shouldReply: true,
        caseUpdated: false,
        escalateToStaff: false
      };
    }
    return {
      reply: "No AI analysis available for this case yet.",
      shouldReply: true,
      caseUpdated: false,
      escalateToStaff: false
    };
  }
  return null;
}
function generateReportAnalysis(aiCase, convState) {
  const info = convState.collectedInfo;
  const facts = [];
  const evidence = [];
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
  const analysis = {
    conclusion: hasDescription ? "Report submitted with sufficient detail for staff review." : "Report submitted but lacks detailed description.",
    confidence,
    facts,
    evidence,
    userClaim: info.claimedBehavior || info.description,
    aiInterpretation: hasEvidence ? "Based on the available evidence, the report appears to have supporting information." : "The report is based on the reporter's claim without additional evidence.",
    recommendation: confidence >= 0.6 ? "Staff review recommended. Evidence appears sufficient for investigation." : "Staff review recommended. Additional evidence may strengthen the report.",
    evidenceMessageIds: [],
    analyzedAt: Date.now()
  };
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  caseManager.updateAnalysis(aiCase.id, analysis);
  return analysis;
}
function generateAppealAnalysis(aiCase, convState) {
  const info = convState.collectedInfo;
  const facts = [];
  const evidence = [];
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
  const analysis = {
    conclusion: hasReason ? "Appeal submitted with stated reason. Requires staff review of original action." : "Appeal submitted but reason is unclear.",
    confidence,
    facts,
    evidence,
    userClaim: info.appealReason,
    aiInterpretation: hasSupportingInfo ? "The appellant has provided supporting information that may warrant reconsideration." : "The appeal is based on the appellant's statement without additional supporting evidence.",
    recommendation: "Staff should review the original moderation action and compare against the appeal reason.",
    evidenceMessageIds: [],
    analyzedAt: Date.now()
  };
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  caseManager.updateAnalysis(aiCase.id, analysis);
  return analysis;
}
function generateCaseSummary(aiCase, convState) {
  const parts = [];
  parts.push(`**Case ${aiCase.id}** \u2014 ${aiCase.type.charAt(0).toUpperCase() + aiCase.type.slice(1)}`);
  parts.push(`**Status:** ${aiCase.status}`);
  parts.push(`**Created:** ${new Date(aiCase.createdAt).toLocaleString()}`);
  if (aiCase.assignedStaffId) {
    parts.push(`**Assigned:** <@${aiCase.assignedStaffId}>`);
  }
  parts.push("");
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
  if (aiCase.aiAnalysis) {
    parts.push("");
    parts.push("**AI Analysis:**");
    parts.push(aiCase.aiAnalysis.conclusion || "Pending");
    parts.push(`**Confidence:** ${aiCase.aiAnalysis.confidence ? `${(aiCase.aiAnalysis.confidence * 100).toFixed(0)}%` : "N/A"}`);
    parts.push(`**Recommendation:** ${aiCase.aiAnalysis.recommendation || "Staff review recommended"}`);
  }
  parts.push("");
  parts.push(`**Phase:** ${convState.phase}`);
  parts.push(`**Messages:** ${convState.interactionCount}`);
  return parts.join("\n");
}
function formatReportSummary(aiCase, convState, analysis) {
  const info = convState.collectedInfo;
  const parts = [];
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
function formatAppealSummary(aiCase, convState, analysis) {
  const info = convState.collectedInfo;
  const parts = [];
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
function isSimpleQuestion(lower) {
  return /\b(how do|how can|what is|what are|where is|where can|when is|when does|can i|can you|is it|is there)\b/i.test(lower);
}
async function handleSimpleQuery(content, guildId) {
  const lower = content.toLowerCase();
  if (/\b(how do|how can)\b.*\b(change|set|update|modify)\b.*\b(nickname|name|username)\b/i.test(lower)) {
    return 'To change your nickname:\n1. Click on your name in the member list\n2. Select "Profile"\n3. Click "Edit Server Profile"\n4. Change your nickname and save';
  }
  if (/\b(how do|how can)\b.*\b(get|earn|gain)\b.*\b(xp|level|experience)\b/i.test(lower)) {
    return "You earn XP by sending messages in the server. The more active you are, the higher your level!";
  }
  if (/\b(what|where)\b.*\b(role|roles?)\b.*\b(do i have|am i|get)\b/i.test(lower)) {
    return "You can check your roles by looking at your profile or asking a moderator.";
  }
  if (/\b(how do|how can)\b.*\b(report|flag)\b.*\b(someone|user|member)\b/i.test(lower)) {
    return 'To report a user:\n\u2022 Use `/report` command\n\u2022 Or tell me "report @user" and I\'ll help you file a report';
  }
  return null;
}
function detectEscalationNeeded(lower, info) {
  const urgentKeywords = /\b(hack|hack|stolen|leaked|dox|doxxing|threat|threaten|suicide|self.harm|nsfw|explicit|illegal|scam|phishing)\b/i;
  if (urgentKeywords.test(lower)) return true;
  if (/\b(staff|mod|admin|moderator|human|person|real person)\b/i.test(lower)) return true;
  if (info.description && info.description.length > 500) return true;
  return false;
}
function updateCaseFromCollectedInfo(aiCase, convState) {
  const caseManager = (0, import_case_manager.getSupportCaseManager)();
  const info = convState.collectedInfo;
  const parts = [];
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
  if (info.reportedUserId && !aiCase.subjectUserId && aiCase.status === "open") {
    caseManager.transitionCase(aiCase.id, "investigating", "system");
  }
}
const conversationStateCache = /* @__PURE__ */ new Map();
const MAX_CACHE_SIZE = 5e3;
function evictOldestCacheEntries() {
  if (conversationStateCache.size <= MAX_CACHE_SIZE) return;
  const entries = [...conversationStateCache.entries()].sort((a, b) => a[1].lastUserMessage - b[1].lastUserMessage);
  const evictCount = Math.ceil(MAX_CACHE_SIZE * 0.2);
  for (let i = 0; i < evictCount && i < entries.length; i++) {
    conversationStateCache.delete(entries[i][0]);
  }
}
function loadConversationState(caseId) {
  const cached = conversationStateCache.get(caseId);
  if (cached) return cached;
  return (0, import_database.safeDbOperation)(() => {
    const db = (0, import_database.getDatabase)();
    const row = db.prepare(
      "SELECT state_json FROM support_case_conversations WHERE case_id = ?"
    ).get(caseId);
    if (!row) return null;
    const state = JSON.parse(row.state_json);
    conversationStateCache.set(caseId, state);
    return state;
  }, null, `loadConversationState(${caseId})`);
}
function saveConversationState(caseId, state) {
  evictOldestCacheEntries();
  conversationStateCache.set(caseId, state);
  try {
    const db = (0, import_database.getDatabase)();
    db.prepare(`
      INSERT INTO support_case_conversations (case_id, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(case_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
    `).run(caseId, JSON.stringify(state), Date.now());
  } catch (error) {
    import_logger.logger.warn(`Failed to persist conversation state for case ${caseId}`);
  }
}
function initializeConversationState(aiCase) {
  const state = {
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
      staffNotified: false
    }
  };
  if (aiCase.subjectUserId) {
    state.collectedInfo.reportedUserId = aiCase.subjectUserId;
  }
  if (aiCase.summary) {
    state.collectedInfo.description = aiCase.summary;
  }
  saveConversationState(aiCase.id, state);
  return state;
}
function getConversationState(caseId) {
  return loadConversationState(caseId);
}
const CLEANUP_INTERVAL_MS = 30 * 60 * 1e3;
const STATE_TTL_MS = 24 * 60 * 60 * 1e3;
let cleanupTimer = null;
function startConversationCleanup() {
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
function stopConversationCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getConversationState,
  orchestrateCaseConversation,
  startConversationCleanup,
  stopConversationCleanup
});
