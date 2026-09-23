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
var vision_exports = {};
__export(vision_exports, {
  VisionHandler: () => VisionHandler
});
module.exports = __toCommonJS(vision_exports);
var import_outbound_fetch = require("../security/outbound-fetch");
const VISION_COSTS = {
  ocr: 3,
  describe: 2,
  analyze: 3,
  moderate: 2,
  screenshot: 4
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const VISION_TIMEOUT_MS = 1e4;
class VisionHandler {
  usageManager;
  constructor(usageManager) {
    this.usageManager = usageManager;
  }
  async processVision(request) {
    const credits = VISION_COSTS[request.feature] || 3;
    const check = this.usageManager.check(request.userId, request.guildId, "vision", 0);
    if (!check.allowed) {
      return { success: false, error: `Usage limit: ${check.reason}`, credits: 0 };
    }
    try {
      const result = await this.analyzeImage(request);
      this.usageManager.record({
        userId: request.userId,
        guildId: request.guildId,
        feature: "vision",
        credits: check.credits,
        provider: "vision",
        success: true
      });
      return { success: true, description: result, credits: check.credits };
    } catch (error) {
      this.usageManager.record({
        userId: request.userId,
        guildId: request.guildId,
        feature: "vision",
        credits: check.credits,
        success: false
      });
      const message = error instanceof Error ? error.message : "Vision analysis failed";
      const safe = message.startsWith("Blocked:") || message === "Could not fetch image" || message === "Invalid image content type" || message === "Image too large" || message.startsWith("Image URL validation failed");
      return {
        success: false,
        error: safe ? message : "Vision analysis failed",
        credits: 0
      };
    }
  }
  async analyzeImage(request) {
    const { response } = await (0, import_outbound_fetch.hardenedFetch)(request.imageUrl, {
      timeoutMs: VISION_TIMEOUT_MS,
      maxRedirects: 5,
      maxResponseBytes: MAX_IMAGE_BYTES,
      headers: { Accept: "image/*" }
    });
    if (!response.ok) throw new Error("Could not fetch image");
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error("Invalid image content type");
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
      throw new Error("Image too large");
    }
    const bytes = await (0, import_outbound_fetch.readLimitedBytes)(response, MAX_IMAGE_BYTES);
    if (bytes.length === 0) {
      throw new Error("Could not fetch image");
    }
    switch (request.feature) {
      case "ocr":
        return `[OCR Analysis] Image fetched successfully. URL: ${request.imageUrl}. Full OCR would require a vision-capable AI provider.`;
      case "describe":
        return `[Image Description] Image fetched. URL: ${request.imageUrl}. Full description would require a vision-capable AI provider.`;
      case "analyze":
        return `[Image Analysis] Image fetched. URL: ${request.imageUrl}. Question: ${request.question || "General analysis"}. Full analysis would require a vision-capable AI provider.`;
      case "moderate":
        return `[Content Moderation] Image fetched. URL: ${request.imageUrl}. Full moderation analysis would require a vision-capable AI provider.`;
      case "screenshot":
        return `[Screenshot Analysis] Image fetched. URL: ${request.imageUrl}. Screenshot analysis would require a vision-capable AI provider.`;
      default:
        return "Image processed.";
    }
  }
  isVisionSupported() {
    return true;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VisionHandler
});
