import { AIRequest, AIResponse } from "../types";

export function now(): number {
  return Date.now();
}

export function buildResponse(
  text: string,
  provider: string,
  model: string,
  startedAt: number
): AIResponse {
  return {
    text,
    provider,
    model,
    latencyMs: Date.now() - startedAt,
  };
}

export function getLastUserMessage(
  request: AIRequest
): string {
  const message = [...request.messages]
    .reverse()
    .find((item) => item.role === "user");

  return message?.content || "";
}

export function getSystemMessage(
  request: AIRequest
): string | undefined {
  const message = request.messages.find(
    (item) => item.role === "system"
  );

  return message?.content;
}

export function getConversationMessages(
  request: AIRequest
) {
  return request.messages.filter(
    (item) => item.role !== "system"
  );
}
