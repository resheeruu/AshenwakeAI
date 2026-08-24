---
name: api-design
description: Standar perancangan API RESTful/GraphQL, penanganan HTTP status code, dan validasi data.
---

# API Design & Contract Standards Skill 🔌

Gunakan instruksi ini saat merancang endpoint REST / GraphQL:
1. **Penamaan Noun Jamak**: Gunakan kata benda jamak untuk endpoint REST (contoh: `/api/v1/users`, `/api/v1/products`).
2. **Verba HTTP Tepat**: Gunakan `GET` (membaca), `POST` (membuat), `PUT`/`PATCH` (memperbarui), `DELETE` (menghapus).
3. **Respon Konsisten**: Kembalikan struktur JSON yang seragam mencakup `data`, `error`, dan status code HTTP yang sesuai (`200`, `201`, `400`, `401`, `404`, `500`).
4. **Validasi Input**: Validasi payload request di handler/middleware sebelum memproses logika bisnis.
