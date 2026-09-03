ASHENAI FINALIZATION LOOP — AUDIT → FIX → IMPROVE → VERIFY UNTIL CLEAN

You are the final engineering agent for AshenAI.

Your objective is NOT to make a report and stop.

Your objective is to repeatedly:

AUDIT
  ↓
FIND PROBLEM
  ↓
REPRODUCE
  ↓
FIX
  ↓
TEST
  ↓
RE-AUDIT
  ↓
IMPROVE
  ↓
TEST AGAIN
  ↓
REPEAT

Continue this loop until AshenAI has no known actionable correctness, security, reliability, compatibility, or architectural-integrity issues remaining.

Do not stop merely because the existing tests pass.

---

1. ABSOLUTE ARCHITECTURE RULE

Preserve the existing AshenAI architecture.

Do NOT replace working systems.

Do NOT create duplicates.

Reuse existing implementations.

Existing systems include:

- AI Router
- provider adapters
- provider fallback/circuit breaker
- Pattern Router
- conversation memory
- FTS5
- memory decay
- context compression
- response cache
- SQLite task persistence
- agent executor
- MCP client
- Discord tools
- permissions
- confirmation/approval flow
- security
- governance
- audit
- web research pipeline
- traces
- queues/concurrency controls
- rate limiting
- self-healer/watchdog
- music system
- web dashboard
- database layer

Never create:

- second AI router
- second memory system
- second cache
- second database
- second permission system
- second confirmation system
- second web pipeline
- second queue
- second task store
- second observability system

---

2. DEPENDENCY POLICY

Before adding ANY package:

1. Search the existing codebase.
2. Check whether the functionality already exists.
3. Check whether an existing dependency can provide it.
4. Prefer implementing a small function using the existing stack.
5. Only install a dependency if it provides a substantial benefit that cannot reasonably be implemented internally.

Do NOT add packages simply because another project uses them.

Avoid:

sqlite-vec
node-llama-cpp
Neo4j
Redis
vector databases
large ML runtimes
model weights
agent frameworks
duplicate HTTP clients
duplicate tokenizers
duplicate queues
duplicate telemetry platforms

500 MB is a hard ceiling, not a storage target.

If a dependency is installed, record:

- why
- package size/impact
- runtime impact
- compatibility
- whether it is actually used

Remove unnecessary dependencies discovered during the audit.

---

3. START WITH REAL REPOSITORY INSPECTION

Inspect the actual current repository.

Do not rely on previous reports.

Inspect:

src/
scripts/
package.json
package-lock.json
tsconfig.json
database
tests
configuration
environment handling
startup scripts

Pay special attention to all V2/V3 changes:

src/ai/mcp-client.ts
src/ai/pattern-router.ts
src/ai/response-cache.ts
src/ai/context-compression.ts
src/ai/traces.ts
src/ai/memory-decay.ts
src/agent/tasks/
src/database/database.ts
src/index.ts
scripts/test-hardening.ts
scripts/test-adversarial.ts

Trace real execution paths rather than only reading isolated files.

---

4. ESTABLISH BASELINE

Before modifying code, run the available validation suite.

At minimum:

npm test
npm run typecheck
npm run build
git status
git diff --stat

Also inspect package scripts and determine the correct production startup command.

Record the baseline.

If a command fails:

investigate the actual cause.

Do not automatically classify failures as unrelated.

---

5. FIX ALL CHECK-SCRIPT PROBLEMS

Investigate the previously reported issues:

TypeScript PATH issue

Determine whether this is:

- an actual project issue
- a script issue
- an environment issue
- a command invocation issue

Make the project's own validation scripts reliable where possible.

Do not modify correct application code merely to accommodate a broken test command.

Discord "ephemeral"

Verify the actual Discord.js v14 API behavior.

If valid, do not change it unnecessarily.

If the project's checker is outdated, update the checker/test rather than breaking production code.

"/api/chat"

Inspect the actual web server and frontend.

Determine:

Does the frontend call /api/chat?
Does the server intentionally use another endpoint?
Is /api/chat obsolete?
Is something actually broken?

If "/api/chat" is obsolete, fix the test/checker.

If something expects "/api/chat", fix the actual integration.

Do not add a duplicate endpoint merely to make a test green.

---

6. MCP — FINAL EXECUTION-BOUNDARY AUDIT

This is the highest-priority security audit.

Trace:

Discord request
 ↓
authentication
 ↓
guild/user/channel identity
 ↓
permissions
 ↓
security policy
 ↓
tool selection
 ↓
risk classification
 ↓
confirmation
 ↓
MCP execution

Prove that destructive MCP operations cannot bypass this chain.

Test BOTH:

Normal path

user → Discord → permission → confirmation → MCP

Direct/internal path

Attempt to invoke the underlying MCP execution function without going through the normal command flow.

If that succeeds without authorization, fix the execution boundary.

Authorization must not exist only at UI/tool-discovery level.

For sensitive actions, revalidate authorization at execution time where necessary.

Test:

- permission revoked between planning and execution
- confirmation from another user
- confirmation from another guild
- stale confirmation
- replayed confirmation
- malformed confirmation
- wrong tool confirmation
- wrong MCP server confirmation
- tool name collision
- malicious MCP metadata
- malicious tool schema
- malicious MCP output

---

7. MCP TRUST BOUNDARY

Verify:

MCP metadata = untrusted
MCP descriptions = untrusted
MCP tool results = untrusted
MCP errors = untrusted

They must never become system-level instructions.

Test injection strings including:

<|im_start|>
<|im_end|>
SYSTEM:
ASSISTANT:
IGNORE PREVIOUS INSTRUCTIONS
REVEAL SYSTEM PROMPT
REVEAL API KEY
DISABLE SECURITY
SKIP CONFIRMATION
GRANT ADMIN

Also test encoded/obfuscated variants.

Do not blindly strip legitimate content.

The goal is trust separation, not destructive sanitization.

---

8. CROSS-GUILD / CROSS-USER ISOLATION

Prove isolation for:

Guild
User
Channel
Conversation
Memory
Cache
Tasks
Traces
MCP configuration
Provider configuration
Web context

Perform adversarial tests such as:

Guild A user → attempt to retrieve Guild B data
User A → attempt to retrieve User B memory
Channel A → attempt to access Channel B context
Task A → attempt to execute Task B
MCP server A → attempt to access MCP server B credentials

Fix every actual leakage path.

---

9. CACHE FINAL AUDIT

Verify cache keys and invalidation.

Determine exactly what belongs in the cache identity.

Check:

guild
user
channel
conversation
provider
model
system/config version
tool usage
MCP usage
relevant context

Test:

- private information
- moderation
- permissions
- web/current data
- MCP results
- tool results
- provider changes
- model changes
- stale responses
- poisoned responses

Ensure unsafe responses bypass cache.

Ensure cache has:

- TTL
- bounded storage
- cleanup
- safe invalidation
- correct indexes

---

10. PATTERN ROUTER FINAL AUDIT

Verify deterministic routing cannot steal contextual requests.

Test:

exact deterministic command
keyword inside sentence
keyword inside question
quoted command
negated command
multilingual text
long input
ambiguous intent
malicious command-like input

Pattern Router must never bypass:

- security
- permissions
- confirmation
- current-data requirements
- tools
- user context

If confidence is insufficient:

Pattern Router → AI Router

---

11. MEMORY FINAL AUDIT

Verify:

- user isolation
- guild isolation
- conversation isolation
- bounded growth
- importance retention
- decay behavior
- retrieval strengthening
- critical information preservation

Test conflicting memories and repeated retrieval.

Ensure security/configuration data is not accidentally treated as ordinary memory.

---

12. CONTEXT COMPRESSION FINAL AUDIT

Test very long conversations.

Verify compression preserves:

- important facts
- names
- relevant IDs
- active tasks
- decisions
- unresolved questions
- tool results required for continuation
- security constraints

Test repeated compression.

Make sure repeated compression does not progressively destroy context.

Use existing tokenizer.

---

13. TASK EXECUTOR FINAL AUDIT

Test:

process crash
SIGTERM
restart
stale task
duplicate worker
provider failure
tool failure
MCP failure
timeout
retry exhaustion
partial execution
database failure

Verify task states remain valid.

Prevent duplicate side effects.

Verify:

- retry maximum
- execution timeout
- stale recovery
- idempotency
- ownership
- guild isolation

No infinite task loop.

---

14. PROVIDER CHAOS TESTING

Simulate:

timeout
429
500
connection reset
malformed response
empty response
authentication failure
provider unavailable
provider recovery
all providers unavailable

Verify:

failure
 ↓
health update
 ↓
fallback
 ↓
circuit breaker
 ↓
recovery

No infinite retries.

No stuck request.

No corrupted memory/cache/task state.

---

15. WEB PIPELINE AUDIT

Inspect:

search
fetch
redirects
HTML parsing
content extraction
normalization
source handling
caching

Attack with:

- huge pages
- slow servers
- malformed HTML
- malicious HTML
- prompt injection
- redirect chains
- giant scripts
- unusual content types
- repeated failures

Verify timeouts, response limits, concurrency and retries.

External web content must remain untrusted.

---

16. RESOURCE-EXHAUSTION AUDIT

Find every potentially unbounded operation.

Check:

loops
recursion
arrays
maps
queues
retries
tool calls
MCP calls
web requests
memory
cache
traces
tasks
Discord interactions

Every external or potentially expensive operation must have reasonable bounds.

Do not use absurdly small limits that break normal operation.

---

17. SQLITE FINAL AUDIT

Test:

- concurrent reads
- concurrent writes
- tasks + traces + cache simultaneously
- WAL
- busy timeout
- migration
- restart
- cleanup
- interrupted operation

Verify migrations v8–v11.

Ensure migrations are:

- ordered
- safe
- idempotent
- non-destructive
- compatible with existing databases

If a migration can partially fail, make it transactional where appropriate.

Do not create another database.

---

18. TRACE PRIVACY AUDIT

Search the repository for secret leakage.

Look for:

process.env
Authorization
Bearer
API_KEY
TOKEN
PASSWORD
COOKIE
SECRET
credentials
MCP auth
Discord token

Check whether any are logged or stored improperly.

Test redaction.

Verify:

- bounded trace size
- retention cleanup
- privacy-safe metadata
- no credential storage
- no unnecessary full prompt/response retention

---

19. SHUTDOWN / STARTUP AUDIT

Test:

SIGTERM
SIGINT
uncaught exception
unhandled rejection
database close
active task
active MCP connection
active web request

Verify graceful shutdown.

Then verify the bot starts cleanly again.

No database corruption.

No duplicated task execution.

No stale resources.

---

20. CLEAN INSTALL / DEPLOYMENT VERIFICATION

Inspect the production installation process.

Test from a clean dependency state if practical.

Use the project's actual package manager and lockfile.

Verify:

npm ci
npm run typecheck
npm run build
npm test

If native dependencies exist, verify they work in the intended environment.

Do not claim Termux compatibility merely because TypeScript builds.

Check the actual Node/OS compatibility of native modules.

Verify the Wispbyte startup path.

If the environment cannot be reproduced locally, explicitly report that as:

"NOT VERIFIED"

Do not fake verification.

---

21. GIT / SECRET / ARTIFACT AUDIT

Before finalizing:

git status
git diff --stat
git diff

Search for accidentally tracked:

- ".env"
- credentials
- databases
- logs
- caches
- generated artifacts
- temporary files
- model files
- archives

Remove accidental artifacts.

Do not delete legitimate project files.

---

22. IMPROVEMENT LOOP

After all tests pass, perform another code review.

Ask:

1. Can this implementation be simpler?
2. Can an existing utility be reused?
3. Is there duplicated logic?
4. Is there a race condition?
5. Is there an error path that is untested?
6. Is a limit missing?
7. Is sensitive data exposed?
8. Is the behavior unnecessarily expensive?
9. Is the fix robust or just test-specific?
10. Does the implementation preserve the original architecture?

If you find a genuine improvement:

implement it.

Then rerun the affected tests.

Then rerun the full suite.

Repeat this process.

---

23. REGRESSION LOOP

After every modification:

npm test
npm run typecheck
npm run build

If something fails:

STOP
 ↓
identify root cause
 ↓
fix
 ↓
rerun affected test
 ↓
rerun complete suite

Never weaken a test simply to make it pass.

Never remove a security test because the implementation is inconvenient.

Never suppress an error without understanding it.

---

24. STOP CONDITION

Do NOT stop after one successful test run.

Stop only when ALL are true:

[ ] No known Critical issues
[ ] No known High issues
[ ] No actionable Medium security issues
[ ] No known permission bypass
[ ] No known confirmation bypass
[ ] No known MCP execution bypass
[ ] No known cross-guild leakage
[ ] No known cross-user leakage
[ ] No known cache leakage
[ ] No known memory leakage
[ ] No known task duplication
[ ] No unbounded retry loop
[ ] No unbounded agent/tool loop
[ ] No known secret leakage
[ ] SQLite integrity verified
[ ] Migrations verified
[ ] Shutdown verified
[ ] Restart verified
[ ] Provider fallback verified
[ ] Web security verified
[ ] MCP security verified
[ ] Resource limits verified
[ ] Clean installation verified where possible
[ ] Production startup verified where possible
[ ] Existing tests pass
[ ] Adversarial tests pass
[ ] Typecheck passes
[ ] Build passes
[ ] Git diff reviewed
[ ] No unnecessary dependency added
[ ] No duplicate subsystem created

If something cannot be verified, explicitly mark it:

"NOT VERIFIED"

Do not falsely mark it PASS.

---

25. FINAL FULL VALIDATION

At the very end run:

npm test
npm run typecheck
npm run build
git status
git diff --stat

Run every relevant hardening/adversarial script already present.

If scripts have different names, discover them from "package.json" and "scripts/".

Use the actual project's commands instead of inventing commands that don't exist.

---

26. FINAL REPORT

Only after the loop is genuinely finished, provide:

Executive Result

STATUS: READY / NOT READY

Explain why.

Iterations

Report:

Audit/fix iterations: X
Issues found: X
Issues fixed: X
Issues remaining: X

Security

Report:

Critical: X
High: X
Medium: X
Low: X

For every remaining issue explain why it cannot/should not be fixed.

MCP

Report:

- permission enforcement
- confirmation enforcement
- execution-boundary protection
- isolation
- schema validation
- injection resistance
- timeout
- response limits
- secret handling

Isolation

Report:

Guild: PASS/FAIL
User: PASS/FAIL
Channel: PASS/FAIL
Conversation: PASS/FAIL
Memory: PASS/FAIL
Cache: PASS/FAIL
Tasks: PASS/FAIL
Traces: PASS/FAIL
MCP: PASS/FAIL

Reliability

Report:

- restart recovery
- shutdown
- task recovery
- duplicate execution
- provider fallback
- database recovery

Web

Report:

- prompt injection
- oversized content
- timeout
- redirect handling
- resource limits

Tests

Give exact numbers:

Existing tests: X/X
Hardening tests: X/X
Adversarial tests: X/X
Additional regression tests: X/X
TOTAL: X/X
Typecheck: PASS/FAIL
Build: PASS/FAIL

Dependencies

Added: X
Removed: X
Production: X
Dev: X
Net change: X
Approximate storage impact: X MB

Architecture

Confirm explicitly that no duplicate:

- router
- memory
- cache
- database
- task system
- queue
- permission system
- confirmation system
- web pipeline
- observability system

was introduced.

Deployment

Report:

Clean install: PASS/FAIL/NOT VERIFIED
Wispbyte startup: PASS/FAIL/NOT VERIFIED
Termux ARM64: PASS/FAIL/NOT VERIFIED
Node 22+: PASS/FAIL/NOT VERIFIED

Remaining Risks

Be brutally honest.

Separate:

KNOWN RISKS
NOT VERIFIED
ENVIRONMENT LIMITATIONS

Do not claim perfection merely because tests pass.

---

FINAL INSTRUCTION

Keep going until the stop condition is satisfied.

Do not give me an intermediate “looks good” report.

Do not stop after fixing the first batch of problems.

Do not stop after tests pass once.

Use the loop:

AUDIT
→ ATTACK
→ REPRODUCE
→ FIX
→ TEST
→ REVIEW
→ IMPROVE
→ TEST
→ RE-AUDIT
→ REPEAT

The goal is the finished AshenAI, not merely a successful test run.

When no further actionable improvements or vulnerabilities can be found, perform one final clean validation and produce the final report.
