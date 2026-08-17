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
    "prompt_arg",
  ),
);

codingAgentRegistry.register(
  new CliCodingAgent(
    "Qwen Code",
    "qwen",
    "0.21.12",
    "general",
    "prompt_arg",
  ),
);

codingAgentRegistry.register(
  new CliCodingAgent(
    "Pi Coding Agent",
    "pi",
    "0.84.2",
    "fallback",
    "print_arg",
  ),
);

codingAgentRegistry.register(
  new CliCodingAgent(
    "Fabric",
    "fabric",
    "1.4.470",
    "analysis",
    "stdin",
  ),
);

codingAgentRegistry.register(
  new CliCodingAgent(
    "aichat",
    "aichat",
    "0.30.0",
    "general",
    "text_arg",
  ),
);

export * from "./types";
export * from "./registry";

export * from "./handoff";
export * from "./coordinator";

export const codingAgentCoordinator =
  new CodingAgentCoordinator(codingAgentRegistry);
