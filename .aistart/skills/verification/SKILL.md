---
name: verification
description: Prosedur verifikasi komprehensif setelah modifikasi kode untuk menjamin tidak ada regresi.
---

# Runtime & Build Verification Skill ⏱️

Gunakan instruksi ini sebelum menyatakan tugas selesai:
1. **Dilarang Klaim Tanpa Bukti**: Mengedit file saja TIDAK SAMA dengan menyelesaikan tugas.
2. **Build Check**: Eksekusi perintah build (`npm run build`, `tsc`, `go build`) untuk memastikan tidak ada syntax/type error.
3. **Test Suite**: Jalankan suite tes proyek untuk memastikan tidak ada regresi pada fitur lain.
4. **Runtime Check**: Jika memungkinkan, jalankan perintah runtime sederhana untuk memverifikasi output akhir secara empiris.
