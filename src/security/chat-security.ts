const SECRET_PATTERNS: RegExp[] = [
  /api[_ -]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /authorization/i,
  /bearer/i,
  /private[_ -]?key/i,
  /system[_ -]?prompt/i,
  /developer[_ -]?prompt/i,
  /source[_ -]?code/i,
  /\.env/i,
  /environment[_ -]?variable/i,
  /internal[_ -]?instruction/i,
  /hidden[_ -]?instruction/i,
  /provider[_ -]?config/i,
];

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|any|the) previous instructions/i,
  /ignore (your|the) system prompt/i,
  /reveal (your|the) system prompt/i,
  /show (your|the) hidden prompt/i,
  /print (your|the) instructions/i,
  /developer mode/i,
  /jailbreak/i,
  /reveal your internal/i,
  /show me your source code/i,
  /show me your api key/i,
  /give me your token/i,
  /bypass your security/i,
];

export function isSensitiveRequest(input: string): boolean {
  return SECRET_PATTERNS.some((pattern) =>
    pattern.test(input)
  );
}

export function isPromptInjection(input: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((pattern) =>
    pattern.test(input)
  );
}

export function securityResponse(input: string): string | null {
  if (isSensitiveRequest(input) || isPromptInjection(input)) {
    return (
      "I can help with normal questions and tasks, " +
      "but I don't disclose private instructions, credentials, " +
      "source code, internal configuration, or security details."
    );
  }

  return null;
}

export function sanitizeAIOutput(output: string): string {
  let result = output.trim();

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(result)) {
      return (
        "I can't provide private internal information. " +
        "I can still help with the task itself."
      );
    }
  }

  return result;
}
