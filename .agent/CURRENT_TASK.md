# Current AshenAI Task

## Objective

Build and maintain AshenAI using multiple coding agents while preserving the existing architecture.

## Current Phase

Multi-agent coordination and safe coding workflow.

## Rules

- Inspect before editing.
- Follow docs/ARCHITECTURE.md.
- Follow docs/AGENT_RULES.md.
- Make small, focused changes.
- Never replace existing systems without understanding them.
- Run typecheck and relevant tests after changes.
- If unable to finish, leave a complete handoff.

## Current Work

Establish the shared documentation and handoff system for all coding agents.

## Next Step

Inspect the existing coding-agent implementation under:

src/coding-agents/

Then verify how the registered agents are detected and how agent handoff should work.
