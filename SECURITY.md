# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | Yes                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue.**
2. Email the maintainer or use GitHub's private vulnerability reporting.
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

You can expect an initial response within 72 hours.

## Security Architecture

AshenAI implements multiple security layers:

- **5-tier role hierarchy**: owner > admin > moderator > member > guest
- **Confirmation system**: high-risk actions require one-time-use confirmation tokens
- **SSRF protection**: blocks private IPs, metadata endpoints, protocol downgrades
- **Audit chain**: HMAC-SHA256 signed entries with chain verification
- **Input gateway**: blocks prompt injection and secret extraction attempts
- **Output guard**: prevents leaked secrets in AI responses
- **Rate limiting**: per-user and per-tool limits with role-based multipliers

## Secrets in Repository

This repository uses gitleaks in CI to scan for accidentally committed secrets.
Test fixtures that intentionally contain fake secrets are excluded via `.gitleaks.toml`.

**Never commit real secrets.** Use `.env` (gitignored) for local configuration.
