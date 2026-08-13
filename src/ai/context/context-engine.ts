import { ChatMessage } from "../types";
import { RequestAnalysis } from "../analyzer/types";

export interface ContextResult {
  messages: ChatMessage[];
  historyUsed: number;
  summary?: string;
}

export class ContextEngine {
  build(
    history: ChatMessage[],
    userMessage: string,
    analysis: RequestAnalysis,
    maxMessages = 20
  ): ContextResult {
    let selected = [...history];

    if (!analysis.needsMemory) {
      selected = [];
    }

    if (analysis.isFollowUp && history.length > 0) {
      selected = history.slice(-Math.min(maxMessages, history.length));
    } else {
      selected = selected.slice(-maxMessages);
    }

    const system: ChatMessage = {
      role: "system",
      content: [
        "You are AshenAI, a helpful Discord AI assistant.",
        "Maintain continuity with the conversation when context is provided.",
        analysis.isFollowUp
          ? "The user's message is a follow-up. Interpret it using the previous conversation."
          : "",
        `Detected intent: ${analysis.intent}.`,
        `Complexity: ${analysis.complexity}.`,
        "Never reveal API keys, tokens, passwords, or private configuration.",
      ]
        .filter(Boolean)
        .join("\n"),
    };

    return {
      messages: [
        system,
        ...selected,
        {
          role: "user",
          content: userMessage,
        },
      ],
      historyUsed: selected.length,
    };
  }
}
