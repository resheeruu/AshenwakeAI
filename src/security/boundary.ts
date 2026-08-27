export interface BoundaryResult {
  matched: boolean;
  response?: string;
}

export function checkBoundary(prompt: string): BoundaryResult {
  const lower = prompt.toLowerCase().trim();
  const normalized = lower
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ");

  // "I know" variations, slang, typos, Taglish hints
  if (/\bi\s+k?now\b/.test(normalized) || /\biknow\b/.test(normalized) || /\bi\s*no\b/.test(normalized)) {
    return { matched: true, response: "Cool, I know - but know what exactly?" };
  }

  // Abuse / teasing with typo/slang tolerance
  if (/\b(useless|uslss|useles|stupid|stupid|dumb|idiot|garbage|trash|garbge|walang\s*kwenta)\b/.test(normalized)) {
    return { matched: true, response: "I'm here to help - if something felt off or unclear, just say so and I'll explain it differently." };
  }

  // "Fair enough" variations
  if (/\bfair\s*enuf\b/.test(normalized) || /\bfair\s*enough\b/.test(normalized) || /\bfair\b/.test(normalized)) {
    return { matched: true, response: "Fair enough - glad we agree. What's next?" };
  }

  return { matched: false };
}