---
name: database
description: Praktik terbaik desain skema database, migrasi, query terindeks, dan keamanan transaksi.
---

# Database Architecture & Query Safety Skill 🗄️

Gunakan instruksi ini untuk perancangan dan interaksi database:
1. **Skema Terstruktur**: Tentukan tipe data yang tepat, penamaan tabel/kolom yang konsisten, dan foreign key constraints.
2. **Parameterized Queries**: SELALU gunakan parameter placeholders (`?`, `$1`) atau ORM untuk mencegah SQL Injection.
3. **Transaksi Atomik**: Gunakan transaksi (`BEGIN` / `COMMIT` / `ROLLBACK`) untuk operasi multi-tabel yang bergantung satu sama lain.
4. **Indexing**: Buat indeks pada kolom yang sering dicari atau digunakan dalam pemfilteran (`WHERE`, `JOIN`, `ORDER BY`).
