import { logger } from "../logger";
import { UsageManager, AIFeature } from "./usage-manager";
import { validateOutboundUrl, validateRedirectTarget } from "../security/network-boundary";

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
      return { success: false, error: error instanceof Error ? error.message : "Vision analysis failed", credits: 0 };
    }
  }

  private async analyzeImage(request: VisionRequest): Promise<string> {
    const urlCheck = validateOutboundUrl(request.imageUrl);
    if (!urlCheck.valid) {
        throw new Error("Image URL validation failed");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        let currentUrl = urlCheck.url!.toString();
        const response = await fetch(currentUrl, {
            signal: controller.signal,
            redirect: "manual",
            headers: { Accept: "image/*" }
        });
        if (!response.ok) throw new Error("Could not fetch image");
        // Validate content type
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
            throw new Error("Invalid image content type");
        }
        // Check content length (max 10MB)
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
            throw new Error("Image too large");
        }
        // Handle redirects
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (location) {
                const redirectCheck = validateRedirectTarget(location, currentUrl);
                if (!redirectCheck.valid || !redirectCheck.url) {
                    throw new Error("Redirect blocked");
                }
                currentUrl = redirectCheck.url;
            }
        }
    } finally {
        clearTimeout(timer);
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
