import { repairFile } from "../selfHeal";
import { taskEngine } from "./index";
import {
  checkProject,
  checkDependencies,
  projectStatus,
  searchProject,
  typecheck,
  runTests,
} from "../tools";

let initialized = false;

export function initializeTaskEngine(): void {
  if (initialized) {
    return;
  }

  taskEngine.registerAction(
    "project_status",
    async () => projectStatus(),
  );

  taskEngine.registerAction(
    "check_dependencies",
    async () => checkDependencies(),
  );

  taskEngine.registerAction(
    "check_project",
    async () => checkProject(),
  );

  taskEngine.registerAction(
    "typecheck",
    async () => typecheck(),
  );

  taskEngine.registerAction(
    "run_tests",
    async () => runTests(),
  );

  taskEngine.registerAction(
    "repair_file",
    async ({ step }) => {
      const description =
        step.description.trim();

      const match =
        description.match(
          /^FILE:\s*(.+?)\s*\nERROR:\s*([\s\S]+)$/i,
        );

      if (!match) {
        throw new Error(
          "repair_file requires: FILE: <path>\\nERROR: <verification error>",
        );
      }

      const filePath =
        match[1].trim();

      const errorOutput =
        match[2].trim();

      if (!filePath || !errorOutput) {
        throw new Error(
          "Repair file path and verification error are required.",
        );
      }

      const repaired =
        await repairFile(
          filePath,
          errorOutput,
        );

      return repaired
        ? `✅ Repair succeeded: ${filePath}`
        : `❌ Repair rejected or rolled back: ${filePath}`;
    },
  );

  taskEngine.registerAction(
    "search_project",
    async ({ step }) => {
      const query =
        step.description.trim();

      if (!query) {
        throw new Error(
          "Search query is empty.",
        );
      }

      return searchProject(query);
    },
  );

  initialized = true;
}
