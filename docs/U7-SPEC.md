# U7 — Governance & Policy Engine

## Overview

U7 transforms AshenAI from a system that performs individual Discord administrative actions into one that can reason about, inspect, and enforce configurable server governance policies.

## Architecture

### Two-Layer Design

**Planning Layer (U7):** Governance engine creates deterministic remediation plans.
**Execution Layer (U1-U6.1):** Existing Discord mutation tools execute approved remediation steps.

```
Inspection → Violation → Remediation Plan → Authorization/Risk Evaluation → Confirmation → Current-State Re-Check → Existing Mutation Tool → Discord Execution → Audit Result
```

### Tool Dispatch Mapping

| Remediation Action | Existing Tool | Risk |
|-------------------|---------------|------|
| permission change | `manage_channel_permissions` | high |
| preset change | `apply_channel_preset` | high |
| channel rename | `rename_channel` | medium |
| channel move | `move_channel` | medium |
| channel creation | `create_channel` | medium |
| category creation | `create_category` | medium |
| category protection | `protect_category` | medium |

### Key Principle

U7 never directly modifies Discord. All Discord mutations go through existing U1-U6.1 tools with their full security pipeline (validation → confirmation → protection check → execution → audit).

## Tools

| Tool | Role | Risk | Confirmation | Mutates |
|------|------|------|-------------|---------|
| `view_guild_policy` | moderator | low | no | nothing |
| `inspect_guild_governance` | moderator | low | no | nothing |
| `detect_policy_drift` | moderator | low | no | nothing |
| `generate_governance_report` | moderator | low | no | nothing |
| `create_guild_policy` | admin | medium | yes | policy config |
| `update_guild_policy` | admin | medium | yes | policy config |
| `list_policy_templates` | moderator | low | no | nothing |
| `apply_policy_template` | admin | high | yes | policy config |
| `plan_policy_remediation` | admin | low | no | nothing |

## Security Model

- Guild-isolated policy storage
- No direct Discord API calls from governance tools
- Remediation plans identify which existing tool to use
- All execution goes through existing U1-U6.1 pipeline
- Protected resource checks enforced at execution time
- Deterministic evaluation (pure functions)
- Atomic file writes for policy persistence
