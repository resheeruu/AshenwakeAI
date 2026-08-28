# AshenAI Admin/Moderator User Manual

## 1. What AshenAI Is

AshenAI is a secure Discord AI assistant and server management bot. It provides:
- AI-powered chat and question answering
- Server moderation tools (warn, timeout, kick, ban)
- Channel management (create, edit, delete, rename)
- Server protection (protect channels/categories from modification)
- Governance and policy enforcement
- Music playback via Lavalink
- Casino games and RPG adventure system
- Task automation for safe autonomous operations

## 2. Permission Levels

| Role | Who | What They Can Do |
|------|-----|-----------------|
| **Owner** | The bot owner (set via env vars) | Full control. Bypasses all rate limits and risk checks. Web dashboard access. |
| **Admin** | Discord members with Administrator permission or listed in `ADMIN_DISCORD_USER_IDS` | Channel management, moderation, governance, protection tools |
| **Moderator** | Discord members with ModerateMembers permission | Warn, timeout, untimeout, view warnings, purge messages. Read-only governance tools. |
| **Member** | Any Discord server member | Ask AI questions, play games, use music commands |
| **Guest** | Discord members without any role | Limited AI chat only |

## 3. Slash Commands

### AI Commands
- `/ask <prompt>` - Ask AshenAI anything. Rate-limited per user.
- `/reset` - Clear your conversation history with AshenAI.

### Moderation Commands (Moderator+)
- `/warn <user> <reason>` - Issue a formal warning to a member.
- `/warnings <user>` - View warnings for a member.
- `/timeout <user> <minutes> [reason]` - Timeout a member (1-40320 minutes).
- `/untimeout <user> [reason]` - Remove timeout from a member.

### Server Commands (Any member)
- `/server` - View server information.
- `/userinfo <user>` - View user information.
- `/roles` - List server roles.
- `/diagnose` - Run system diagnostics.

### Utility Commands
- `/status` - Show system status and AI provider health (Admin/Moderator only; limited info for other roles)
- `/help` - Show all available commands.
- `/config status` - Show runtime configuration (Owner only).
- `/config reload` - Reload configuration (Owner only).
- `/config ratelimit` - Show rate limit status (Owner only).
- `/config resetuser <user_id>` - Reset rate limits for a user (Owner only).
- `/task <goal>` - Create and run a safe autonomous task.

### Games (Any member)
- `/game dice`, `/game coinflip`, `/game rps`, `/game duel` - Play games.
- `/game slots`, `/game jackpot`, `/game crystal`, `/game chest` - Casino games.
- `/casino` - Casino game menu.
- `/hunt` - Hunt for items and creatures.
- `/adventure` - Go on an adventure.
- `/profile` - View your game profile.

### Music (Prefix commands)
- `!play <url or search>` - Play a song.
- `!pause` / `!resume` - Pause/resume playback.
- `!skip` - Skip current song.
- `!stop` - Stop music and clear queue.
- `!queue` - View music queue.
- `!loop` - Toggle loop mode.

## 4. Confirmation-Required Actions

High-risk actions require explicit confirmation via Discord button interaction:

| Action | Risk Level | Who Can Confirm |
|--------|-----------|----------------|
| Delete channel | High | Admin+ |
| Delete category | Critical | Admin+ |
| Edit channel permissions | High | Admin+ |
| Apply channel preset | High | Admin+ |
| Create/edit guild policy | Medium | Admin+ |
| Apply policy template | High | Admin+ |
| Timeout user | High | Moderator+ |
| Kick user | High | Admin+ |
| Ban user | Critical | Admin+ |
| Purge messages | High | Moderator+ |

When you invoke a confirmation-required action, AshenAI will show an **Action Plan** with a Confirm/Cancel button. The plan expires after 5 minutes.

## 5. Rate Limiting

AshenAI enforces rate limits at multiple levels:

### Message Rate Limit
- Default: 10 requests per 60 seconds per user
- Applies to `/ask` command

### Tool Rate Limit
- Global: 20 tool requests per 60 seconds per guild
- Role-based multipliers:
  - Owner: Unlimited
  - Admin: 2x limit
  - Moderator: 1x limit
  - Member: 0.5x limit
  - Guest: 0.25x limit

### Moderation Rate Limit
- 5 moderation requests (warn/timeout/untimeout) per 60 seconds per user
- Prevents spam-abuse of moderation tools

If you hit a rate limit, you'll see a message like:
```
⚠️ Rate limit exceeded. Please wait X seconds.
```

## 6. Server Protection

Admins can protect channels and categories from modification:

- **Protected channels** cannot be renamed, edited, deleted, moved, or have permissions changed.
- **Protected categories** protect all child channels within them.
- Protection requires Admin role + ManageChannels Discord permission.

### Protection Commands (via AI tools)
- `protect_channel` / `unprotect_channel`
- `protect_category` / `unprotect_category`
- `list_protected_resources`
- `apply_channel_preset` (read-only, announcement, text-chat, voice-only, staff-only, public)

## 7. Governance & Policy

Admins can create server policies that define channel structure rules:

- **Policy templates**: community, gaming, moderated, staff-managed, private
- **Policy rules**: Require channels of specific types, enforce permissions, require categories
- **Drift detection**: Check if your server matches the policy
- **Remediation planning**: Generate plans to fix drift

### Policy Commands (via AI tools)
- `view_guild_policy` - View current policy
- `create_guild_policy` - Create a new policy
- `update_guild_policy` - Update existing policy
- `apply_policy_template` - Apply a preset template
- `detect_policy_drift` - Check for policy violations
- `generate_governance_report` - Full governance report
- `list_policy_templates` - List available templates

## 8. Security Protections

### What AshenAI Protects Against
- **Prompt injection**: User inputs are scanned for jailbreak attempts
- **Secret leakage**: AI output is scanned for API keys, tokens, passwords
- **Internal disclosure**: AI output is checked for system prompts, environment variables
- **Error sanitization**: Internal paths, stack traces, and ports are never shown to users
- **CSRF protection**: All state-changing web requests require CSRF tokens
- **Rate limiting**: Prevents abuse at message, tool, and web request levels
- **Command injection**: CLI coding agents use `execFile` (no shell); commands are validated against a hardcoded allowlist
- **Path traversal**: File access paths are normalized; `..`, absolute paths, encoded traversal, and null bytes are blocked
- **Audit integrity**: HMAC-signed audit chain with `SESSION_SECRET`; fallback key is ephemeral per process
- **Error message sanitization**: Raw system errors are logged server-side; generic messages shown to users

### What You Should Never Share
- Discord bot token
- API keys (AI providers, webhooks)
- `.env` file contents
- Server configuration details
- Internal error messages

If you see an internal error message in Discord, report it to the bot owner immediately.

## 9. Audit Logs

AshenAI records security-relevant actions to an audit log:

- Web dashboard logins and failures
- Configuration changes
- Rate limit resets
- Policy changes
- Tool execution results (success/denied/error)
- Moderation actions (via Discord audit log)

The audit log is HMAC-signed for integrity. Tampering breaks the signature chain.

### Viewing Audit Logs
Use the `view_tool_audit` tool to see recent tool executions:
- Filter by tool name, result, requester, risk level
- Default shows last 50 entries

## 10. What Moderators Can Do

| Can Do | Cannot Do |
|--------|-----------|
| Warn members | Kick or ban members |
| Timeout members (up to 28 days) | Edit server settings |
| Remove timeouts | Delete channels |
| View warnings | Manage permissions |
| Purge messages | Create/edit policies |
| View audit logs | Access web dashboard |
| Use AI chat tools in allowed channels | Bypass rate limits |

## 11. What Admins Can Do

| Can Do | Cannot Do |
|--------|-----------|
| All moderator actions | Access web dashboard (Owner only) |
| Create/edit/delete channels | Delete categories (requires confirmation) |
| Edit channel permissions | Manage channel permissions (requires confirmation) |
| Protect/unprotect channels | Bypass risk confirmation |
| Create/edit guild policies | Bypass rate limits |
| Apply policy templates | Access owner-only config |
| Apply channel presets | |

## 12. Error Messages

When something goes wrong, AshenAI shows generic error messages:

| You See | What It Means |
|---------|---------------|
| "I couldn't complete that action" | An internal error occurred. Check logs. |
| "Rate limit exceeded" | You're making too many requests. Wait. |
| "Permission denied" | You don't have the required role. |
| "Confirmation required" | This action needs explicit confirmation. |
| "Channel not allowed" | This tool can't be used in this channel. |
| "Guild isolation error" | Cross-server security check failed. |

Internal details (paths, stack traces, ports) are never shown to Discord users.

## 13. Troubleshooting

### Bot Not Responding
1. Check `/status` for system health
2. Check if AI providers are available
3. Check rate limit status with `/config ratelimit`

### Commands Not Working
1. Ensure the bot has required permissions in the server
2. Check if the command requires a specific role
3. Verify the bot is in the correct channel

### Music Not Playing
1. Ensure Lavalink server is running
2. Check if you're in a voice channel
3. Verify the bot has voice permissions

### Web Dashboard Issues
1. Check if the web server is running
2. Verify you're the bot owner
3. Check browser console for errors

## 14. Health Check

Run these to verify AshenAI is healthy:
- `/status` - Shows AI provider health, memory usage, agent status
- `/config status` - Shows runtime configuration
- `npm run check` (Terminal) - Runs TypeScript check and tests

## 15. Emergency Procedures

### If the Bot Is Compromised
1. **Immediately** revoke the Discord bot token via Discord Developer Portal
2. Revoke all API keys in `.env`
3. Generate new password hash and salt
4. Check audit logs for suspicious activity
5. Update `.env` with new credentials
6. Restart the bot

### If Moderation Was Abused
1. Check audit logs for who performed the action
2. Use `/config resetuser <user_id>` to reset their rate limits
3. Remove the moderator's Discord permissions
4. Report to the bot owner

## 16. Security Best Practices

1. **Never share `.env` file** - It contains all secrets
2. **Use strong passwords** - The owner password hash uses PBKDF2 with 100k iterations
3. **Enable HTTPS** - Set `NODE_ENV=production` for secure cookies
4. **Limit admin access** - Only give Admin role to trusted members
5. **Review audit logs** - Check periodically for suspicious activity
6. **Update regularly** - Keep AshenAI updated with latest security fixes
7. **Monitor rate limits** - Watch for unusual traffic patterns
8. **Protect critical channels** - Use protection tools for admin-only channels

## 17. Configuration Reference

### Required Environment Variables
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application client ID
- `LAVALINK_URL` - Lavalink server URL
- `LAVALINK_PASSWORD` - Lavalink server password
- `ASHENAI_OWNER_USERNAME` - Owner login username
- `ASHENAI_OWNER_PASSWORD_HASH` - Owner password hash (PBKDF2)
- `ASHENAI_OWNER_PASSWORD_SALT` - Owner password salt

### Optional Environment Variables
- `DISCORD_GUILD_ID` - Test guild for development
- `ADMIN_DISCORD_USER_IDS` - Comma-separated admin user IDs
- `SESSION_SECRET` - Web session secret (required in production; must be >= 16 characters)
- `ASHENAI_CORS_ORIGINS` - Allowed CORS origins
- Various `*_API_KEY` variables for AI providers
- `LOG_LEVEL` - Logging verbosity (info, debug, error)

---

*This manual covers only functionality that actually exists in the AshenAI codebase. Commands, permissions, and features are documented exactly as implemented.*
