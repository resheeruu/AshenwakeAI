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
var support_exports = {};
__export(support_exports, {
  SupportCaseManager: () => import_case_manager.SupportCaseManager,
  VALID_TRANSITIONS: () => import_types.VALID_TRANSITIONS,
  canTransition: () => import_types.canTransition,
  formatCaseId: () => import_types.formatCaseId,
  getConversationState: () => import_ai_orchestrator.getConversationState,
  getSupportCaseManager: () => import_case_manager.getSupportCaseManager,
  orchestrateCaseConversation: () => import_ai_orchestrator.orchestrateCaseConversation,
  startConversationCleanup: () => import_ai_orchestrator.startConversationCleanup,
  startSupportAutomation: () => import_automation.startSupportAutomation,
  stopConversationCleanup: () => import_ai_orchestrator.stopConversationCleanup,
  stopSupportAutomation: () => import_automation.stopSupportAutomation
});
module.exports = __toCommonJS(support_exports);
var import_case_manager = require("./case-manager");
var import_types = require("./types");
var import_ai_orchestrator = require("./ai-orchestrator");
var import_automation = require("./automation");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SupportCaseManager,
  VALID_TRANSITIONS,
  canTransition,
  formatCaseId,
  getConversationState,
  getSupportCaseManager,
  orchestrateCaseConversation,
  startConversationCleanup,
  startSupportAutomation,
  stopConversationCleanup,
  stopSupportAutomation
});
