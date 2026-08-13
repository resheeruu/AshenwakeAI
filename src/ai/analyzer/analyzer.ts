import { RequestAnalysis, RequestIntent } from "./types";

export class RequestAnalyzer {
  analyze(
    content: string,
    hasHistory: boolean
  ): RequestAnalysis {
    const text = content.trim().toLowerCase();

    const followUpPatterns = [
      /^more[.!?]*$/,
      /^continue[.!?]*$/,
      /^explain more[.!?]*$/,
      /^tell me more[.!?]*$/,
      /^what about that[.!?]*$/,
      /^and then[.!?]*$/,
      /^why[.!?]*$/,
      /^how so[.!?]*$/,
      /^elaborate[.!?]*$/,
    ];

    const isFollowUp =
      hasHistory &&
      followUpPatterns.some((pattern) => pattern.test(text));

    let intent: RequestIntent = "general";

    if (
      /^(hi|hello|hey|yo|sup|wazzup|good morning|good evening)\b/.test(
        text
      )
    ) {
      intent = "greeting";
    } else if (isFollowUp) {
      intent = "followup";
    } else if (
      /\b(code|coding|typescript|javascript|python|java|debug|bug|function|class|api|program)\b/.test(
        text
      )
    ) {
      intent = "coding";
    } else if (
      /\b(prove|analyze|analysis|reason|logic|compare|difference|why|solve|calculate)\b/.test(
        text
      )
    ) {
      intent = "reasoning";
    } else if (
      /\b(write|story|poem|creative|joke|funny|imagine|idea)\b/.test(
        text
      )
    ) {
      intent = "creative";
    } else if (
      /\b(what is|who is|when did|where is|define|meaning)\b/.test(
        text
      )
    ) {
      intent = "factual";
    }

    const complexity =
      text.length > 500 || intent === "reasoning"
        ? "high"
        : text.length > 150
          ? "medium"
          : "low";

    const keywords = text
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4)
      .slice(0, 12);

    return {
      intent,
      isFollowUp,
      needsMemory:
        isFollowUp ||
        hasHistory ||
        intent === "reasoning",
      complexity,
      priority:
        intent === "followup" || intent === "reasoning"
          ? "high"
          : "normal",
      confidence: isFollowUp ? 0.98 : 0.8,
      keywords,
    };
  }
}
