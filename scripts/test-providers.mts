import { GroqProvider } from "../src/ai/providers/groq.ts";
import { GeminiProvider } from "../src/ai/providers/gemini.ts";

const req = {
  messages: [{ role: "user", content: "Reply exactly TEST_OK" }],
  maxTokens: 50,
  temperature: 0,
};

for (const [name, Provider] of [
  ["GROQ", GroqProvider],
  ["GEMINI", GeminiProvider],
] as const) {
  try {
    const result = await new Provider().generate(req);
    console.log(`${name} ✅ ${result.text}`);
  } catch (error) {
    console.log(
      `${name} ❌`,
      error instanceof Error ? error.message : error
    );
  }
}
