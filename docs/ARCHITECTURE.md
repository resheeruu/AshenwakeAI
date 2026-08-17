# AshenAI Architecture

## Core Principle

AshenAI is a modular Discord AI system with multiple AI providers, intelligent routing, persistent memory, security controls, autonomous task execution, diagnostics, and game/economy systems.

Agents must extend existing modules rather than creating parallel implementations.

## Major Areas

### `src/ai/`

AI abstraction and routing.

Important responsibilities:

- provider adapters
- AI request/response types
- intelligent provider selection
- fallback
- provider health
- performance history
- memory/context integration

### `src/agent/`

Autonomous coding/task agent system.

Important responsibilities:

- task planning
- task lifecycle
- execution
- verification
- self-healing
- diagnostics
- agent management

### `src/coding-agents/`

External coding-agent integration.

This layer should allow multiple coding agents to participate without changing AshenAI's core architecture.

Agents should be treated as interchangeable workers.

### `src/commands/`

Discord command layer.

Commands should remain thin and delegate business logic to appropriate services.

### `src/games/`

Game and economy subsystem.

Important principles:

- atomic mutations
- concurrency protection
- settlement
- rewards
- inventory
- progression
- casino/game logic

### `src/security/`

Security boundary.

Security code must not be weakened to make another feature work.

### `src/diagnostics/`

Health checking and optimization.

### `src/web/`

Web interface/server functionality.

### `scripts/`

Development, testing, diagnostics, and verification scripts.

## Data Flow

User/Discord
    ↓
Command Handler
    ↓
AI / Game / Task subsystem
    ↓
Core services
    ↓
Persistence / external providers

For coding-agent work:

Task
    ↓
Planner
    ↓
Coding Agent
    ↓
Repository changes
    ↓
Typecheck/tests
    ↓
Verification
    ↓
Handoff
    ↓
Next Agent

## Multi-Agent Principle

Agents do not independently redefine AshenAI.

They share:

- architecture
- rules
- current task
- status
- handoff
- verification requirements

An agent that runs out of quota or stops must leave enough state for another agent to continue safely.
