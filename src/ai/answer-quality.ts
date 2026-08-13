import { AIRequest, AIResponse, ChatMessage } from "./types";

export interface AnswerQualityResult {
  text: string;
  unfinished: boolean;
  reason?: string;
}

export class AnswerQualityEngine {
  private readonly minimumLength = 20;

  private looksUnfinished(text: string): boolean {
    const value = text.trim();

    if (!value) return true;

    if (value.length < this.minimumLength) {
      return true;
    }

    // Obvious unfinished endings
    if (/[,:;(\-]$/.test(value)) {
      return true;
    }

    // Markdown/code that was opened but not closed
    const codeBlocks =
      (value.match(/```/g) ?? []).length;

    if (codeBlocks % 2 !== 0) {
      return true;
    }

    // Common signs of truncated generation
    const unfinishedEndings = [
      "for example:",
      "such as:",
      "including:",
      "because",
      "although",
      "however,",
      "therefore,",
      "which means",
      "this is because",
      "the main reason is",
      "in conclusion,"
    ];

    const lower = value.toLowerCase();

    if (
      unfinishedEndings.some(
        ending => lower.endsWith(ending)
      )
    ) {
      return true;
    }

    return false;
  }

  inspect(text: string): AnswerQualityResult {
    const unfinished = this.looksUnfinished(text);

    return {
      text: text.trim(),
      unfinished,
      reason: unfinished
        ? "The generated answer appears incomplete."
        : undefined,
    };
  }

  buildContinuationRequest(
    original: AIRequest,
    answer: string
  ): AIRequest {
    const messages: ChatMessage[] = [
      ...original.messages,
      {
        role: "assistant",
        content: answer,
      },
      {
        role: "user",
        content:
          "Continue the previous answer from exactly where it stopped. " +
          "Do not repeat the previous content. Finish the explanation " +
          "naturally and completely. If a list, example, code block, " +
          "or sentence was started, finish it. Return only the continuation.",
      },
    ];

    return {
      ...original,
      messages,
    };
  }

  combine(
    first: string,
    continuation: string
  ): string {
    const a = first.trim();
    const b = continuation.trim();

    if (!b) return a;
    if (!a) return b;

    return `${a}\n${b}`;
  }

  validateResponse(
    response: AIResponse
  ): AnswerQualityResult {
    return this.inspect(response.text);
  }
}
