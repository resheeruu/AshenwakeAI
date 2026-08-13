export type RequestIntent =
  | "general"
  | "coding"
  | "reasoning"
  | "creative"
  | "factual"
  | "followup"
  | "greeting";

export interface RequestAnalysis {
  intent: RequestIntent;
  isFollowUp: boolean;
  needsMemory: boolean;
  complexity: "low" | "medium" | "high";
  priority: "normal" | "high";
  confidence: number;
  keywords: string[];
}
