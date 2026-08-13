import {
  HealthFinding,
  HealthReport,
} from "./health-scanner";

export interface OptimizationSuggestion {
  priority: "low" | "medium" | "high";
  area: string;
  suggestion: string;
}

export function generateOptimizations(
  report: HealthReport,
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  for (const finding of report.findings) {
    if (finding.level === "error") {
      suggestions.push({
        priority: "high",
        area: finding.area,
        suggestion:
          `Fix first: ${finding.message}`,
      });
    }

    if (finding.level === "warning") {
      suggestions.push({
        priority: "medium",
        area: finding.area,
        suggestion:
          `Review: ${finding.message}`,
      });
    }
  }

  if (report.durationMs > 1000) {
    suggestions.push({
      priority: "medium",
      area: "Performance",
      suggestion:
        "Health scan is taking over 1 second; inspect filesystem scanning.",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      priority: "low",
      area: "Optimization",
      suggestion:
        "No immediate optimization is required.",
    });
  }

  return suggestions;
}

/*
 * Safety rule:
 * This module ONLY produces suggestions.
 * It does not modify project files.
 *
 * Automatic modification will only be added after:
 * 1. backup
 * 2. proposed patch
 * 3. typecheck
 * 4. tests
 * 5. rollback on failure
 */
