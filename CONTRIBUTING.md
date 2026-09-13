# Contributing to AshenAI

## Getting Started

```bash
git clone https://github.com/resheeruu/AshenAI.git
cd AshenAI
npm install
cp .env.example .env
npm run build
npm test
```

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run validation: `npm run typecheck && npm test`
4. Commit with a clear message
5. Open a pull request

## Code Style

- TypeScript strict mode
- No duplicate subsystems — reuse existing implementations (see AGENTS.md)
- All external inputs are untrusted — validate at boundaries
- Every expensive operation must have bounds

## Testing

```bash
npm test              # Mandatory test suite
npm run test:smoke    # Production smoke test
npm run test:all      # All suites including optional
npm run typecheck     # TypeScript check
```

## Architecture

See `docs/ARCHITECTURE.md` for the full system overview.

Key rule: Do NOT create duplicate systems (second router, second cache, second database, etc.). Extend existing ones.

## Pull Requests

- Keep PRs focused on a single change
- Include test coverage for new functionality
- Ensure `npm test` and `npm run typecheck` pass
- Reference any related issues
