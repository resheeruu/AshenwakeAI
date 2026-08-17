import {
  CodingAgentCoordinator,
  CodingAgentRegistry,
} from "../src/coding-agents";
import {
  loadHandoffs,
  recordHandoff,
  getHandoffsForTask,
  getLatestHandoff,
} from "../src/coding-agents/handoff";

let passed = 0;
let failed = 0;

function pass(name: string): void {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(
  name: string,
  error?: unknown,
): void {
  console.error(`❌ ${name}`, error ?? "");
  failed++;
}

async function main(): Promise<void> {
  console.log(
    "\n🧪 AshenAI Coding Agent Coordinator Tests\n",
  );

  const registry = new CodingAgentRegistry();

  registry.register({
    name: "Test Primary",
    command: "true",
    version: "1.0.0",
    role: "primary",
    async isAvailable() {
      return true;
    },
  });

  registry.register({
    name: "Test Fallback",
    command: "true",
    version: "1.0.0",
    role: "fallback",
    async isAvailable() {
      return true;
    },
  });

  const coordinator =
    new CodingAgentCoordinator(registry);

  try {
    const available =
      await coordinator.getAvailableAgents();

    if (available.length === 2) {
      pass("Available coding agents detected");
    } else {
      fail(
        "Available coding agents detected",
        available.length,
      );
    }
  } catch (error) {
    fail("Agent discovery", error);
  }

  try {
    const selected =
      await coordinator.selectAgent();

    if (selected.name === "Test Primary") {
      pass("Primary agent selected first");
    } else {
      fail(
        "Primary agent selected first",
        selected.name,
      );
    }
  } catch (error) {
    fail("Agent selection", error);
  }

  const task = {
    id: "test-task-coding-agent",
    goal: "Test coding-agent handoff",
    status: "paused" as const,
    steps: [],
    currentStep: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const handoff =
      await coordinator.handoff(
        task,
        "Test Primary",
        "timeout",
        "Primary agent completed inspection.",
        [
          "Implement the remaining change.",
          "Run typecheck.",
        ],
      );

    if (
      handoff.taskId === task.id &&
      handoff.fromAgent === "Test Primary" &&
      handoff.toAgent === "Test Fallback"
    ) {
      pass("Coding-agent handoff created");
    } else {
      fail(
        "Coding-agent handoff created",
        JSON.stringify(handoff),
      );
    }
  } catch (error) {
    fail("Coding-agent handoff", error);
  }

  try {
    const latest =
      await getLatestHandoff(task.id);

    const all =
      await getHandoffsForTask(task.id);

    if (
      latest?.taskId === task.id &&
      all.length >= 1
    ) {
      pass("Handoff persisted and retrieved");
    } else {
      fail(
        "Handoff persisted and retrieved",
        JSON.stringify({ latest, all }),
      );
    }
  } catch (error) {
    fail("Handoff persistence", error);
  }

  try {
    const all =
      await loadHandoffs();

    if (Array.isArray(all)) {
      pass("Handoff store loads safely");
    } else {
      fail("Handoff store loads safely");
    }
  } catch (error) {
    fail("Handoff store", error);
  }

  console.log(
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log(
      "🎉 ALL CODING AGENT TESTS PASSED",
    );
  }

  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
}

void main();
