ASHENAI — SERVER ASSISTANT FINAL UX + PERFORMANCE + /PROMPT + /HELP

Work directly on the existing AshenAI codebase. Inspect the actual implementation first, then implement the changes. Preserve the existing architecture, security, tools, confirmation, memory, router, and permission systems.

Do NOT create duplicate executors, routers, AI engines, confirmation systems, permission databases, memory systems, template executors, or trusted-user systems.

---

1. CORE BEHAVIOR

AshenAI should behave like a fast, capable Discord server assistant that understands natural language.

These should work naturally:

@AshenAI hi
@AshenAI remove callerss
@AshenAI remove the bot from #general
@AshenAI rename general to lobby
@AshenAI delete all except general
@AshenAI clean this server
@AshenAI make my server better

Do not require predefined command-like wording.

If a request is understandable, resolve it against the actual Discord server.

Never unnecessarily respond:

"I'm not sure what you'd like me to do."

---

2. IMPORTANT MODE SEPARATION

Keep these modes completely separate:

@AshenAI / replies
→ FAST normal conversational AI

/ask
→ FAST normal AI chat

/prompt
→ ONLY server-builder/management mode

ash! <text>
→ trusted-only "send this message as the bot"

Mentions and replies MUST NOT enter builder mode.

If somebody says:

@AshenAI generate a gaming template

respond briefly:

"Use /prompt for server building and template operations."

Do not run the builder from the mention path.

---

3. /PROMPT BUILDER

"/prompt" is the ONLY builder interface.

When an authorized user runs "/prompt":

- Create a private Discord thread/session.
- Only the initiating user can see/use it.
- Keep builder conversation context inside the session.
- Name it clearly, e.g. "AshenAI Builder".
- Do not create duplicate active sessions.
- Expire the session after 10 minutes of inactivity.
- Warn shortly before expiration.
- Expire and clean up automatically.

Example:

AshenAI Builder

New Session

Tell me what you want to build, change, inspect, or fix.

Examples:
• "Inspect my server"
• "Create a gaming server"
• "Delete all channels except general"
• "Make my server better"

Keep the UI compact.

---

4. /PROMPT SESSION PRIVACY

The builder session must not become visible to ordinary server members.

Use the existing Discord/thread architecture where possible.

Do not create a completely separate permission system.

Ensure only the initiating user and required bot functionality can access the private session.

If Discord permissions make a fully private thread impossible in the current architecture, inspect the existing implementation and use the safest supported approach.

---

5. /PROMPT SESSION EXPIRATION

Inactive builder sessions expire after 10 minutes.

Before expiration:

"⏳ This builder session will expire soon if unused."

After expiration:

"⌛ This builder session expired. Start a new "/prompt" session when you're ready."

Do not leave stale sessions indefinitely.

---

6. FAST /PROMPT PROCESSING

Investigate why "/prompt" or template generation can take 10–15+ minutes.

Do NOT guess.

Trace the actual request path and identify:

- repeated AI calls
- repeated guild scans
- repeated Discord API calls
- sequential resource resolution
- repeated intent classification
- duplicate template generation
- unnecessary provider routing
- unnecessary provider health checks
- unnecessary web requests
- blocking filesystem I/O
- duplicate confirmation processing
- unnecessary member fetching
- unnecessary channel fetching

Optimize the real bottleneck.

For deterministic Discord operations:

1. Detect intent locally.
2. Read guild state once.
3. Resolve resources locally.
4. Build the plan locally.
5. Use the existing security/confirmation/executor pipeline.
6. Return the result.

Do not call an LLM repeatedly for deterministic operations.

Cache/reuse guild state during one request.

Target seconds, not minutes.

---

7. SERVER INSPECTION

After "/prompt", support:

"inspect my server"

"what should I add?"

"what should I delete?"

"make my server better"

"fix my server organization"

"clean my server"

The bot should inspect the actual guild.

Detect:

- channels
- categories
- roles
- duplicates
- uncategorized channels
- missing structure
- suspicious/ambiguous resources
- protected resources
- permission configuration problems

Never hard-code assumed server contents.

---

8. NATURAL-LANGUAGE RESOURCE RESOLUTION

Understand:

"remove callerss"

"delete the callerss channel"

"rename general to lobby"

"remove the bot from general"

"delete all except general"

Resolve names against actual Discord resources.

Support partial names and aliases only when safe.

If genuinely ambiguous, ask ONE concise clarification.

Do not expose internal tool names.

---

9. DELETE ALL EXCEPT

Support:

delete all except general

remove every channel except #general

clean everything except general and rules

delete all categories except information

Behavior:

- Inspect actual guild state.
- Resolve exceptions using real resource IDs.
- Preserve exceptions.
- Preserve protected resources.
- Never delete ambiguous resources automatically.
- Use ONE confirmation.
- Use the existing executor/security/confirmation/audit/undo system.

Compact preview:

🧹 Cleanup Plan

Remove
• 12 channels

Preserve
• #general

Protected / skipped
• 2 resources

Proceed?

After execution:

✅ Cleanup complete

Removed: 12 channels
Preserved: #general
Protected/skipped: 2

NEVER send one message for every deleted channel.

---

10. TEMPLATE UX

Template generation must be preview-only.

Examples:

/prompt generate a community template

/prompt create a gaming server

/prompt make my server like a Minecraft server

Show:

📋 Community Template

Create
• 1 role
• 3 categories
• 10 channels

Already present
• 2 matching resources

Skip
• 2 duplicates

Nothing has been changed.

Apply this template?

Only execute after confirmation.

Do not dump the complete raw operation list unless the user asks for details.

---

11. UNIFIED TEMPLATE + SERVER FIXES

If the user says:

"generate a template and fix my server"

create ONE unified plan.

The plan may contain:

Create
Fix
Configure
Preserve
Skip
Review

ONE confirmation.

ONE execution.

ONE final report.

Never create two separate confirmation flows.

---

12. BULK OPERATION OUTPUT

Never produce:

"Bye-bye channel1..."
"Bye-bye channel2..."
"Bye-bye channel3..."

Instead use one compact summary.

Example:

✅ Done.

Removed: 12 channels
Preserved: #general
Protected/skipped: 2

Use the existing audit and undo functionality.

---

13. /ASK PERFORMANCE

Do NOT redesign "/ask".

Inspect its actual path and optimize only genuine bottlenecks.

Preserve:

- provider routing
- memory
- security
- rate limits
- existing AI behavior

Avoid duplicate:

- prompt extraction
- memory loading
- context building
- provider selection
- filesystem writes
- analytics writes

The AI provider is expected to remain the primary latency source.

Do not add arbitrary delays or fake loading.

---

14. MENTION + REPLY PERFORMANCE

@AshenAI and replies must remain fast.

Do not accidentally route normal chat through "/prompt".

For simple:

@AshenAI hi

the bot should quickly reach the normal AI path.

Replies should use the same fast conversational path.

Do not perform unnecessary builder inspection for ordinary conversation.

---

15. DOUBLE RESPONSE BUG

Every user message must be processed exactly once.

For:

xYkel: hii

AshenAI must send exactly ONE response.

Inspect:

- MessageCreate listeners
- interaction handlers
- mention handlers
- reply handlers
- command handlers
- startup registration
- duplicate dispatch
- async races

Ignore bot-authored messages.

Use the existing deduplication mechanism if present.

Do not create multiple competing dedup systems.

---

16. ash! PREFIX

"ash!" means:

SEND THE FOLLOWING TEXT AS ASHENAI.

Example:

ash! Hi everyone

AshenAI sends:

"Hi everyone"

as the Discord bot.

This is NOT an AI builder.

This is NOT an AI generation command.

It is simply bot-message control.

Only trusted users can use it.

Trusted user:

ash! Server maintenance starts now.

→ AshenAI sends that message as the bot.

Untrusted user:

ash! hello

→ NOTHING happens.

No error message.
No AI response.
No visible response.

The existing authorization/security system must determine whether the user is trusted.

Do not create another trusted-user database.

Do not bypass audit/security policies.

---

17. TRUSTED USERS

Preserve:

/trusted add
/trusted list
/trusted remove

Only authorized server owners/admins can manage trusted users.

Use the existing:

GuildAIConfig.trustedUserIds

and existing role-resolution/security infrastructure.

Trusted users may use privileged features according to the existing policy.

---

18. BOT JOIN ONBOARDING

When AshenAI joins a guild, send exactly ONE compact onboarding message in an appropriate channel.

Use:

✨ Hi! I'm AshenAI — your AI-powered server assistant.

I can help you:

«🛠️ Create and customize your server
🤖 Manage channels, roles, and permissions
🛡️ Moderate and protect your community
✨ Generate server templates
💬 Chat naturally with your server»

Get started

• Mention me and tell me what you need
• Use "/ask" for AI chat
• Use "/prompt" for server building
• Use "/help" to explore features
• Server owner: use "/trusted add"
• Trusted users can use "ash! <message>" to speak as the bot

Nothing should be changed simply because AshenAI joined.

Never send duplicate onboarding messages.

---

19. /HELP — FIX INTERMITTENT FAILURE

There is currently an intermittent problem:

❌ Help command failed. Check the Termux logs.

Sometimes "/help" fails once and works on the next attempt.

Inspect the actual implementation and find the ROOT CAUSE.

Check:

- interaction acknowledgement
- deferReply/reply/editReply lifecycle
- duplicate execution
- expired interactions
- select menu handling
- invalid component payloads
- invalid embed payloads
- race conditions
- duplicate listeners
- command registration
- Discord API errors
- ephemeral handling

Do not simply catch and hide the error.

Fix the root cause.

"/help" must work on the FIRST attempt.

Never expose "Check the Termux logs" to normal Discord users.

---

20. POLISHED /HELP EMBED

Replace the messy giant help output with a clean Discord Embed.

Use a neutral dark/grey Discord-style embed color.

Initial response:

AshenAI — Help

Hi! I'm AshenAI, your AI-powered server assistant.

Pick a category below to see what I can do.

Try asking me...

• "How do I set up my server?"
• "Create a gaming server template"
• "Fix my server organization"
• "Delete all channels except general"

[Choose a category...]

Use the existing interactive select-menu architecture.

Make the initial response ephemeral where appropriate.

---

21. HELP CATEGORIES

Use:

🤖 AI Chat
🛠️ Server Management
📋 Templates
🛡️ Moderation
👋 Welcome & Leave
🎫 Tickets
🔐 Access Control
🎵 Music

Selecting a category should EDIT the same help message.

Do not send a new message for every category.

Provide a Back option.

Keep descriptions short.

Example:

🛠️ Server Management

Manage your Discord server using natural language.

• Create channels/categories
• Rename resources
• Organize channels
• Inspect server structure
• Clean up resources

Try asking:
"Rename general to lobby"

---

22. HELP EMBED STYLE

Use the existing Discord.js embed/component system.

Embed should have:

- clean title
- short description
- grey/dark neutral color
- clean spacing
- minimal emojis
- category-specific information only when selected
- no raw JSON
- no internal implementation details
- no giant command dump

---

23. HELP ERROR HANDLING

If "/help" genuinely fails:

1. Log the real error internally.
2. Correctly acknowledge the interaction.
3. Send one clean fallback message.

Example:

⚠️ I couldn't open the help menu right now. Please try "/help" again.

Never send both an error and successful response.

Never expose stack traces or Termux logs.

Do not use arbitrary delays to hide the problem.

---

24. ARCHITECTURE

PRESERVE the existing:

- AIRouter
- provider adapters
- conversational agent
- executor
- tool registry
- confirmation store
- confirmation handler
- server-state system
- resource resolver
- permission system
- trusted-user storage
- audit system
- verification
- undo
- memory
- rate limiting
- analytics

Do NOT create:

- another executor
- another AI engine
- another router
- another confirmation system
- another permission database
- another trusted-user database
- another template executor
- another memory system

Templates remain virtual/meta plans decomposed into existing registered tools.

---

25. TESTS

Run:

npm run typecheck
npm run build

Then run ALL existing tests.

Add/update tests for:

1. "@AshenAI hi" → exactly one response.
2. Replies → exactly one response.
3. Bot messages are ignored.
4. Natural-language channel resolution.
5. "remove the bot from #general".
6. "delete all except general".
7. Exceptions are preserved.
8. Protected resources are preserved.
9. Bulk deletion uses one confirmation.
10. Bulk output is compact.
11. "/prompt" creates the correct private session.
12. "/prompt" session expires.
13. "/prompt" does not mutate during preview.
14. Template confirmation executes the current plan.
15. Template generation avoids unnecessary AI calls.
16. Template generation is fast.
17. Unified template + server fix uses one plan.
18. "/ask" remains normal AI chat.
19. "/ask" does not enter builder mode.
20. Mentions do not enter builder mode.
21. Replies do not enter builder mode.
22. "/trusted add" works.
23. "/trusted list" works.
24. "/trusted remove" works.
25. Trusted users can use "ash!".
26. Untrusted users get absolutely no "ash!" response.
27. "ash!" sends text as the bot without AI generation.
28. "/help" works on first invocation.
29. "/help" repeated invocation works.
30. "/help" select menu works.
31. "/help" edits the same message.
32. "/help" Back navigation works.
33. "/help" embed is valid and grey/dark styled.
34. "/help" failure produces a clean fallback.
35. Bot join sends exactly one onboarding message.

---

26. PERFORMANCE VERIFICATION

Measure actual latency for:

@AshenAI hi
reply hi
/ask hi
/prompt inspect my server
/prompt generate a template
/prompt delete all except general

Identify the slowest stage.

Do not claim an optimization without inspecting the actual bottleneck.

Do not optimize already-fast code unnecessarily.

---

27. FINAL VERIFICATION REPORT

At the end report:

- files changed
- duplicate-response root cause
- "/ask" latency root cause
- "/prompt" latency root cause
- "/help" intermittent failure root cause
- exact optimizations
- natural-language resolution behavior
- delete-all-except behavior
- "/prompt" session behavior
- template behavior
- "ash!" behavior
- trusted-user behavior
- onboarding behavior
- "/help" UI behavior
- tests passed
- typecheck result
- build result

IMPORTANT:

Implement the changes directly.

Do not merely describe what should be done.

Do not rewrite unrelated architecture.

Do not weaken security.

Do not create duplicate systems.

The final AshenAI experience should be:

FAST normal chat
+
PRIVATE /prompt builder
+
NATURAL-LANGUAGE server management
+
TRUSTED-ONLY ash! bot messaging
+
POLISHED /help embed
+
RELIABLE onboarding
+
ONE confirmation for destructive/bulk plans
+
COMPACT Discord responses
