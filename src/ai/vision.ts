import { logger } from "../logger";
import { UsageManager, AIFeature } from "./usage-manager";
import {
  hardenedFetch,
  readLimitedBytes,
} from "../security/outbound-fetch";

export interface VisionRequest {
  userId: string;
  guildId: string;
  imageUrl: string;
  question?: string;
  feature: "ocr" | "describe" | "analyze" | "moderate" | "screenshot";
}

export interface VisionResult {
  success: boolean;
  description?: string;
  error?: string;
  credits: number;
}

const VISION_COSTS: Record<string, number> = {
  ocr: 3,
  describe: 2,
  analyze: 3,
  moderate: 2,
  screenshot: 4,
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const VISION_TIMEOUT_MS = 10_000;

export class VisionHandler {
  private usageManager: UsageManager;

  constructor(usageManager: UsageManager) {
    this.usageManager = usageManager;
  }

  async processVision(request: VisionRequest): Promise<VisionResult> {
    const credits = VISION_COSTS[request.feature] || 3;
    const check = this.usageManager.check(request.userId, request.guildId, "vision" as AIFeature, 0);
    if (!check.allowed) {
      return { success: false, error: `Usage limit: ${check.reason}`, credits: 0 };
    }

    try {
      const result = await this.analyzeImage(request);
      this.usageManager.record({
        userId: request.userId,
        guildId: request.guildId,
        feature: "vision" as AIFeature,
        credits: check.credits,
        provider: "vision",
        success: true,
      });
      return { success: true, description: result, credits: check.credits };
    } catch (error) {
      this.usageManager.record({
        userId: request.userId,
        guildId: request.guildId,
        feature: "vision" as AIFeature,
        credits: check.credits,
        success: false,
      });
      // Never surface raw error.message — may contain internal URLs/paths.
      const message =
        error instanceof Error ? error.message : "Vision analysis failed";
      const safe =
        message.startsWith("Blocked:") ||
        message === "Could not fetch image" ||
        message === "Invalid image content type" ||
        message === "Image too large" ||
        message.startsWith("Image URL validation failed");
      return {
        success: false,
        error: safe ? message : "Vision analysis failed",
        credits: 0,
      };
    }
  }

  private async analyzeImage(request: VisionRequest): Promise<string> {
    // Hardened outbound fetch: URL validation + DNS + IP classification +
    // redirect validation + timeout + response-size limit (DNS rebinding safe).
    const { response } = await hardenedFetch(request.imageUrl, {
      timeoutMs: VISION_TIMEOUT_MS,
      maxRedirects: 5,
      maxResponseBytes: MAX_IMAGE_BYTES,
      headers: { Accept: "image/*" },
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

    // Consume body with hard cap (defends against missing/lying content-length).
    const bytes = await readLimitedBytes(response, MAX_IMAGE_BYTES);
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

  isVisionSupported(): boolean {
    return true;
  }
}
