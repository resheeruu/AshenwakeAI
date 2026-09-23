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
var rivalry_exports = {};
__export(rivalry_exports, {
  DEFAULT_RIVALRY_CONFIG: () => import_types.DEFAULT_RIVALRY_CONFIG,
  buildRivalrySystemPrompt: () => import_response_generator.buildRivalrySystemPrompt,
  classifyOpponentResponse: () => import_response_generator.classifyOpponentResponse,
  classifyParticipant: () => import_classifier.classifyParticipant,
  createSession: () => import_session_manager.createSession,
  detectRivalryIntent: () => import_detector.detectRivalryIntent,
  endSession: () => import_session_manager.endSession,
  extractMentionedIds: () => import_detector.extractMentionedIds,
  generateAcknowledgment: () => import_response_generator.generateAcknowledgment,
  generateChallenge: () => import_response_generator.generateChallenge,
  generateOpeningChallenge: () => import_response_generator.generateOpeningChallenge,
  generateRefusalResponse: () => import_response_generator.generateRefusalResponse,
  generateRoast: () => import_response_generator.generateRoast,
  generateSessionEnd: () => import_response_generator.generateSessionEnd,
  generateWaitingResponse: () => import_response_generator.generateWaitingResponse,
  getActiveSession: () => import_session_manager.getActiveSession,
  getActiveSessionCount: () => import_session_manager.getActiveSessionCount,
  getNextChallenge: () => import_session_manager.getNextChallenge,
  isAshenAIMentioned: () => import_detector.isAshenAIMentioned,
  isEndRivalryIntent: () => import_detector.isEndRivalryIntent,
  isOpponent: () => import_session_manager.isOpponent,
  isOpponentTimedOut: () => import_session_manager.isOpponentTimedOut,
  isRefusal: () => import_detector.isRefusal,
  reclassifyFromResponse: () => import_classifier.reclassifyFromResponse,
  recordAshenAITurn: () => import_session_manager.recordAshenAITurn,
  recordOpponentTurn: () => import_session_manager.recordOpponentTurn,
  startSessionCleanup: () => import_session_manager.startSessionCleanup,
  stopSessionCleanup: () => import_session_manager.stopSessionCleanup
});
module.exports = __toCommonJS(rivalry_exports);
var import_types = require("./types");
var import_classifier = require("./classifier");
var import_detector = require("./detector");
var import_session_manager = require("./session-manager");
var import_response_generator = require("./response-generator");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_RIVALRY_CONFIG,
  buildRivalrySystemPrompt,
  classifyOpponentResponse,
  classifyParticipant,
  createSession,
  detectRivalryIntent,
  endSession,
  extractMentionedIds,
  generateAcknowledgment,
  generateChallenge,
  generateOpeningChallenge,
  generateRefusalResponse,
  generateRoast,
  generateSessionEnd,
  generateWaitingResponse,
  getActiveSession,
  getActiveSessionCount,
  getNextChallenge,
  isAshenAIMentioned,
  isEndRivalryIntent,
  isOpponent,
  isOpponentTimedOut,
  isRefusal,
  reclassifyFromResponse,
  recordAshenAITurn,
  recordOpponentTurn,
  startSessionCleanup,
  stopSessionCleanup
});
