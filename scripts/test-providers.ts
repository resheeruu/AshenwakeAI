import "dotenv/config";

import { providers } from "../src/ai/providers";
import { AIRequest } from "../src/ai/types";

const testRequest: AIRequest = {
  messages: [
    {
      role: "user",
      content: "Reply with exactly: AshenAI provider test OK",
    },
  ],
  temperature: 0,
  maxTokens: 1024,
};

type TestResult = {
  name: string;
  status: string;
  latency: number | null;
  error: string | null;
  response?: string;
};

async function testProvider(
  provider: any
): Promise<TestResult> {
  const started = Date.now();

  try {
    if (!provider.isAvailable()) {
      return {
        name: provider.name,
        status: "⚪ NOT CONFIGURED",
        latency: null,
        error: "API key missing",
      };
    }

    const response = await provider.generate(testRequest);
    const text = response?.text?.trim() || "";

    if (!text) {
      return {
        name: provider.name,
        status: "❌ FAILED",
        latency: Date.now() - started,
        error: "Provider returned an empty response.",
      };
    }

    return {
      name: provider.name,
      status: "✅ WORKING",
      latency: Date.now() - started,
      error: null,
      response: text,
    };
  } catch (error) {
    return {
      name: provider.name,
      status: "❌ FAILED",
      latency: Date.now() - started,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

async function main() {
  console.log("");
  console.log("🔥 AshenAI — Provider Test");
  console.log("");
  console.log(
    `🧪 Testing ${providers.length} providers...`
  );
  console.log("");

  const results: TestResult[] = [];

  for (const provider of providers) {
    process.stdout.write(
      `⏳ Testing ${provider.name}... `
    );

    const result = await testProvider(provider);
    results.push(result);

    if (result.status === "✅ WORKING") {
      console.log(
        `${result.status} ${result.latency}ms`
      );

      if (result.response) {
        console.log(`   ↳ ${result.response}`);
      }
    } else if (
      result.status === "⚪ NOT CONFIGURED"
    ) {
      console.log(result.status);
    } else {
      console.log(result.status);

      if (result.error) {
        console.log(
          `   ↳ ${result.error.slice(0, 300)}`
        );
      }
    }
  }

  const working = results.filter(
    (r) => r.status === "✅ WORKING"
  ).length;

  const failed = results.filter(
    (r) => r.status === "❌ FAILED"
  ).length;

  const notConfigured = results.filter(
    (r) => r.status === "⚪ NOT CONFIGURED"
  ).length;

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `📊 Working:        ${working}/${results.length}`
  );
  console.log(
    `❌ Failed:         ${failed}/${results.length}`
  );
  console.log(
    `⚪ Not configured: ${notConfigured}/${results.length}`
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  console.log("🏆 Working providers:");

  for (const result of results) {
    if (result.status === "✅ WORKING") {
      console.log(
        `   ${result.name} — ${result.latency}ms`
      );
    }
  }

  console.log("");

  console.log("❌ Providers requiring attention:");

  for (const result of results) {
    if (result.status === "❌ FAILED") {
      console.log(
        `   ${result.name} — ${result.error}`
      );
    }
  }

  console.log("");
}

main().catch((error) => {
  console.error(
    "❌ Provider tester crashed:",
    error
  );

  process.exit(1);
});
