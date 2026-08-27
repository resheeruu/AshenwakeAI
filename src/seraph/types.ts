export interface SeraphStatus {
  active: boolean;
  version: string;
  uptime: number;
  lastCheck: number;
  components: SeraphComponent[];
}

export interface SeraphComponent {
  name: string;
  status: "operational" | "degraded" | "offline";
  lastCheck: number;
  message?: string;
}

export interface SeraphDoctorResult {
  overall: "healthy" | "degraded" | "unhealthy";
  score: number;
  checks: SeraphCheck[];
  recommendations: string[];
  timestamp: number;
}

export interface SeraphCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  autoFix?: string;
}

export interface SeraphInvestigation {
  id: string;
  problem: string;
  startedAt: number;
  completedAt?: number;
  status: "running" | "completed" | "failed";
  findings: SeraphFinding[];
  recommendations: string[];
}

export interface SeraphFinding {
  severity: "info" | "warning" | "error" | "critical";
  area: string;
  message: string;
  evidence?: string;
}

export interface SeraphReport {
  id: string;
  type: "health" | "performance" | "security" | "diagnostic";
  generatedAt: number;
  summary: string;
  sections: SeraphReportSection[];
}

export interface SeraphReportSection {
  title: string;
  content: string;
  severity?: "info" | "warning" | "error";
}

export interface SeraphTool {
  name: string;
  description: string;
  category: "diagnostic" | "repair" | "monitoring" | "report";
  safe: boolean;
}
