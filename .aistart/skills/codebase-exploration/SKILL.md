---
name: codebase-exploration
description: Metodologi pencarian dan eksplorasi codebase secara efektif menggunakan list_dir, file_search, dan grep_search.
---

# Codebase Exploration Skill 🔍

Gunakan instruksi ini untuk memetakan dan memahami codebase:
1. **Dilarang Menebak**: Jangan pernah menduga isi file, nama fungsi, atau skema data tanpa memeriksa langsung.
2. **Periksa Entrypoint**: Mulai dari file manifest (`package.json`, `tsconfig.json`, `go.mod`) untuk mengidentifikasi dependensi dan file utama.
3. **Struktur Folder**: Gunakan `list_dir` untuk memetakan direktori tingkat atas proyek.
4. **Pencarian File**: Gunakan `file_search` dengan pola wildcard (seperti `*.js`, `*.ts`, `*.py`) untuk menemukan lokasi file target.
5. **Grep Kode**: Gunakan `grep_search` untuk melacak deklarasi, impor, atau penggunaan fungsi/kelas di seluruh repositori.
6. **Telusuri Alur**: Ikuti rantaian impor dan eksekusi secara berurutan.
