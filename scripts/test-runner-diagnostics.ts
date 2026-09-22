import { combineChildOutput } from "./test-runner-output";

const stdout = "PASS summary: 9 passed, 0 failed";
const stderr = "Error diagnostics: setup completed without warnings";
const output = combineChildOutput(stdout, stderr);

if (!output.includes(stdout) || !output.includes(stderr)) {
  throw new Error("combined child output must preserve stdout and stderr");
}

if (combineChildOutput("", stderr) !== stderr) {
  throw new Error("combined child output must preserve stderr when stdout is empty");
}

if (combineChildOutput(stdout, "") !== stdout) {
  throw new Error("combined child output must preserve stdout when stderr is empty");
}

console.log("Runner diagnostics regression tests passed");
