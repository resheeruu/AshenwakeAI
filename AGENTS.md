Inspect the current AshenAI command architecture and make one final consistency pass.

Focus ONLY on command acknowledgment ownership and UX consistency across "/ask", "/prompt", "/help", "/send", "/reset", "/status", "/config", "/diagnose", "/server", "/userinfo", "/roles", "/warn", "/warnings", "/timeout", "/untimeout", and other slash commands.

Requirements:

- Every interaction must have exactly ONE acknowledgment owner.
- No command may call reply/deferReply/editReply after another layer already owns the acknowledgment unless explicitly designed for follow-up/update.
- Prevent "application did not respond", double replies, Unknown interaction, and expired interaction errors.
- Keep the existing centralized acknowledgment architecture; do not create another handler/system.
- "/prompt" remains the ONLY builder mode.
- "/ask" remains normal AI chat.
- "/send" remains trusted-only direct bot messaging.
- "/help" remains grey Embed + edit-in-place navigation.
- Keep onboarding, security, memory, executor, tools, audit, undo, and permissions unchanged.
- Keep all command UX visually consistent: clean embeds, concise errors, no internal logs/security-wrapper text.
- Do not expose Termux, stack traces, raw tool names, or implementation details.
- Do not rewrite unrelated code.

Inspect first, modify only necessary files.

Then run:
npm run typecheck
npm run build
npm test

Report only what was changed and test results.
