# Sistem Pembayaran SPP — SMAN 1 Denpasar

Aplikasi web untuk manajemen pembayaran SPP dan Komite. Menggantikan workflow spreadsheet manual dengan database terstruktur, import dari Excel asik.bpdbali, dan ekspor PDF matrix per rombel.

## Tech Stack

- Next.js 15 (App Router) + React 19 + TypeScript strict
- PostgreSQL 16 + Prisma
- Auth.js (NextAuth v5)
- Tailwind CSS + shadcn/ui + Lucide icons
- React Hook Form + Zod
- TanStack Table + TanStack Query
- @react-pdf/renderer + exceljs
- Vitest (unit) + Playwright (e2e)

Lihat `PLAN.md` untuk detail arsitektur dan ruang lingkup.

## Dev Setup

Prasyarat:
- Node.js 20+
- PostgreSQL 16 lokal atau Docker

Langkah:

```bash
# 1. Install dependencies
npm install

# 2. Copy environment
cp .env.example .env
# Edit DATABASE_URL dan NEXTAUTH_SECRET sesuai kebutuhan.
# Generate secret dengan: openssl rand -base64 32

# 3. Generate Prisma client & jalankan migrasi (setelah schema tersedia)
npm run prisma:generate
npm run prisma:migrate

# 4. Jalankan dev server
npm run dev
```

Aplikasi tersedia di <http://localhost:3000>.

## Scripts

| Command | Deskripsi |
|---|---|
| `npm run dev` | Dev server Next.js |
| `npm run build` | Build produksi (output standalone) |
| `npm run start` | Start server produksi |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type check |
| `npm run format` | Prettier write |
| `npm run test` | Vitest (unit) |
| `npm run test:e2e` | Playwright (e2e) |
| `npm run prisma:studio` | GUI database |

## Struktur

```
app/                Next.js App Router (pages, layouts, api routes)
src/
  components/       Komponen UI (ui/, layouts/, feedback/, ...)
  lib/              Infrastructure (db, auth, logger, pdf, excel, validators)
  services/         Application layer (use cases)
  repositories/     Data access
  core/             Domain (entities, errors, constants)
  hooks/            React hooks
prisma/             Schema & migrations
tests/              Unit & e2e tests
```

## Konvensi

- Bahasa UI: Indonesia (`Masuk`, `Siswa`, `Pembayaran`, dst).
- Ikon: Lucide React saja — tidak menggunakan emoji di mana pun.
- Warna: slate-900 primer, emerald-600 aksen, amber-500 peringatan, red-600 error.
- Font: Inter (UI) + JetBrains Mono (NIS/angka).
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`.

## Role Pengguna

- `SUPER_ADMIN` — konfigurasi penuh, manajemen pengguna.
- `BENDAHARA` — import, input manual, ekspor, laporan.
