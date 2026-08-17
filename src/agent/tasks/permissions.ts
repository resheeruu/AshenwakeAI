export type TaskPermission =
  | "read"
  | "diagnose"
  | "test";

const ACTION_PERMISSIONS: Record<
  string,
  TaskPermission
> = {
  project_status: "read",
  check_dependencies: "diagnose",
  check_project: "diagnose",
  search_project: "read",
  typecheck: "test",
  run_tests: "test",
  repair_file: "diagnose",
  coding_agent: "diagnose",
};

export function getActionPermission(
  action: string,
): TaskPermission | null {
  return (
    ACTION_PERMISSIONS[action] ??
    null
  );
}

export function isActionAllowed(
  action: string,
  allowed: TaskPermission[] = [
    "read",
    "diagnose",
    "test",
  ],
): boolean {
  const permission =
    getActionPermission(action);

  if (!permission) {
    return false;
  }

  return allowed.includes(permission);
}
