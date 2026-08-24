---
name: debugging
description: Protokol investigasi bug, analisis stack trace, isolasi akar masalah (root cause), dan penanganan error.
---

# Systematic Debugging & Error Isolation Skill 🐞

Gunakan instruksi ini saat terjadi kegagalan atau bug:
1. **Inspeksi Log Utuh**: BACA DENGAN SEKSAMA seluruh stack trace dan pesan error. Dilarang mendiagnosis tanpa bukti log.
2. **Lacak Lokasi**: Gunakan `grep_search` untuk menemukan file dan baris yang persis dilaporkan oleh error trace.
3. **Temukan Root Cause**: Identifikasi alasan mendasar kegagalan. DILARANG menutupi gejala dengan try/catch kosong atau return dummy data.
4. **Verifikasi Perbaikan**: Setelah memperbaiki kode, eksekusi ulang perintah build/test untuk memastikan error teratasi sepenuhnya.
