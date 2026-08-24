---
name: git-workflow
description: Panduan git hygiene, Conventional Commits, penanganan diff, dan pembatalan perubahan.
---

# Git Workflow & Conventional Commits Skill 🌿

Gunakan instruksi ini untuk manajemen git:
1. **Periksa Diff**: Gunakan `git diff` atau slash command `/diff` untuk meninjau perubahan sebelum commit.
2. **Conventional Commits**: Tulis pesan commit dengan prefix baku: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
3. **Kebersihan File**: Jangan pernah commit file kredensial (`.env`), file log, atau folder dependensi (`node_modules`).
4. **Auto Commit**: Gunakan slash command `/commit` untuk mengotomatisasi generasi pesan commit dari diff.
