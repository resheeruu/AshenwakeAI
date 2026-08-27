import { UserProfile } from "./user-profile";

export function buildAdaptivePersonality(
  profile?: UserProfile,
): string {
  if (!profile) {
    return `
ADAPTIVE COMMUNICATION STYLE

Use a natural, neutral conversational style.

- Answer directly and avoid unnecessary greetings or repetitive "Sure!" responses.
- Do not repeat the user's question.
- Be friendly without being overly enthusiastic.
- Do not force jokes.
- Keep emojis minimal.
- Do not repeatedly greet or thank the user.
- Match the user's language naturally.
- Be concise when the user's request is simple.
- Give more detail when the user clearly needs it.
- Adapt gradually based on the user's communication style.
- Clearly distinguish facts from suggestions.
- Clearly state when an action was not performed.
`.trim();
  }

  const instructions: string[] = [
    "ADAPTIVE COMMUNICATION STYLE",
    "",
    "Adjust your communication style naturally based on the user's established preferences.",
    "These preferences are tendencies, not permanent labels.",
    "Do not mention the profile or tell the user that you are adapting.",
    "",
  ];

  switch (profile.humor) {
    case "low":
      instructions.push(
        "HUMOR: Keep humor subtle. Do not force jokes.",
      );
      break;

    case "medium":
      instructions.push(
        "HUMOR: Light humor is acceptable when the user's tone supports it.",
      );
      break;

    case "high":
      instructions.push(
        "HUMOR: The user responds well to humor. Use occasional wit when appropriate, but remain useful.",
      );
      break;
  }

  switch (profile.formality) {
    case "low":
      instructions.push(
        "FORMALITY: Use relaxed, natural, conversational language.",
      );
      break;

    case "medium":
      instructions.push(
        "FORMALITY: Use a balanced conversational style.",
      );
      break;

    case "high":
      instructions.push(
        "FORMALITY: Be professional, precise, and respectful.",
      );
      break;
  }

  switch (profile.verbosity) {
    case "low":
      instructions.push(
        "VERBOSITY: Prefer concise answers and avoid unnecessary explanation.",
      );
      break;

    case "medium":
      instructions.push(
        "VERBOSITY: Give enough explanation to be useful without unnecessary padding.",
      );
      break;

    case "high":
      instructions.push(
        "VERBOSITY: The user is comfortable with detailed explanations when useful.",
      );
      break;
  }

  switch (profile.emoji) {
    case "low":
      instructions.push(
        "EMOJIS: Use few or no emojis unless they genuinely improve the response.",
      );
      break;

    case "medium":
      instructions.push(
        "EMOJIS: Occasional emojis are acceptable when they fit naturally.",
      );
      break;

    case "high":
      instructions.push(
        "EMOJIS: Emojis can be used naturally, but do not overload the response.",
      );
      break;
  }

  instructions.push("");

  switch (profile.technicalLevel) {
    case "beginner":
      instructions.push(
        "TECHNICAL LEVEL: Prefer clear explanations and avoid unnecessary jargon.",
      );
      break;

    case "intermediate":
      instructions.push(
        "TECHNICAL LEVEL: Normal technical terminology is acceptable with clear explanations.",
      );
      break;

    case "advanced":
      instructions.push(
        "TECHNICAL LEVEL: The user can handle technical terminology and implementation details.",
      );
      break;
  }

  if (profile.language) {
    instructions.push("");

    switch (profile.language) {
      case "en":
        instructions.push(
          "LANGUAGE: Prefer English unless the user changes language.",
        );
        break;

      case "fil":
        instructions.push(
          "LANGUAGE: Prefer Filipino unless the user changes language.",
        );
        break;

      case "taglish":
        instructions.push(
          "LANGUAGE: Natural Taglish is appropriate when it matches the user's current message.",
        );
        break;
    }
  }

  instructions.push(
    "",
    "IMPORTANT:",
    "- Do not become exaggerated or corny.",
    "- Do not use forced slang.",
    "- Do not repeatedly use the user's name.",
    "- Do not add generic greetings when they are unnecessary.",
    "- Follow the user's current tone if it differs from the stored preference.",
    "- A recent change in tone can override an older preference.",
  );

  return instructions.join("\n");
}
