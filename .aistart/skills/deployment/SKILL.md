---
name: deployment
description: Kesiapan aplikasi untuk produksi, environment variables, logging, dan strategi build.
---

# Production Readiness & Deployment Skill 🏭

Gunakan instruksi ini saat menyiapkan aplikasi untuk produksi:
1. **Environment Variables**: Simpan seluruh variabel spesifik lingkungan di `process.env` atau file `.env`.
2. **Build Optimization**: Buat script build yang menghasilkan aset terkompresi dan siap pakai (`npm run build`).
3. **Error Resilience**: Pasang handler global untuk unhandled promise rejection dan uncaught exception agar proses tidak crash diam-diam.
4. **Git Hygiene**: Pastikan build artifacts sementara dan file sensitif terdaftar di `.gitignore`.
