import { createTask, getProgress, validateTaskPlan } from "../src/agent/tasks/planner";
import { TaskExecutor } from "../src/agent/tasks/executor";
import { isActionAllowed } from "../src/agent/tasks/permissions";
import { upsertTask, getTask, deleteTask } from "../src/agent/tasks/store";

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown) {
  console.error(`❌ ${name}`, error ?? "");
  failed++;
}

function expectThrows(name: string, fn: () => void) {
  try {
    fn();
    fail(name, "Expected an exception.");
  } catch {
    pass(name);
  }
}

async function main(): Promise<void> {
  console.log("\\n🧪 AshenAI Autonomous Task Tests\\n");

  try {
    const task = createTask("Test autonomous task", [
      {
        title: "Check project",
        description: "Check project health",
        action: "check_project",
      },
      {
        title: "Run tests",
        description: "Run tests",
        action: "run_tests",
      },
    ]);

    if (
      task.status === "pending" &&
      task.steps.length === 2 &&
      task.currentStep === 0 &&
      task.steps[0].attempts === 0 &&
      task.steps[0].status === "pending"
    ) {
      pass("Task creation");
    } else {
      fail("Task creation", JSON.stringify(task));
    }

    const progress = getProgress(task);

    if (
      progress.total === 2 &&
      progress.completed === 0 &&
      progress.percentage === 0 &&
      progress.status === "pending"
    ) {
      pass("Initial task progress");
    } else {
      fail("Initial task progress", JSON.stringify(progress));
    }
  } catch (error) {
    fail("Planner basics", error);
  }

  try {
    validateTaskPlan([
      {
        title: "Diagnose",
        description: "Run TypeScript verification",
        action: "typecheck",
      },
      {
        title: "Repair",
        description: ["FILE: src/example.ts", "ERROR: error TS1234: Example failure"].join("\n"),
        action: "repair_file",
      },
      {
        title: "Verify",
        description: "Run TypeScript verification after repair",
        action: "typecheck",
      },
    ]);

    pass("Valid diagnostic → repair → verification plan");

    expectThrows(
      "repair_file cannot be the first step",
      () => {
        validateTaskPlan([
          {
            title: "Repair",
            description: ["FILE: src/example.ts", "ERROR: error TS1234: Failure"].join("\n"),
            action: "repair_file",
          },
        ]);
      },
    );

    expectThrows(
      "Multiple repair_file actions are rejected",
      () => {
        validateTaskPlan([
          {
            title: "Diagnose",
            description: "Run diagnostics",
            action: "typecheck",
          },
          {
            title: "Repair one",
            description: ["FILE: src/a.ts", "ERROR: error TS1: Failure"].join("\n"),
            action: "repair_file",
          },
          {
            title: "Repair two",
            description: ["FILE: src/b.ts", "ERROR: error TS2: Failure"].join("\n"),
            action: "repair_file",
          },
        ]);
      },
    );

    expectThrows(
      "Actions other than verification cannot follow repair",
      () => {
        validateTaskPlan([
          {
            title: "Diagnose",
            description: "Inspect project",
            action: "check_project",
          },
          {
            title: "Repair",
            description: ["FILE: src/a.ts", "ERROR: error TS1: Failure"].join("\n"),
            action: "repair_file",
          },
          {
            title: "Search",
            description: "Search project",
            action: "search_project",
          },
        ]);
      },
    );

    expectThrows("Empty plans are rejected", () => {
      validateTaskPlan([]);
    });

    expectThrows("Plans over eight steps are rejected", () => {
      validateTaskPlan(
        Array.from({ length: 9 }, (_, i) => ({
          title: `Step ${i + 1}`,
          description: "Check project",
          action: "check_project",
        })),
      );
    });
  } catch (error) {
    fail("Plan safety tests", error);
  }

  try {
    if (isActionAllowed("project_status")) {
      pass("project_status permission");
    } else {
      fail("project_status permission");
    }

    if (isActionAllowed("typecheck")) {
      pass("typecheck permission");
    } else {
      fail("typecheck permission");
    }

    if (isActionAllowed("repair_file")) {
      pass("repair_file currently has an assigned permission");
    } else {
      fail("repair_file currently has an assigned permission");
    }

    if (!isActionAllowed("unknown_action")) {
      pass("Unknown action denied");
    } else {
      fail("Unknown action denied");
    }
  } catch (error) {
    fail("Permission tests", error);
  }

  try {
    const executor = new TaskExecutor();

    executor.registerAction("test_action", async ({ step }) => {
      return `Executed: ${step.title}`;
    });

    const task = createTask("Executor test", [
      {
        title: "Execute test action",
        description: "Test executor",
        action: "test_action",
        maxAttempts: 1,
      },
    ]);

    const result = await executor.run(task);

    if (
      result.status === "failed" &&
      result.steps[0].status === "failed" &&
      result.steps[0].error?.includes("Permission denied")
    ) {
      pass("Executor enforces action permissions");
    } else {
      fail(
        "Executor enforces action permissions",
        JSON.stringify(result),
      );
    }
  } catch (error) {
    fail("Executor permission enforcement", error);
  }

  try {
    const executor = new TaskExecutor();

    executor.registerAction("project_status", async () => {
      return "PROJECT OK";
    });

    const task = createTask("Allowed executor test", [
      {
        title: "Project status",
        description: "Check project status",
        action: "project_status",
        maxAttempts: 1,
      },
    ]);

    const result = await executor.run(task);

    if (
      result.status === "completed" &&
      result.steps[0].status === "completed" &&
      result.steps[0].result === "PROJECT OK" &&
      result.steps[0].attempts === 1
    ) {
      pass("Executor runs allowed action");
    } else {
      fail("Executor runs allowed action", JSON.stringify(result));
    }
  } catch (error) {
    fail("Allowed executor action", error);
  }

  try {
    const executor = new TaskExecutor();
    let attempts = 0;

    executor.registerAction("typecheck", async () => {
      attempts++;

      if (attempts < 2) {
        throw new Error("Intentional first-attempt failure");
      }

      return "Recovered";
    });

    const task = createTask("Retry test", [
      {
        title: "Retry action",
        description: "Test retry behavior",
        action: "typecheck",
        maxAttempts: 2,
      },
    ]);

    const result = await executor.run(task);

    if (
      result.status === "completed" &&
      result.steps[0].status === "completed" &&
      result.steps[0].attempts === 2 &&
      result.steps[0].result === "Recovered"
    ) {
      pass("Executor retries failed actions");
    } else {
      fail("Executor retries failed actions", JSON.stringify(result));
    }
  } catch (error) {
    fail("Executor retry behavior", error);
  }

  try {
    const task = createTask("Persistence test", [
      {
        title: "Status",
        description: "Persist task",
        action: "project_status",
      },
    ]);

    await upsertTask(task);

    const loaded = await getTask(task.id);

    if (loaded?.id === task.id && loaded.goal === task.goal) {
      pass("Task persistence");
    } else {
      fail("Task persistence", JSON.stringify(loaded));
    }

    const deleted = await deleteTask(task.id);

    if (deleted && !(await getTask(task.id))) {
      pass("Task deletion");
    } else {
      fail("Task deletion");
    }
  } catch (error) {
    fail("Task persistence", error);
  }

  console.log("\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed === 0) {
    console.log("🎉 ALL TASK TESTS PASSED");
  } else {
    console.log("❌ TASK TESTS FAILED");
    process.exitCode = 1;
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n");
}

void main();
