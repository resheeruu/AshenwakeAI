---
name: security
description: Standar keamanan kode, pencegahan OWASP Top 10, sanitasi input, dan perlindungan credentials.
---

# Application Security & OWASP Hardening Skill 🛡️

Gunakan instruksi ini untuk menjaga keamanan aplikasi:
1. **No Hardcoded Secrets**: DILARANG menyimpan API key, password, token, atau private key di dalam kode. Gunakan environment variables (`.env`).
2. **Sanitasi Input**: Sanitasi dan validasi semua data dari pengguna untuk mencegah SQL Injection, Command Injection, dan XSS.
3. **Hindari Fungsi Berbahaya**: Dilarang menggunakan `eval()`, `exec()`, atau `innerHTML` tanpa sanitasi ketat.
4. **Masking Logging**: Pastikan data sensitif tidak tercetak pada log console atau error trace response.
