import { codingAgentRegistry } from "../src/coding-agents";

async function main(): Promise<void> {
  console.log("");
  console.log("🤖 ===== ASHENAI CODING AGENTS =====");

  const agents =
    codingAgentRegistry.getAll();

  for (const agent of agents) {
    const available =
      await agent.isAvailable();

    console.log(
      `${available ? "🟢" : "🔴"} ${agent.name} ` +
      `v${agent.version} ` +
      `[${agent.role}]`,
    );
  }

  console.log("");
  console.log(
    `📊 ${agents.length} coding agent(s) registered.`,
  );
  console.log("");
}

main().catch((error) => {
  console.error(
    "❌ Coding-agent check failed:",
    error instanceof Error
      ? error.message
      : error,
  );

  process.exit(1);
});
