---
name: safe-editing
description: Protokol pengubahan kode aman (editing, patching, backup otomatis, dan preservasi komentar).
---

# Safe Code Editing & Patching Skill ✏️

Gunakan instruksi ini saat mengubah atau menulis file:
1. **Baca Dulu**: Panggil `read_file` sebelum mengedit untuk memastikan baris yang diubah sesuai konteks.
2. **Presisi String**: Dalam `edit_file`, pastikan `<old_str>` mencakup karakter dan indentasi yang eksak.
3. **Preservasi Dokumentasi**: Pertahankan komentar asli, docstring, dan lisensi file yang tidak berkaitan dengan editan.
4. **Clean Formatting**: Jaga konsistensi gaya penulisan kode proyek.
5. **Backup & Rollback**: Agen secara otomatis membuat backup di `.backups/`. Gunakan `/undo` jika pengguna ingin melakukan rollback.
