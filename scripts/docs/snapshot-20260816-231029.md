# AshenAI Architecture Snapshot

- Date: Sun Aug 16 23:10:29 PST 2026
- Root: /data/data/com.termux/files/home/AshenAI

## Runtime

- Node: v26.4.0
- npm: 12.0.2
- Platform: android
- Arch: arm64

## Live Source

src/agent/audit/audit-log.ts
src/agent/index.ts
src/agent/index.ts.working-backup
src/agent/lifecycle.ts
src/agent/manager.ts
src/agent/prompt.ts
src/agent/security/agent-security.ts
src/agent/selfHeal.ts
src/agent/supervisor/scheduler.ts
src/agent/supervisor/supervisor.ts
src/agent/tasks/aiPlanner.ts
src/agent/tasks/executor.ts
src/agent/tasks/index.ts
src/agent/tasks/integration.ts
src/agent/tasks/permissions.ts
src/agent/tasks/planner.ts
src/agent/tasks/store.ts
src/agent/tasks/types.ts
src/agent/tools.ts
src/ai/adaptive-personality.ts
src/ai/agent.ts
src/ai/analyzer/analyzer.ts
src/ai/analyzer/types.ts
src/ai/answer-quality.ts
src/ai/context/context-engine.ts
src/ai/memory.ts
src/ai/profile-analyzer.ts
src/ai/providers/anthropic.ts
src/ai/providers/cerebras.ts
src/ai/providers/cohere.ts
src/ai/providers/config.ts
src/ai/providers/deepseek.ts
src/ai/providers/fireworks.ts
src/ai/providers/gemini.ts
src/ai/providers/groq.ts
src/ai/providers/http.ts
src/ai/providers/huggingface.ts
src/ai/providers/index.ts
src/ai/providers/mistral.ts
src/ai/providers/novita.ts
src/ai/providers/nvidia.ts
src/ai/providers/ollama.ts
src/ai/providers/openai-compatible.ts
src/ai/providers/openai.ts
src/ai/providers/openrouter.ts
src/ai/providers/registry.ts
src/ai/providers/sambanova.ts
src/ai/providers/together.ts
src/ai/providers/xai.ts
src/ai/router.final-backup-20260813-161612.ts
src/ai/router.ts
src/ai/types.ts
src/ai/user-profile.ts
src/analytics/usage-stats.ts
src/coding-agents/adapters/cli-agent.ts
src/coding-agents/coordinator.ts
src/coding-agents/handoff.ts
src/coding-agents/index.ts
src/coding-agents/registry.ts
src/coding-agents/types.ts
src/commands/adventure.ts
src/commands/ask.ts
src/commands/ask.ts.bak2
src/commands/casino.ts
src/commands/config.ts
src/commands/definitions.ts
src/commands/diagnose.ts
src/commands/game.clean-baseline.ts
src/commands/game.ts
src/commands/handler.ts
src/commands/help.ts
src/commands/hunt.ts
src/commands/moderation.ts
src/commands/profile.ts
src/commands/register.ts
src/commands/reset.ts
src/commands/server.ts
src/commands/status.ts
src/commands/task.ts
src/config/env.ts
src/diagnostics.ts
src/diagnostics/health-scanner.ts
src/diagnostics/optimizer.ts
src/discord/action-confirmations.ts
src/discord/action-router.ts
src/discord/interactive-moderation.ts
src/discord/moderation.ts
src/discord/server-actions.ts
src/discord/server-context.ts
src/discord/warnings.ts
src/games/adventures.ts
src/games/casino.ts
src/games/classes.ts
src/games/daily.ts
src/games/dungeonStore.ts
src/games/dungeons.ts
src/games/economy.ts
src/games/engine.ts
src/games/equipment.ts
src/games/games/blackjack.ts
src/games/games/chaos.ts
src/games/games/coinflip.ts
src/games/games/dice.ts
src/games/games/duel.ts
src/games/games/hunt.ts
src/games/games/mines.ts
src/games/games/quickdraw.ts
src/games/games/racing.ts
src/games/games/roulette.ts
src/games/games/rps.ts
src/games/games/slots.ts
src/games/games/trivia.ts
src/games/guilds.ts
src/games/hunting.ts
src/games/lock.ts
src/games/loot.ts
src/games/pets.ts
src/games/progression.ts
src/games/rewards.ts
src/games/settlement.ts
src/games/shop.ts
src/games/store.ts
src/games/types.ts
src/games/world.ts
src/games/worldBossStore.ts
src/games/worldBosses.ts
src/index.ts
src/log-stream.ts
src/logger.ts
src/security/admin.ts
src/security/chat-security.ts
src/security/context.ts
src/security/gateway.ts
src/security/index.ts
src/security/output-guard.ts
src/security/policy.ts
src/security/rate-limit.ts
src/security/tool-permissions.ts
src/web/public/assets/logo-1.png
src/web/public/assets/logo-2.png
src/web/public/index.html
src/web/server.ts

## Source Counts

     36 games
     34 ai
     19 commands
     19 agent
      9 security
      7 discord
      6 coding-agents
      4 web
      2 diagnostics
      1 logger.ts
      1 log-stream.ts
      1 index.ts
      1 diagnostics.ts
      1 config
      1 analytics

## Agent

src/agent/audit/audit-log.ts
src/agent/index.ts
src/agent/index.ts.working-backup
src/agent/lifecycle.ts
src/agent/manager.ts
src/agent/prompt.ts
src/agent/security/agent-security.ts
src/agent/selfHeal.ts
src/agent/supervisor/scheduler.ts
src/agent/supervisor/supervisor.ts
src/agent/tasks/aiPlanner.ts
src/agent/tasks/executor.ts
src/agent/tasks/index.ts
src/agent/tasks/integration.ts
src/agent/tasks/permissions.ts
src/agent/tasks/planner.ts
src/agent/tasks/store.ts
src/agent/tasks/types.ts
src/agent/tools.ts

## AI Providers

src/ai/providers/anthropic.ts
src/ai/providers/cerebras.ts
src/ai/providers/cohere.ts
src/ai/providers/config.ts
src/ai/providers/deepseek.ts
src/ai/providers/fireworks.ts
src/ai/providers/gemini.ts
src/ai/providers/groq.ts
src/ai/providers/http.ts
src/ai/providers/huggingface.ts
src/ai/providers/index.ts
src/ai/providers/mistral.ts
src/ai/providers/novita.ts
src/ai/providers/nvidia.ts
src/ai/providers/ollama.ts
src/ai/providers/openai-compatible.ts
src/ai/providers/openai.ts
src/ai/providers/openrouter.ts
src/ai/providers/registry.ts
src/ai/providers/sambanova.ts
src/ai/providers/together.ts
src/ai/providers/xai.ts

## TypeScript

npm notice run ashenai@1.0.0 npx
npm notice run 'tsc' --noEmit

TypeScript exit code: 0

## Installed AI CLI Tools

pi         0.84.2
gemini     0.55.1
rayu       1.5.16 (Rayu-CLI)
aistart    [?1049h[H[2J[H[2J  [44m[1m[37m PILIH AI ROUTER / PROVIDER [0m
copilot    NOT FOUND
ollama     Warning: could not connect to a running Ollama instance
crush      NOT FOUND

## Git State

 M package.json
 M scripts/check.ts
 M scripts/render-start.sh
 M scripts/watch-render-logs.sh
 M src/agent/index.ts
 M src/agent/manager.ts
 M src/agent/prompt.ts
 M src/agent/tasks/aiPlanner.ts
 M src/agent/tasks/integration.ts
 M src/agent/tasks/permissions.ts
 M src/agent/tasks/planner.ts
 M src/ai/providers/index.ts
 M src/ai/router.ts
 M src/ai/user-profile.ts
 M src/commands/ask.ts
 M src/commands/definitions.ts
 M src/commands/diagnose.ts
 M src/commands/game.ts
 M src/commands/handler.ts
 M src/commands/task.ts
 M src/config/env.ts
 M src/diagnostics/health-scanner.ts
 M src/games/daily.ts
 M src/games/engine.ts
 M src/games/games/chaos.ts
 M src/games/games/coinflip.ts
 M src/games/games/dice.ts
 M src/games/games/duel.ts
 M src/games/games/hunt.ts
 M src/games/games/rps.ts
 M src/games/loot.ts
 M src/games/rewards.ts
 M src/games/shop.ts
 M src/games/store.ts
 M src/games/types.ts
 M src/index.ts
?? .agent/
?? .aistart/
?? .ashenai/
?? .game-backup/
?? ashenai-game-inspection.txt
?? docs/
?? scripts/architecture-snapshot.sh
?? scripts/ashenai-audit.sh
?? scripts/check-coding-agents.ts
?? scripts/docs/
?? scripts/test-coding-agents.ts
?? scripts/test-settlement.ts
?? scripts/test-tasks.ts
?? src/agent/audit/
?? src/agent/security/
?? src/agent/supervisor/
?? src/ai/adaptive-personality.ts
?? src/ai/profile-analyzer.ts
?? src/ai/providers/ollama.ts
?? src/analytics/
?? src/coding-agents/
?? src/commands/adventure.ts
?? src/commands/ask.ts.bak2
?? src/commands/casino.ts
?? src/commands/game.clean-baseline.ts
?? src/commands/game.corrupted.latest.ts
?? src/commands/game.corrupted.ts
?? src/commands/game.damaged.1786795074.ts
?? src/commands/handler.ts.phase1-backup
?? src/commands/hunt.ts
?? src/commands/profile.ts
?? src/games/adventures.ts
?? src/games/casino.ts
?? src/games/classes.ts
?? src/games/dungeonStore.ts
?? src/games/dungeons.ts
?? src/games/economy.ts
?? src/games/equipment.ts
?? src/games/games/blackjack.ts
?? src/games/games/mines.ts
?? src/games/games/quickdraw.ts
?? src/games/games/racing.ts
?? src/games/games/roulette.ts
?? src/games/games/slots.ts
?? src/games/games/trivia.ts
?? src/games/guilds.ts
?? src/games/hunting.ts
?? src/games/lock.ts
?? src/games/pets.ts
?? src/games/progression.ts
?? src/games/settlement.ts
?? src/games/world.ts
?? src/games/worldBossStore.ts
?? src/games/worldBosses.ts
?? src/index.ts.phase1-backup

## Snapshot

This snapshot describes the inspected state only.
It does not modify application source.
