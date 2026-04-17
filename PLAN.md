# Sistem Pembayaran SPP — SMAN 1 Denpasar

Planning document untuk sistem manajemen pembayaran SPP/Komite. Menggantikan workflow spreadsheet manual dengan web app yang import dari Excel asik.bpdbali dan export PDF format standar.

---

## 1. Tujuan & Scope

### Tujuan
1. Eliminate workflow manual spreadsheet (download asik.bpdbali → Excel → Spreadsheet per kelas/angkatan).
2. Satu source of truth: data pembayaran tersimpan terstruktur di database.
3. Output utama: **PDF matrix 3 halaman per rombel per angkatan** (kelas X/XI/XII × 12 bulan), format persis template existing.
4. UI/UX premium, cepat, tidak perlu training panjang untuk TU/Bendahara.

### In Scope (MVP)
- Auth (2 role: `SUPER_ADMIN`, `BENDAHARA`) — total 2 user aktif
- Master data: Siswa, Rombel, Tahun Ajaran
- Import pembayaran dari Excel asik.bpdbali (dengan **deteksi duplikat eksplisit di preview**)
- Paste dari spreadsheet (tabel HTML/TSV) untuk backfill historical
- Input manual: Keringanan (JUARA/OSN/dll) & Pelunasan (lunas sekaligus)
- **Export PDF matrix** (fitur flagship)
- **Export Excel** (rekap per rombel/angkatan/periode)
- Dashboard overview + laporan tunggakan
- Pengaturan (nominal SPP, tahun ajaran aktif, user management)

### Fitur Future (disebut user, untuk diingat)
- **Generate master data** — auto generate dummy/siswa dari nominal & rules tertentu (akan dibahas setelah MVP).

### Out of Scope (Phase 2+)
- Portal orang tua
- Notifikasi WA/email otomatis
- Pembayaran online langsung
- Integrasi realtime ke asik.bpdbali (API)
- Multi-sekolah / tenant

---

## 2. Tech Stack

| Layer | Tech | Alasan |
|---|---|---|
| Framework | **Next.js 15** (App Router) | Fullstack, RSC, API routes |
| Language | **TypeScript** (strict) | Type safety end-to-end |
| Database | **PostgreSQL 16** | Decimal type, JSONB, transaction, mature di Docker |
| ORM | **Prisma** | Schema-first, type-safe, migrations |
| Auth | **Auth.js (NextAuth v5)** | Credentials provider, JWT session |
| UI | **shadcn/ui** + **Tailwind CSS** | Accessible, unstyled primitives, full control |
| Icons | **Lucide React** | Clean line icons, no emoji |
| Forms | **React Hook Form** + **Zod** | Controlled forms, schema validation |
| Tables | **TanStack Table v8** | Headless, virtualization-ready |
| Charts | **Recharts** | Simple, SSR-compatible |
| PDF Gen | **@react-pdf/renderer** | React-based PDF, layout seperti JSX |
| Excel Parse | **exceljs** | Read/write Excel, streaming |
| State | **Zustand** (client) + RSC | Minimal client state |
| Fetcher | **TanStack Query** | Cache, mutations, optimistic updates |
| Validation | **Zod** | Shared schema client+server |
| Testing | **Vitest** (unit), **Playwright** (E2E) | Fast, modern |
| Linting | **ESLint** + **Prettier** + **lint-staged** | Code quality gates |
| Container | **Docker** + **Docker Compose** | VPS deployment |
| Reverse proxy | **Caddy** atau **Nginx** | HTTPS + cert auto-renew |

---

## 3. Layered Architecture

Pemisahan concerns agar business logic tidak terkunci ke framework (Next.js), dan mudah extract ke service terpisah kalau dibutuhkan nanti.

```
┌─────────────────────────────────────────────────────┐
│  Presentation Layer (app/, components/)             │
│    - Next.js App Router pages (server components)   │
│    - Client components (forms, tables, dialogs)     │
│    - Shared UI components (shadcn/ui)               │
└──────────────────────────┬──────────────────────────┘
                           │ calls via fetch/RSC
┌──────────────────────────▼──────────────────────────┐
│  API Layer (app/api/v1/)                            │
│    - Thin route handlers                            │
│    - Parse → validate (Zod) → call service          │
│    - Standard response envelope                     │
└──────────────────────────┬──────────────────────────┘
                           │ calls
┌──────────────────────────▼──────────────────────────┐
│  Service Layer (src/services/)                      │
│    - Use cases & business rules                     │
│    - Orchestrates repositories & external adapters  │
│    - Framework-agnostic (plain TS)                  │
└──────────────────────────┬──────────────────────────┘
                           │ uses
┌──────────────────────────▼──────────────────────────┐
│  Repository Layer (src/repositories/)               │
│    - Data access via Prisma                         │
│    - Encapsulates queries                           │
└──────────────────────────┬──────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────┐
│  Infrastructure (src/lib/)                          │
│    - db (Prisma client)                             │
│    - pdf generator, excel parser, auth adapter      │
│    - logger, mailer (future)                        │
└─────────────────────────────────────────────────────┘
```

### Folder Structure

```
pembayaran/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                    # sidebar + topbar
│   │   ├── page.tsx                      # dashboard
│   │   ├── siswa/
│   │   │   ├── page.tsx                  # list
│   │   │   └── [id]/page.tsx             # detail + matrix pembayaran
│   │   ├── rombel/page.tsx
│   │   ├── pembayaran/
│   │   │   ├── page.tsx                  # riwayat transaksi
│   │   │   ├── import/page.tsx           # upload Excel
│   │   │   ├── paste/page.tsx            # paste dari spreadsheet
│   │   │   └── manual/page.tsx           # input satu-satu
│   │   ├── keringanan/page.tsx
│   │   ├── pelunasan/page.tsx
│   │   ├── export/page.tsx               # PDF matrix
│   │   ├── laporan/page.tsx
│   │   └── pengaturan/
│   │       ├── profil/page.tsx
│   │       ├── tahun-ajaran/page.tsx
│   │       ├── pengguna/page.tsx
│   │       └── sistem/page.tsx
│   ├── api/v1/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── siswa/route.ts
│   │   ├── siswa/[id]/route.ts
│   │   ├── rombel/route.ts
│   │   ├── pembayaran/route.ts
│   │   ├── pembayaran/import/route.ts
│   │   ├── pembayaran/paste/route.ts
│   │   ├── keringanan/route.ts
│   │   ├── pelunasan/route.ts
│   │   ├── export/pdf/[rombelId]/route.ts
│   │   └── reports/tunggakan/route.ts
│   ├── layout.tsx
│   └── globals.css
│
├── src/
│   ├── core/                             # Domain layer (pure TS)
│   │   ├── entities/                     # Domain types & invariants
│   │   ├── errors/                       # AppError, ValidationError, etc
│   │   └── constants/
│   ├── services/                         # Application layer
│   │   ├── siswa.service.ts
│   │   ├── pembayaran.service.ts
│   │   ├── import.service.ts             # Excel/paste parsing orchestration
│   │   ├── keringanan.service.ts
│   │   ├── pelunasan.service.ts
│   │   ├── pdf.service.ts
│   │   └── report.service.ts
│   ├── repositories/                     # Data access
│   │   ├── siswa.repo.ts
│   │   ├── rombel.repo.ts
│   │   ├── pembayaran.repo.ts
│   │   └── keringanan.repo.ts
│   ├── lib/
│   │   ├── db.ts                         # Prisma singleton
│   │   ├── auth.ts                       # Auth.js config
│   │   ├── logger.ts
│   │   ├── excel/
│   │   │   ├── parser.ts                 # parse Rekonsiliasi Excel
│   │   │   └── schema.ts                 # column mapping
│   │   ├── pdf/
│   │   │   ├── matrix-document.tsx       # React-PDF document
│   │   │   ├── styles.ts
│   │   │   └── helpers.ts
│   │   └── validators/                   # Zod schemas (shared)
│   │       ├── siswa.schema.ts
│   │       ├── pembayaran.schema.ts
│   │       └── import.schema.ts
│   ├── components/
│   │   ├── ui/                           # shadcn primitives
│   │   ├── layouts/
│   │   │   ├── sidebar.tsx
│   │   │   ├── topbar.tsx
│   │   │   └── page-header.tsx
│   │   ├── tables/
│   │   │   ├── data-table.tsx            # generic TanStack table
│   │   │   └── payment-matrix.tsx        # matrix siswa × bulan (mirip PDF)
│   │   ├── forms/
│   │   │   ├── siswa-form.tsx
│   │   │   ├── keringanan-form.tsx
│   │   │   └── form-field.tsx            # wrapper label + input + error
│   │   ├── uploaders/
│   │   │   └── excel-uploader.tsx        # drag & drop dengan preview
│   │   ├── feedback/
│   │   │   ├── empty-state.tsx
│   │   │   ├── loading-skeleton.tsx
│   │   │   └── confirm-dialog.tsx
│   │   └── charts/
│   ├── hooks/
│   │   ├── use-siswa.ts                  # TanStack Query wrapper
│   │   ├── use-debounce.ts
│   │   └── use-keyboard-shortcut.ts
│   └── types/
│       ├── api.ts                        # response envelope types
│       └── domain.ts
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── tests/
│   ├── unit/services/
│   └── e2e/
│
├── public/
├── docker/
│   ├── Dockerfile
│   ├── Caddyfile
│   └── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## 4. Database Schema

Core schema dalam Prisma syntax. Siap untuk production dengan indexes dan constraints yang tepat.

### Entity Overview

| Entity | Tujuan |
|---|---|
| `User` | Akun TU/Bendahara/Admin |
| `TahunAjaran` | Periode akademik (mis. 2023/2024) |
| `Rombel` | Rombongan belajar (kelas X.1, XI.4, dst) per tahun ajaran |
| `Siswa` | Master data siswa |
| `Enrollment` | Penempatan siswa ke rombel per tahun ajaran (1 siswa bisa pindah rombel) |
| `Pembayaran` | Transaksi pembayaran (1 row = 1 bulan dibayar) |
| `Keringanan` | Potongan/bebas biaya per periode (JUARA, OSN, dll) |
| `Pelunasan` | Lunas sekaligus untuk rentang periode |
| `ImportBatch` | Audit trail import Excel |
| `Setting` | Konfigurasi sistem (nominal SPP, format PDF) |
| `AuditLog` | Jejak aksi sensitif |

### Schema (prisma/schema.prisma)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// ─── Identity ──────────────────────────────────────────────
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  nama         String
  role         Role     @default(TU)
  isActive     Boolean  @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  importBatches ImportBatch[]
  auditLogs     AuditLog[]
}

enum Role { SUPER_ADMIN BENDAHARA TU VIEWER }

// ─── Academic Structure ────────────────────────────────────
model TahunAjaran {
  id            String   @id @default(cuid())
  kode          String   @unique   // "2023/2024"
  tahunMulai    Int
  tahunAkhir    Int
  tanggalMulai  DateTime @db.Date
  tanggalAkhir  DateTime @db.Date
  isActive      Boolean  @default(false)
  nominalSppDefault Decimal @default(350000) @db.Decimal(12, 2)
  createdAt     DateTime @default(now())

  rombels       Rombel[]
  enrollments   Enrollment[]

  @@index([isActive])
}

model Rombel {
  id             String      @id @default(cuid())
  tahunAjaranId  String
  grade          Grade
  nomor          Int
  kode           String      // "XII.4" — sesuai Excel asik.bpdbali
  waliKelas      String?
  createdAt      DateTime    @default(now())

  tahunAjaran    TahunAjaran @relation(fields: [tahunAjaranId], references: [id], onDelete: Restrict)
  enrollments    Enrollment[]

  @@unique([tahunAjaranId, grade, nomor])
  @@unique([tahunAjaranId, kode])
  @@index([tahunAjaranId])
}

enum Grade { X XI XII }

// ─── Students ──────────────────────────────────────────────
model Siswa {
  id            String       @id @default(cuid())
  nis           String       @unique
  nama          String
  jenisKelamin  Gender?
  angkatan      Int          // tahun masuk, mis. 2023
  statusSiswa   StatusSiswa  @default(AKTIF)
  alamat        String?
  kontakOrtu    String?
  catatan       String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  enrollments   Enrollment[]
  pembayarans   Pembayaran[]
  keringanans   Keringanan[]
  pelunasans    Pelunasan[]

  @@index([angkatan, statusSiswa])
  @@index([nama])
}

enum Gender { L P }
enum StatusSiswa { AKTIF PINDAH LULUS DO CUTI }

model Enrollment {
  id             String      @id @default(cuid())
  siswaId        String
  rombelId       String
  tahunAjaranId  String
  noAbsen        Int?
  createdAt      DateTime    @default(now())

  siswa          Siswa       @relation(fields: [siswaId], references: [id], onDelete: Cascade)
  rombel         Rombel      @relation(fields: [rombelId], references: [id], onDelete: Restrict)
  tahunAjaran    TahunAjaran @relation(fields: [tahunAjaranId], references: [id], onDelete: Restrict)

  @@unique([siswaId, tahunAjaranId])
  @@index([rombelId])
}

// ─── Payments ──────────────────────────────────────────────
model Pembayaran {
  id                String        @id @default(cuid())
  siswaId           String
  periodYear        Int
  periodMonth       Int
  amount            Decimal       @db.Decimal(12, 2)
  biayaAdm          Decimal       @default(0) @db.Decimal(12, 2)
  tanggalTransaksi  DateTime
  noBukti           String?       @unique  // null untuk MANUAL
  kodeCabang        String?
  tellerUser        String?
  statusBayar       StatusBayar   @default(TERBAYAR)
  source            PaymentSource
  importBatchId     String?
  catatan           String?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  siswa             Siswa         @relation(fields: [siswaId], references: [id], onDelete: Restrict)
  importBatch       ImportBatch?  @relation(fields: [importBatchId], references: [id])

  @@unique([siswaId, periodYear, periodMonth])
  @@index([periodYear, periodMonth])
  @@index([tanggalTransaksi])
  @@index([kodeCabang])
}

enum StatusBayar { TERBAYAR DIBATALKAN }
enum PaymentSource { IMPORT_EXCEL PASTE_SPREADSHEET MANUAL }

// ─── Waivers ───────────────────────────────────────────────
model Keringanan {
  id           String          @id @default(cuid())
  siswaId      String
  periodYear   Int
  periodMonth  Int
  jenis        JenisKeringanan
  persentase   Int             @default(100) // 0-100
  alasan       String?
  buktiUrl     String?         // optional SK/surat
  createdAt    DateTime        @default(now())
  createdBy    String?

  siswa        Siswa           @relation(fields: [siswaId], references: [id], onDelete: Cascade)

  @@unique([siswaId, periodYear, periodMonth])
  @@index([periodYear, periodMonth])
}

enum JenisKeringanan {
  JUARA
  OSN
  JUARA_UMUM
  BEASISWA
  KELUARGA_TIDAK_MAMPU
  LAINNYA
}

// ─── Pelunasan (lunas sekaligus) ──────────────────────────
model Pelunasan {
  id             String    @id @default(cuid())
  siswaId        String
  periodeMulai   String    // "2023-07"
  periodeAkhir   String    // "2026-06"
  tanggalLunas  DateTime  @db.Date
  nominalTotal   Decimal   @db.Decimal(12, 2)
  noBukti        String?   @unique
  metodeLabel    String?   // "Transfer BPD", "Tunai"
  catatan        String?
  createdAt      DateTime  @default(now())
  createdBy      String?

  siswa          Siswa     @relation(fields: [siswaId], references: [id], onDelete: Restrict)

  @@index([siswaId])
}

// ─── Import & Audit ───────────────────────────────────────
model ImportBatch {
  id              String        @id @default(cuid())
  fileName        String
  fileSize        Int
  fileHash        String        @unique  // sha256 — cegah upload file sama
  uploadedAt      DateTime      @default(now())
  uploadedBy      String
  totalRows       Int           @default(0)
  successCount    Int           @default(0)
  duplicateCount  Int           @default(0)
  errorCount      Int           @default(0)
  errorDetails    Json?
  status          ImportStatus  @default(PENDING)

  user            User          @relation(fields: [uploadedBy], references: [id])
  pembayarans     Pembayaran[]
}

enum ImportStatus { PENDING PROCESSING COMPLETED FAILED PARTIAL }

model Setting {
  key         String   @id
  value       Json
  description String?
  updatedAt   DateTime @updatedAt
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String
  entity    String?
  entityId  String?
  metadata  Json?
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])

  @@index([createdAt])
  @@index([userId, createdAt])
}
```

### Idempotency & Data Integrity

- **`Pembayaran.noBukti` UNIQUE** → upload Excel dua kali, duplikat di-skip.
- **`(siswaId, periodYear, periodMonth)` UNIQUE** → satu siswa tidak bisa punya dua pembayaran untuk bulan yang sama (pencegahan bug).
- **`ImportBatch.fileHash` UNIQUE** → file identik tidak bisa diupload ulang.
- **Transactional import**: Semua row di-insert dalam 1 transaksi Postgres, rollback jika error >threshold.
- **Soft delete pattern**: Pembayaran tidak dihapus, status diubah ke `DIBATALKAN` (audit trail).

---

## 5. API Contract

Response envelope konsisten:

```ts
// Success
{ success: true, data: T, meta?: { page, limit, total } }

// Error
{ success: false, error: { code, message, details?, fields? } }
```

### Key Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/signin` | Login |
| POST | `/api/v1/auth/signout` | Logout |
| GET | `/api/v1/siswa` | List (search, filter, paginate) |
| POST | `/api/v1/siswa` | Create |
| GET | `/api/v1/siswa/:id` | Detail + payment matrix |
| PATCH | `/api/v1/siswa/:id` | Update |
| POST | `/api/v1/siswa/bulk-import` | Import master data siswa |
| GET | `/api/v1/rombel` | List by tahun ajaran |
| POST | `/api/v1/pembayaran/import` | Upload Excel asik.bpdbali |
| POST | `/api/v1/pembayaran/paste` | Paste TSV dari spreadsheet |
| POST | `/api/v1/pembayaran` | Manual entry |
| GET | `/api/v1/keringanan` | List |
| POST | `/api/v1/keringanan` | Create (bulk support) |
| POST | `/api/v1/pelunasan` | Record lunas sekaligus |
| GET | `/api/v1/export/pdf/:rombelId` | Stream PDF matrix |
| GET | `/api/v1/export/excel/:rombelId` | Stream Excel rekap |
| GET | `/api/v1/export/batch` | ZIP of PDF/Excel for multiple rombels |
| POST | `/api/v1/pembayaran/import/preview` | Parse + analyze (tidak commit), return duplicate analysis |
| POST | `/api/v1/pembayaran/import/confirm` | Execute import dengan pilihan user per row |
| GET | `/api/v1/reports/tunggakan` | Siswa belum bayar |
| GET | `/api/v1/reports/summary` | Dashboard KPI |

Auth guard middleware di `middleware.ts`, RBAC per route via helper `requireRole(['BENDAHARA'])`.

---

## 6. UI/UX Design

### Design Principles

1. **Kecepatan input** — keyboard shortcuts, autocomplete NIS, paste support.
2. **Preview sebelum commit** — import, PDF, semua ada preview.
3. **Feedback jelas** — toast untuk aksi, skeleton untuk loading, empty state untuk data kosong.
4. **Konsisten** — 1 bahasa (Indonesia), 1 set icon (Lucide), 1 grid spacing (Tailwind default).
5. **No emoji** — semua status dan info pakai icon Lucide (`CheckCircle2`, `AlertTriangle`, `Trophy`, `Award`).
6. **Accessible** — kontras WCAG AA, keyboard nav, aria-label, focus rings.

### Visual System

| Token | Value | Pakai di |
|---|---|---|
| Primary | `slate-900` | Text, brand |
| Accent | `emerald-600` | CTA, paid status |
| Warning | `amber-500` | Tunggakan |
| Danger | `red-600` | Error, reversal |
| Muted | `slate-500` | Secondary text |
| Surface | `white` / `slate-50` | Card background |
| Border | `slate-200` | Divider |

Typography: **Inter** (UI) + **JetBrains Mono** (NIS, angka).

### Page Layouts

**Sidebar (collapsed on mobile):**
- Logo + nama sekolah
- Nav sections: *Overview, Data Siswa, Pembayaran, Laporan, Pengaturan*
- Footer: current user + logout

**Topbar:**
- Breadcrumb
- Global search (Cmd+K) → jump to siswa by NIS/nama
- Tahun ajaran aktif selector
- Theme toggle

### Key Screens

#### Dashboard
- 4 KPI cards: *Pemasukan bulan ini*, *Total siswa aktif*, *Tunggakan > 1 bulan*, *Kolektibiliti %*
- Line chart pemasukan 12 bulan terakhir
- Table "10 siswa tunggakan terlama"
- Activity feed (import terakhir, export terakhir)

#### Import Excel (flagship) — dengan Duplicate Detection

**Step-by-step UX:**

1. **Upload zone** — drag & drop `.xlsx/.xls`, tampil nama file, size, SHA-256 hash. Jika hash sudah pernah diupload → langsung warning "File ini sudah pernah diimport di batch #X pada {tgl}".

2. **Parsing & Analysis** — background job parse + kategorisasi tiap row:
   | Status | Kriteria | Default action |
   |---|---|---|
   | `Baru` | `noBukti` belum ada, NIS match, periode unik | Import |
   | `Duplikat (No. Bukti)` | `noBukti` sudah ada di DB | Skip (tidak bisa override) |
   | `Duplikat (Periode)` | `(siswaId, year, month)` sudah ada dengan `noBukti` berbeda | **User decide**: skip / replace / flag |
   | `NIS Tidak Dikenal` | NIS belum terdaftar di master siswa | Buat siswa baru (checkbox) / skip |
   | `Invalid` | Kolom wajib kosong, format salah | Skip + tampil alasan |

3. **Preview table dengan filter tab** — `Semua (N)`, `Baru (N)`, `Duplikat (N)`, `Konflik (N)`, `Invalid (N)`. User bisa check/uncheck per row, atau bulk action per kategori.

4. **Ringkasan diff card** — total pemasukan yang akan ditambahkan, jumlah row per status, warning jika ada konflik belum di-resolve.

5. **Confirm dialog** — tampil ringkasan akhir, tombol `Import Sekarang`. Operasi transactional: semua berhasil atau rollback.

6. **Hasil** — progress bar saat proses, summary card (`X baru dimasukkan, Y di-skip, Z error`), link ke batch detail di audit log, tombol `Download laporan import (Excel)`.

**Logika duplikat di layer service:**
- `noBukti` adalah **idempotency key primer** — unique constraint di DB, cegah duplikat absolut.
- `(siswa, year, month)` adalah **logical key** — cegah double-pay periode yang sama via beda bukti.
- Hash file batch → hindari reprocess file sama.

#### Siswa Detail
- Header: foto/avatar default, NIS, nama, rombel aktif, status
- Tabs: *Profil*, *Matrix Pembayaran*, *Keringanan*, *Riwayat*
- Matrix tab: grid seperti PDF (36 bulan × scroll horizontal), cell click → edit/detail

#### Export PDF & Excel
- Filter: tahun ajaran, angkatan, rombel (multi-select), periode
- Preview panel: render inline PDF via iframe (pakai `react-pdf` viewer)
- Tombol: *Download PDF*, *Download Excel*, *Download ZIP* (batch semua rombel sekaligus)
- Format Excel: sheet matrix mirip PDF + sheet detail transaksi (NIS, nama, tanggal, nominal, no bukti, kode cabang)
- PDF footer: nama sekolah + tanggal cetak saja (tidak pakai tanda tangan)

#### Keringanan
- List dengan filter: angkatan, jenis (JUARA/OSN/dll), periode
- Dialog form: pilih siswa (autocomplete), pilih rentang bulan (multi), jenis, persentase, alasan, upload bukti
- Bulk assign: pilih banyak siswa sekaligus untuk periode yang sama

#### Pelunasan
- List pelunasan tercatat
- Form: siswa (autocomplete), rentang periode (dari–sampai), nominal auto-calculate, tanggal, bukti, catatan

#### Pengaturan
- *Profil* — update password, nama
- *Tahun Ajaran* — CRUD + set aktif, nominal default per tahun
- *Pengguna* — admin only, CRUD user + assign role
- *Sistem* — kop surat PDF, nama sekolah, alamat, NPSN, logo upload
- *Backup & Restore* — download dump DB (admin only)

### Shared Components Library

| Component | Responsibility |
|---|---|
| `<PageHeader title actions breadcrumbs />` | Header konsisten tiap halaman |
| `<DataTable columns data toolbar pagination />` | TanStack table wrapper |
| `<PaymentMatrix siswa periods data />` | Grid 36-bulan reusable (detail siswa & PDF preview) |
| `<ExcelUploader onParse />` | Drag-drop + parser integration |
| `<SiswaCombobox />` | Autocomplete NIS/nama dengan debounce |
| `<MonthRangePicker />` | Pick rentang bulan untuk keringanan/pelunasan |
| `<CurrencyInput />` | Input rupiah dengan formatter |
| `<StatusBadge variant />` | Lunas/Tunggak/Keringanan/Dibatalkan |
| `<ConfirmDialog />` | Destructive action guard |
| `<EmptyState icon title description action />` | Empty data view |
| `<FormField label error hint />` | Form row wrapper |
| `<StatCard label value delta icon />` | Dashboard KPI |
| `<Toolbar search filters actions />` | Table toolbar standard |

---

## 7. Clean Code Practices

- **Strict TypeScript**: `strict: true`, `noUncheckedIndexedAccess: true`.
- **Barrel files** dihindari (tree-shake friendly).
- **Zod-first DTOs**: schema di `lib/validators/`, di-`infer` jadi TS type. Reuse client+server.
- **Repository pattern**: semua akses DB melalui repo. Service tidak sentuh Prisma langsung (kecuali transactional use case).
- **Thin controllers**: API route ≤30 baris — parse → validate → call service → format response.
- **Error handling**: custom error classes (`NotFoundError`, `ConflictError`, `ValidationError`, `ForbiddenError`) dengan `statusCode` + `code`. Satu handler `apiHandler()` wrapper.
- **Naming**: domain Indonesia (`Siswa`, `Rombel`, `Pembayaran`), infra English (`repository`, `service`).
- **No magic numbers**: konstanta di `src/core/constants/`.
- **Commit hooks**: lint-staged + typecheck via `lefthook` atau `husky`.
- **Test coverage target**: service layer ≥70%, critical flows E2E (login, import, export PDF).
- **Logging**: `pino` dengan request id; redact password & token.
- **Formatter**: Prettier + Tailwind plugin untuk class order konsisten.

---

## 8. Security

| Area | Mitigasi |
|---|---|
| Auth | Auth.js credentials + bcrypt (cost 12), JWT session di httpOnly cookie, SameSite=Lax |
| Authorization | Middleware RBAC per route, `requireRole()` helper di server components |
| Password policy | Min 10 char, complexity check, force change on first login |
| Session | Idle timeout 30 menit, absolute timeout 12 jam, logout everywhere |
| Rate limit | `@upstash/ratelimit` atau in-memory: 5 login/menit/IP, 10 upload/menit/user |
| Input | Zod validation di semua endpoint, whitelist-based |
| SQL injection | Prisma parameterized (built-in) |
| XSS | React escape default + CSP header via `next.config.ts` |
| CSRF | SameSite cookie + Auth.js CSRF token |
| File upload | Whitelist MIME (xlsx/xls), magic byte check, max 10MB, scan stream |
| PII | `kontakOrtu` dan alamat tidak di-log; audit log tidak dump full body |
| Secrets | `.env` + `.env.production` gitignored, rotasi per kuartal |
| HTTPS | Caddy auto TLS (Let's Encrypt), HSTS, TLS 1.2+ |
| Backup | `pg_dump` harian via cron, retensi 30 hari, encrypted at rest |
| Audit | Semua write action (import, delete, export, role change) masuk `AuditLog` |
| Dependency | `npm audit` di CI, Renovate bot untuk update otomatis |
| Docker | Non-root user di container, read-only root FS, minimal base (distroless/alpine) |

---

## 9. Deployment (Docker on VPS)

### docker-compose.yml

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://spp:${DB_PASSWORD}@db:5432/spp
      NEXTAUTH_URL: https://${DOMAIN}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
    depends_on:
      db: { condition: service_healthy }

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: spp
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: spp
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./backup:/backup
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "spp"]
      interval: 10s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config

  backup:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes: ["./backup:/backup"]
    entrypoint: /bin/sh -c "while true; do pg_dump -h db -U spp spp | gzip > /backup/spp-$$(date +%F).sql.gz; find /backup -mtime +30 -delete; sleep 86400; done"
    environment: { PGPASSWORD: "${DB_PASSWORD}" }
    depends_on: [db]

volumes:
  pg_data:
  caddy_data:
  caddy_config:
```

### Dockerfile (multi-stage)

1. `deps` — `npm ci --omit=dev`
2. `builder` — Prisma generate + `next build` (standalone output)
3. `runner` — Node 20 alpine, non-root user, copy `.next/standalone` + `public` + `prisma`

---

## 10. Milestones

| Sprint | Deliverable | Durasi |
|---|---|---|
| **S0 — Setup** | Next.js scaffold, Prisma + DB, Docker compose, Caddy, CI, Auth, layout, shadcn/ui | 1 minggu |
| **S1 — Master Data** | Siswa/Rombel/TahunAjaran CRUD + import master siswa | 1 minggu |
| **S2 — Import Pembayaran** | Excel parser, paste parser, preview, transactional import, audit | 1–1.5 minggu |
| **S3 — Keringanan & Pelunasan** | Form + list + bulk assign | 3–4 hari |
| **S4 — PDF Export** | Matrix generator (flagship), preview, batch download | 1 minggu |
| **S5 — Dashboard & Laporan** | KPI, chart, tunggakan, summary | 3–4 hari |
| **S6 — Polish** | Empty states, shortcuts, dark mode, E2E tests, deploy production | 1 minggu |

Total estimasi: **~6–7 minggu** untuk MVP siap produksi.

---

## 11. Risks & Mitigations

| Risk | Dampak | Mitigasi |
|---|---|---|
| Format Excel asik.bpdbali berubah | Import rusak | Schema validator + fallback ke manual mapping UI |
| NIS di Excel tidak match siswa di DB | Row ter-skip | Preview error list, bulk create siswa dari import |
| Data lama tidak pernah di-migrasi | Gap historical | Tool paste dari spreadsheet untuk backfill |
| PDF layout diff dari template existing | Dokumen ditolak | Visual regression test per halaman (comparison image) |
| Nominal SPP berbeda per angkatan | Hitung lunas salah | `TahunAjaran.nominalSppDefault` + override per siswa |
| VPS down | Akses hilang | Backup harian + monitoring uptime (UptimeRobot) |

---

## 12. Decisions Log

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Nominal SPP | **Rp 350.000** tetap dulu. Akan dipakai untuk fitur *Generate Master Data* di phase berikutnya |
| 2 | User aktif | **2 user**: `SUPER_ADMIN` + `BENDAHARA` (alias Admin). Role `TU` dan `VIEWER` di schema disediakan untuk future tapi tidak dibuat user dulu |
| 3 | Export Excel | **Perlu**, selain PDF. Format: sheet matrix + sheet detail transaksi |
| 4 | Deteksi duplikat import | **Wajib eksplisit**: kategorisasi per row (`Baru`, `Duplikat No.Bukti`, `Duplikat Periode`, `NIS Tidak Dikenal`, `Invalid`) + UX resolve per row |
| 5 | PDF footer | Tidak pakai tanda tangan. Cukup nama sekolah + tanggal cetak |

## 13. Open Questions (menunggu info)

- Domain/subdomain untuk deploy (butuh untuk setup Caddy TLS).
- Periode SPP: Jul–Jun (12 bulan) — ada bulan free (mis. bulan ujian/libur)?
- Apakah perlu fitur cetak kwitansi per transaksi?

---

*Dokumen planning ini menjadi kontrak awal. Perubahan fitur setelah implementasi dimulai akan tracking via issue tracker terpisah.*
