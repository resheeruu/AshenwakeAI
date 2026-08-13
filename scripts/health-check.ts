import {
  scanAshenAI,
} from "../src/diagnostics/health-scanner";

import {
  generateOptimizations,
} from "../src/diagnostics/optimizer";

const report = scanAshenAI();
const optimizations =
  generateOptimizations(report);

console.log("");
console.log("🔍 AshenAI Health Scanner");
console.log("==========================");
console.log(
  `📁 TypeScript files scanned: ${report.filesScanned}`,
);
console.log(
  `⚡ Scan time: ${report.durationMs}ms`,
);
console.log("");

for (const finding of report.findings) {
  const icon =
    finding.level === "ok"
      ? "✅"
      : finding.level === "warning"
        ? "⚠️"
        : "❌";

  console.log(
    `${icon} [${finding.area}] ${finding.message}`,
  );
}

console.log("");
console.log("🧠 Optimization Suggestions");
console.log("============================");

for (const item of optimizations) {
  console.log(
    `• ${item.priority.toUpperCase()} [${item.area}] ${item.suggestion}`,
  );
}

console.log("");
console.log("✅ Scan complete.");
