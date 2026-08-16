import { CodingAgentCoordinator } from "./coordinator";
import { CodingAgentRegistry } from "./registry";
import { CliCodingAgent } from "./adapters/cli-agent";

export const codingAgentRegistry =
  new CodingAgentRegistry();

codingAgentRegistry.register(
  new CliCodingAgent(
    "Gemini CLI",
    "gemini",
    "0.55.1",
    "primary",
  ),
);

codingAgentRegistry.register(
  new CliCodingAgent(
    "Qwen Code",
    "qwen",
    "0.21.12",
    "fallback",
  ),
);

codingAgentRegistry.register(
  new CliCodingAgent(
    "Pi Coding Agent",
    "pi",
    "0.84.2",
    "long_task",
  ),
);

codingAgentRegistry.register(
  new CliCodingAgent(
    "Fabric",
    "fabric",
    "1.4.470",
    "analysis",
  ),
);

codingAgentRegistry.register(
  new CliCodingAgent(
    "aichat",
    "aichat",
    "0.30.0",
    "general",
  ),
);

export * from "./types";
export * from "./registry";

export * from "./handoff";
export * from "./coordinator";

export const codingAgentCoordinator =
  new CodingAgentCoordinator(codingAgentRegistry);
