# task-api

REST API manajemen task dengan registrasi, login JWT, dan penyimpanan SQLite. Dibangun dengan modul bawaan Node.js (`http`, `crypto`, `node:sqlite`), tanpa dependency eksternal.

## Fitur
- Registrasi dan login, password di-hash dengan scrypt
- Token JWT (HS256) dengan masa berlaku 1 jam
- CRUD task, status `todo` / `doing` / `done`, filter `?status=`
- Isolasi data: tiap user hanya bisa melihat dan mengubah task miliknya
- Validasi input, batas ukuran body 100 KB, query SQL berparameter

## Menjalankan
Butuh Node.js 22.13 atau lebih baru.
```bash
git clone https://github.com/wisnu-agustya2/task-api.git
cd task-api
JWT_SECRET=$(openssl rand -hex 32) npm start
```
Variabel opsional: `PORT` (default 3000), `DB_PATH` (default `tasks.db`).

## Endpoint
| Method | Path | Auth | Keterangan |
|---|---|---|---|
| GET | `/health` | - | Cek server |
| POST | `/auth/register` | - | `{ "email", "password" }` (password min. 8 karakter) |
| POST | `/auth/login` | - | Mengembalikan `{ "token" }` |
| GET | `/tasks` | Bearer | Daftar task, filter `?status=done` |
| POST | `/tasks` | Bearer | `{ "title" }` |
| GET | `/tasks/:id` | Bearer | Detail task |
| PATCH | `/tasks/:id` | Bearer | Ubah `title` dan/atau `status` |
| DELETE | `/tasks/:id` | Bearer | Hapus task |

## Contoh
```bash
curl -X POST localhost:3000/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"wisnu@contoh.com","password":"rahasia123"}'

TOKEN=$(curl -s -X POST localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"wisnu@contoh.com","password":"rahasia123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -X POST localhost:3000/tasks -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"title":"Belajar Node"}'
```

## Tes
```bash
npm test
```

## Lisensi
MIT
