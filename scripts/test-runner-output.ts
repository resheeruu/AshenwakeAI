export function combineChildOutput(stdout: unknown, stderr: unknown): string {
  const out = stdout == null ? "" : String(stdout);
  const err = stderr == null ? "" : String(stderr);
  return [out, err].filter(Boolean).join("\n");
}
