# ASHENAI — MASTER IMPLEMENTATION INSTRUCTIONS

You are working on the existing AshenAI Discord bot repository.

IMPORTANT:
- Inspect the existing codebase BEFORE modifying anything.
- Preserve the existing architecture.
- Do NOT create duplicate executors, routers, confirmation systems, tool registries, permission systems, memory systems, or Discord management systems.
- Reuse existing registered tools and pipelines.
- Do not invent nonexistent APIs, functions, files, or tools.
- Do not replace working systems merely to implement these features.
- Integrate with what already exists.
- Maintain existing security, authorization, audit logging, rate limits, protected-resource checks, verification, undo support, and confirmation flows.
- Do not register virtual/meta operations such as `apply_template` as real tools.
- Templates must decompose into existing registered Discord tools.
- All destructive or server-changing actions must remain confirmation-gated unless the existing architecture explicitly determines that confirmation has already occurred.
- Never silently mutate a server when the user only asks for a preview/generation.
- Never execute a newly generated plan merely because it was generated.
- Never interpret shell commands, code, prompt text, or documentation as user Discord commands.

==================================================
1. FIX OPENCONVERSATION / DOUBLE RESPONSE BUG
==================================================

Current problem:

When the user sends:

"hii"

AshenAI sometimes replies twice:

"Hey! What's up!"

and:

"Hii! How can I help you today?"

Find the actual cause in the event/message handling pipeline.

Inspect:
- Discord messageCreate listeners
- conversational-agent
- AI router
- command/message handlers
- mention handling
- interaction handlers
- any fallback conversational handlers
- duplicate event registration
- startup initialization
- imported modules that register listeners
- bot/client event subscriptions

Determine why ONE user message can trigger TWO conversational responses.

Fix the root cause.

Requirements:
- One user message must produce at most one conversational response.
- Do not simply suppress one response after generating it.
- Prevent duplicate handlers/listeners from processing the same message.
- Do not break slash commands.
- Do not break mentions.
- Do not break DM handling if supported.
- Do not break AI tool execution.
- Do not break confirmations.
- Do not break server-management requests.
- Do not add arbitrary global cooldowns as a workaround.
- Ensure initialization cannot register the same listener multiple times.
- Ensure a single message has a single processing path.

Add regression tests proving:
- normal greeting -> exactly one response
- mention -> exactly one response
- normal conversational message -> exactly one response
- confirmation -> exactly one response
- server-management request -> exactly one response

==================================================
2. TEMPLATE GENERATION MUST BE FAST
==================================================

Current problem:

User says:

"generate me a template"

and AshenAI can take 10–15+ minutes.

This is unacceptable.

Find the actual performance bottleneck.

Inspect:
- conversational-agent
- template generation
- server-state collection
- Discord API calls
- AI provider calls
- router/fallback logic
- health inspection
- resource comparison
- template planning
- unnecessary sequential API calls
- repeated server scans
- verification before confirmation
- tool execution accidentally occurring during generation

Generation MUST be preview/planning only.

When user says:

"generate me a template"

AshenAI should:
1. Understand the requested template.
2. Inspect the necessary server state efficiently.
3. Build the template plan.
4. Compare desired structure against current structure.
5. Show a compact preview.
6. Ask for confirmation.
7. Make ZERO server mutations before confirmation.

Do not execute create_role/create_category/create_channel during generation.

Optimize server inspection:
- Avoid repeated fetches of the same guild resources.
- Reuse already available server state.
- Fetch independent resources concurrently where safe.
- Avoid unnecessary Discord API calls.
- Avoid calling AI providers multiple times for the same request.
- Avoid provider fallback when the first provider already succeeded.
- Do not perform post-action verification during preview.
- Do not execute every template step just to determine what would happen.

Target normal template planning to complete in seconds, not minutes.

If an AI provider is used for template interpretation, use ONE efficient call where possible and deterministic local logic for the rest.

==================================================
3. CLEAN TEMPLATE PREVIEW
==================================================

The current template output is too large and messy.

Current example:

📋 INFORMATION
# rules
# announcements
# roles

💬 GENERAL
# general
# introductions
# off-topic

🎯 TOPICS
...

It also dumps:

14 operations will be performed

and duplicate information.

Make the presentation similar to a polished Discord server-management assistant such as Ava/Sato-style UX.

Do NOT copy proprietary implementation or branding.
Use the UX pattern only as inspiration:
- concise
- grouped
- readable
- action-oriented
- minimal clutter
- clear confirmation
- details available only when requested

Preferred output:

✨ Community Server

A general community server with discussions, events, and support.

Create
• 1 role
• 3 categories
• 8 channels

Preserve
• 2 existing resources

Skip
• 2 resources already matching

Review
• 2 duplicate #general channels found
• I won't delete ambiguous duplicates automatically

Want me to apply this template?

[Apply] [Preview] [Cancel]

The exact UI can use the existing Discord interaction/button system.

Do NOT dump every individual operation by default.

Provide detailed operations only when the user asks:
- "details"
- "show me everything"
- "what exactly will you create?"
- "preview details"

==================================================
4. UNIFIED TEMPLATE + SERVER FIX
==================================================

When user says:

"generate a template and fix my server"

This MUST be interpreted as ONE unified request.

Do NOT produce:

Template confirmation

then:

Server health confirmation

Instead:

1. Inspect server.
2. Generate desired template.
3. Compare template to current state.
4. Detect health problems.
5. Build ONE unified plan.
6. Show ONE summary.
7. Ask ONE confirmation.
8. Execute ONE plan.
9. Produce ONE execution report.

Example:

✨ Community Server

Create
• 1 role
• 3 categories
• 8 channels

Fix
• Configure Moderator permissions

Preserve
• Existing #general

Review
• 2 duplicate #general channels
  I won't delete these automatically.

Nothing else will be changed.

Apply these changes?

[Apply] [Preview] [Cancel]

==================================================
5. SERVER TEMPLATE TYPES
==================================================

Support natural-language template requests such as:

- community server
- gaming server
- Minecraft server
- support server
- study server
- social server
- creator server
- clan server
- friends server
- custom template

Do not require rigid syntax.

Examples:

"make me a gaming server"

"generate a Minecraft template"

"make my server like a community server"

"build a support server"

"create a clean server for my gaming community"

Interpret naturally.

==================================================
6. IDEMPOTENT TEMPLATE PLANNING
==================================================

Templates must be server-aware.

Compare desired resources with actual resources.

Classify each resource as:

- missing
- existsAndMatches
- existsButDifferent
- duplicate
- protected

Rules:

existsAndMatches:
- preserve
- do not recreate

missing:
- plan creation

existsButDifferent:
- only propose modification when safe and necessary
- require confirmation

duplicate:
- report
- NEVER automatically delete ambiguous duplicates

protected:
- preserve
- never bypass protection

Template application must be idempotent.

Running the same template again must NOT create duplicates.

==================================================
7. CATEGORY / CHANNEL DEPENDENCIES
==================================================

Correctly handle:

new category -> channels inside that category

existing category -> channels inside existing category

new category created during same execution -> dynamically resolve its newly-created Discord category ID before creating child channels.

Never create child channels without the intended parent category when the template specifies one.

Do not assume IDs from preview time will remain valid.

Use the result of create_category when necessary.

==================================================
8. TEMPLATE EXECUTION
==================================================

`apply_template` may remain a virtual/meta plan identifier.

DO NOT register `apply_template` as a Discord tool.

Templates must decompose into existing registered tools such as:

create_role
create_category
create_channel
configure_role_permissions
manage_channel_permissions
apply_channel_preset

Use the existing execution pipeline.

After the user confirms the entire template:
- execute the registered steps
- bypass duplicate confirmation prompts only because the parent plan has already been explicitly confirmed
- retain authorization
- retain permission checks
- retain protected-resource checks
- retain audit logging
- retain verification
- retain rate-limit/security controls appropriate to confirmed execution

Never bypass security merely because `skipConfirmation` is enabled.

`skipConfirmation` means:
"The user already confirmed this parent plan."

It must NOT mean:
"skip authorization/security."

==================================================
9. PARTIAL FAILURE HANDLING
==================================================

If a multi-step template fails halfway through, do NOT claim success.

Report:

Completed
• 1 role
• 2 categories
• 5 channels

Failed
• #events could not be created

Reason
• Discord permission error

The response must distinguish:
- created
- fixed
- verified
- failed
- skipped
- preserved

Do not dump stack traces to normal users.

Log technical details internally.

==================================================
10. CONFIRMATION SYSTEM
==================================================

Confirmation must be context-aware.

Accepted confirmations may include:

yes
y
yeah
yep
sure
okay
ok
go ahead
do it
make it
apply
apply it
confirmed
sounds good
let's go
absolutely
definitely

When a plan is pending:

"yes"

MUST execute the pending plan.

It must NOT:
- generate another template
- start a new intent
- produce another plan
- ask another confirmation

Likewise:

"no"

must cancel the pending plan.

"preview"

must show the current plan without executing.

"details"

must show detailed operations without executing.

==================================================
11. PREVIEW / DRY RUN
==================================================

Support:

preview
dry run
show me what you'll change
what will you change
show me details
details

Preview must:
- never mutate the server
- never execute Discord write tools
- show the current plan
- show create/fix/preserve/skip/review
- remain concise

==================================================
12. "MAKE MY SERVER BETTER"
==================================================

Support:

"make my server better"

"improve my server"

"clean up my server"

"organize my server"

"fix my server"

Inspect:
- categories
- channels
- roles
- permissions
- duplicate names
- uncategorized channels
- missing useful structure
- obvious organization problems
- unsafe/broken configuration

Do not automatically perform destructive cleanup.

Instead generate a safe improvement plan.

If nothing meaningful needs changing:

"✅ Your server is already well-organized. I checked the channels, categories, roles, and permissions, and I don't see any changes that would meaningfully improve it."

==================================================
13. DUPLICATE CHANNEL HANDLING
==================================================

Detect duplicates by normalized name.

Example:

general
General
#general

Treat them according to the existing server-state normalization policy.

Report:

"I found 2 channels named #general. I won't delete or merge them automatically."

Never delete duplicates merely because they have the same name.

Deletion requires:
- explicit user request
- appropriate confirmation
- existing authorization
- protected-resource checks
- audit logging
- verification

==================================================
14. DELETE EVERYTHING EXCEPT SPECIFIED CHANNELS
==================================================

Support natural-language destructive requests like:

"delete all except general"

"delete everything except #general"

"remove every channel except general"

"clean the server and keep general"

Interpret carefully.

The assistant must:
1. Identify exactly which resources are protected by the user's exception.
2. Show the deletion plan.
3. Ask for confirmation.
4. Only delete after confirmation.
5. Preserve all matching exceptions.
6. Never delete protected/system-required resources.
7. Never silently delete roles/categories unless the request explicitly includes them.
8. Use existing deletion tools/pipelines.
9. Log every deletion.
10. Verify the result.

Do NOT produce dozens of individual "Bye-bye" messages.

Instead provide ONE concise report:

⚠️ I found 12 channels to remove.

Keep
• #general

Delete
• #callerss
• #call1
• #call2
• 9 more

This is destructive. Continue?

After confirmation:

✅ Cleanup complete.

Deleted 12 channels.
Preserved #general.

If useful, allow "details" to show the complete deletion list.

Never use cutesy repetitive messages for every deleted channel.

==================================================
15. TRUSTED USER SYSTEM
==================================================

Add a trusted-user management interface similar in UX to:

/trusted add
Add a trusted user who can use server-management features.

 /trusted list
List trusted users.

 /trusted remove
Remove a trusted user's access.

Integrate with the EXISTING authorization/security architecture.

Do not create a second independent authorization system.

Requirements:

`/trusted add`
- server owner/admin authorized only
- accepts a Discord user
- validates target
- stores trusted access using existing persistent storage architecture
- audit logs the change
- prevents duplicate entries
- confirms success

`/trusted list`
- shows trusted users
- safe to use according to existing access-control policy

`/trusted remove`
- owner/admin authorized only
- removes trusted access
- audit logs the change

Trusted users should be able to use the intended AshenAI management features without giving them unrestricted Discord permissions.

Do not allow trusted users to bypass:
- Discord permissions
- protected resources
- security restrictions
- dangerous-action confirmation
- audit logging

Respect existing owner/admin rules.

If the project already has an access-control/trusted-user implementation, extend it rather than creating another.

==================================================
16. /HELP REPLACEMENT
==================================================

Replace the old `/help` experience with a polished interactive help menu.

UX inspiration:

"Ava, Help

Hi! I'm Ava, your AI-powered server assistant.

Pick a category from the menu below to see what I can do.

AI Chat
Talk to the assistant and manage your server.

Moderation
Keep the server safe, warn, punish, and manage channels.

Welcome & Leave
Greet new members and send farewells automatically.

Tickets
Run a support ticket system for your members.

Access Control
Decide who is allowed to use the assistant.

Select a category below to get started."

For AshenAI, use AshenAI's actual branding/name.

Do NOT copy Ava's branding or wording exactly.

Create a polished AshenAI help interface.

Suggested categories:

🤖 AI & CHAT
• Ask AshenAI
• Conversation
• Context & memory

🛡️ MODERATION
• Warnings
• Moderation
• Channel management
• Server cleanup

🏗️ SERVER
• Templates
• Server improvements
• Roles
• Categories
• Channels

🎫 COMMUNITY
• Tickets
• Welcome/leave
• Events
• Suggestions

🔐 ACCESS CONTROL
• Trusted users
• Permissions
• Owner/admin controls

🎵 MUSIC
• Music commands if the music system exists

⚙️ SYSTEM
• Status
• Diagnostics
• Configuration

Use Discord select menus/buttons if the existing architecture supports them.

The initial help message should be concise.

Use ephemeral responses for private help panels when appropriate.

==================================================
17. BOT JOIN / ONBOARDING MESSAGE
==================================================

When AshenAI joins a server, send a polished onboarding message.

Example UX inspiration:

"Hi! I'm AshenAI — your AI-powered server assistant! ✨

I'm here to help you:

> 🏗️ Create and organize server structures
> 🛠️ Customize and improve your community
> 🛡️ Moderate and manage your server
> 🤖 Chat with you using AI

Ready to explore what I can do?

Getting started:

🤖 Chat with me
Mention me or use the AI command.

📋 See what I can do
Use /help.

🔐 Server owner
Use /trusted add to allow other members to use server-management features.

That's it. Ask me what you need and I'll take it from there."

Use AshenAI's actual command names.

Do NOT use `/prompt` if the actual command is different.

Do NOT advertise commands that are not actually registered.

If the bot currently supports both mention and slash-command interaction, explain the real supported methods.

The onboarding message should be:
- concise
- polished
- friendly
- not huge
- not spammy

Only send it according to the existing bot-join/onboarding policy.

Do not send duplicate onboarding messages.

==================================================
18. ASHENAI PERSONALITY
==================================================

AshenAI should be friendly and conversational.

Avoid:
- excessive pet names
- repetitive emoji spam
- huge walls of text
- repetitive deletion messages
- robotic operation dumps
- unnecessary confirmations
- claiming actions succeeded before verification

Prefer:

"Sure — I can do that."

"I found a couple of things I'd change."

"Nothing has been changed yet."

"Want me to apply it?"

After success:

"Done — everything was created and verified."

Keep normal chat responses short.

==================================================
19. RESPONSE SIZE / DISCORD UX
==================================================

Discord messages must be compact.

Do NOT produce massive operation dumps unless requested.

Prefer:

Summary
Create
Fix
Preserve
Review

Use buttons/select menus where appropriate.

Avoid:
- unnecessary blank lines
- repeated headings
- repeated confirmation prompts
- repeated status messages
- one message per operation

For large plans:
- summarize
- provide "Details"
- provide "Apply"
- provide "Cancel"

If Discord limits are relevant, paginate or use embeds according to the existing architecture.

==================================================
20. ARCHITECTURE PRESERVATION
==================================================

Before coding, inspect the existing architecture.

Relevant areas likely include:

src/discord/
src/ai/tools/
src/ai/tools/discord/
src/commands/
src/security/
src/memory/
src/web/
confirmation-store
executor
validator
registry
agent-orchestrator
conversational-agent
confirmation-handler

Do not assume these paths are identical.
Inspect the repository.

Reuse:
- existing tool registry
- existing executor
- existing authorization
- existing action plans
- e
