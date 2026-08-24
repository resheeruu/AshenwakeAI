---
name: dependencies
description: Pengelolaan dependensi package, audit versi, dan kompatibilitas modul.
---

# Dependency & Package Management Skill 📦

Gunakan instruksi ini saat menambah atau memperbarui dependensi:
1. **Audit Eksisting**: Periksa file manifest (`package.json`, `requirements.txt`, `go.mod`) sebelum menambah modul baru.
2. **Manfaatkan Modul Proyek**: Utamakan fungsi/library yang sudah terpasang sebelum menginstal pustaka eksternal baru.
3. **Instalasi Aman**: Panggil `run_command` untuk menginstal package yang stabil dan bebas dari catatan kemanan terpublikasi.
4. **Kompatibilitas Node/Language**: Pastikan versi package mendukung runtime lingkungan proyek.
