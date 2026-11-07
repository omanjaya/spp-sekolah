# API Integrasi Bendahara — v1

> **v1.1.0 (2026-11-07):** parameter `period_from` di `/payments` untuk menyaring bulan iuran.

API baca-saja antarpeladen agar aplikasi bendahara (Go + React) dapat menyinkronkan
pembayaran Sumbangan Komite (SPP), pembatalan, dan refund dari aplikasi SPP.

- **Base URL:** `https://spp.nouma.id/api/integrations/bendahara/v1`
- **Kontrak OpenAPI 3.1:** `GET https://spp.nouma.id/api/integrations/bendahara/v1/openapi.json` (publik, tanpa data)
  — sumber: `src/lib/integration/bendahara-openapi.ts`
- **Autentikasi:** `Authorization: Bearer sppbdh_<token_id>_<64 hex>`
- **Format:** JSON UTF-8, `Cache-Control: no-store`. Hanya metode `GET`.

> Semua contoh di dokumen ini memakai **data sintetis**.

| Endpoint | Fungsi |
|---|---|
| `GET /info` | Identitas sekolah, versi API, mata uang, zona waktu, info token |
| `GET /payments` | Feed pembayaran: pengambilan awal seluruh riwayat + perubahan berikutnya. Opsional `period_from=YYYY-MM` |
| `GET /refunds` | Feed refund, termasuk refund tanpa pembayaran asal dan tombstone refund yang dibatalkan |
| `GET /summary?from=&to=[&group_by=day\|month]` | Ringkasan penerimaan, refund, penerimaan bersih, dan jumlah transaksi |
| `GET /openapi.json` | Spesifikasi OpenAPI |

Sebelumnya belum ada endpoint yang setara. Endpoint `/api/v1/*` milik aplikasi SPP memakai sesi login
(cookie), bukan token antarpeladen, sehingga API ini dibuat terpisah di `/api/integrations/...`.

---

## 1. Token: membuat, memasang, mencabut

Token hanya punya akses baca (`payments:read`) dan terikat ke **satu** `school_id`. Server
hanya menyimpan **hash SHA-256** token di konfigurasi server (`.env`), bukan token aslinya.

### Membuat

Di server SPP (`~/project/sppsmansa/spp-sekolah`):

```sh
scripts/bendahara-token.sh bendahara-prod 50103017
```

Keluaran:

```
Token (simpan di konfigurasi server aplikasi bendahara, JANGAN di-commit):
  sppbdh_bendahara-prod_<64 karakter hex>

Entri untuk BENDAHARA_API_TOKENS di .env SPP (pisahkan beberapa entri dengan koma):
  bendahara-prod:50103017:<sha256>
```

1. Tambahkan entri ke `.env` SPP:
   `BENDAHARA_API_TOKENS="bendahara-prod:50103017:<sha256>"`
   (beberapa token dipisahkan koma, misalnya saat rotasi).
2. Terapkan konfigurasi: `docker compose up -d --no-build app` (container di-recreate dalam beberapa detik).
3. Simpan token plaintext di konfigurasi server aplikasi bendahara (env/secret manager). Token tidak bisa
   ditampilkan ulang; kalau hilang, buat token baru.

### Mencabut

Hapus entri token dari `BENDAHARA_API_TOKENS`, lalu `docker compose up -d --no-build app`.
Setelah itu, permintaan dengan token tersebut ditolak dengan `401 UNAUTHORIZED`.

**Rotasi tanpa jeda:** tambahkan token baru → recreate → ganti token di aplikasi bendahara → hapus token lama → recreate.

### Konfigurasi server lain

| Variabel | Default | Arti |
|---|---|---|
| `BENDAHARA_API_TOKENS` | kosong (API menolak semua) | Daftar `tokenId:schoolId:sha256` dipisah koma |
| `BENDAHARA_SCHOOL_ID` | Setting `school.npsn` (`50103017`) | ID sekolah instance ini |
| `BENDAHARA_API_RATE_PER_MINUTE` | `120` | Batas permintaan per token per menit |
| `BENDAHARA_API_SETTLE_SECONDS` | `30` | Jeda pengendapan feed (lihat §3) |

### Pembatasan

- **Per token:** 120 permintaan/menit. Header `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
  (epoch detik). Jika terlampaui: `429 RATE_LIMITED` + `Retry-After` (detik).
- **Per IP untuk token yang salah:** 20 kegagalan/menit, lalu `429`.
- **Sekolah:** token untuk sekolah lain → `403 SCHOOL_FORBIDDEN`. Parameter opsional `school_id`
  pada setiap endpoint harus sama dengan sekolah token; jika berbeda, juga `403`.
- **HTTPS:** host Caddy melayani TLS untuk `spp.nouma.id`, dan app hanya terikat ke `127.0.0.1`.
  Selalu panggil URL `https://`. Jangan mengikuti redirect dari `http://`, karena token sudah terkirim
  tanpa enkripsi sebelum redirect terjadi.

---

## 2. Contoh curl

```sh
export SPP_API=https://spp.nouma.id/api/integrations/bendahara/v1
export SPP_TOKEN='sppbdh_bendahara-prod_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

curl -sS -H "Authorization: Bearer $SPP_TOKEN" "$SPP_API/info"

# Pengambilan awal (halaman pertama), 500 per halaman
curl -sS -H "Authorization: Bearer $SPP_TOKEN" "$SPP_API/payments?limit=500"

# Hanya bulan iuran Januari 2025 ke atas (filter ikut tersimpan di next_cursor)
curl -sS -H "Authorization: Bearer $SPP_TOKEN" "$SPP_API/payments?limit=500&period_from=2025-01"

# Halaman berikutnya / sinkronisasi berikutnya
curl -sS -H "Authorization: Bearer $SPP_TOKEN" "$SPP_API/payments?limit=500&cursor=eyJ2IjoxLCJ0Ijo..."

# Alternatif tanpa cursor: semua perubahan sejak waktu tertentu
curl -sS -G -H "Authorization: Bearer $SPP_TOKEN" "$SPP_API/payments" \
  --data-urlencode "updated_since=2026-11-01T00:00:00+08:00"

curl -sS -H "Authorization: Bearer $SPP_TOKEN" "$SPP_API/refunds?limit=500"

curl -sS -H "Authorization: Bearer $SPP_TOKEN" "$SPP_API/summary?from=2026-08-01&to=2026-08-31"
curl -sS -H "Authorization: Bearer $SPP_TOKEN" "$SPP_API/summary?from=2026-07-01&to=2027-06-30&group_by=month"
```

---

## 3. Sinkronisasi: cursor, watermark, dan idempotensi

`/payments` dan `/refunds` adalah **feed perubahan** yang diurutkan stabil berdasarkan
`(updated_at, id)` (keyset pagination, bukan offset).

Setiap kali sebuah pembayaran berubah, `updated_at`-nya naik dan pembayaran itu muncul lagi di
feed **dengan `payment_id` yang sama**. Contoh perubahan: koreksi nominal atau No. Bukti oleh impor
ulang BPD, pembatalan, refund dibuat atau dihapus, catatan diubah.

**Yang perlu disimpan aplikasi bendahara:** satu string `next_cursor` per feed
(`payments_cursor`, `refunds_cursor`).

Algoritma (sama untuk kedua feed):

```
cursor := load("payments_cursor")          // null pada sinkronisasi pertama = seluruh riwayat
loop:
    resp := GET /payments?limit=500[&cursor=cursor]
    BEGIN TRANSACTION
      for p in resp.data: UPSERT payment by payment_id   // ganti seluruh isi, termasuk allocations & adjustments
      if resp.pagination.next_cursor != null: save("payments_cursor", resp.pagination.next_cursor)
    COMMIT
    cursor := resp.pagination.next_cursor
    if !resp.pagination.has_more: break
```

Jaminan dan aturannya:

- **Tidak ada transaksi terlewat.** Baris yang berubah ketika sinkronisasi masih berjalan pindah ke
  belakang feed, sehingga tetap terambil di halaman berikutnya atau pada sinkronisasi berikutnya.
- **Jeda pengendapan.** Feed hanya mengirim baris dengan `updated_at <= settled_until`
  (sekarang − 30 detik). Dengan begitu, transaksi database yang belum commit saat cursor lewat
  tidak terlewati. Akibatnya, perubahan baru terlihat paling cepat 30 detik setelah terjadi.
- **Pengambilan ulang tidak menggandakan data.** Kuncinya `payment_id`, `allocation_id`, dan
  `adjustment_id`. Selalu lakukan upsert, jangan insert.
- Halaman bisa berisi pembayaran yang sudah pernah diterima. Ini normal, karena artinya ada perubahan.
- Menyimpan cursor bersama upsert dalam satu transaksi membuat sinkronisasi bisa dilanjutkan
  dengan aman setelah crash.
- Sinkronisasi ulang penuh bisa dilakukan kapan saja dengan `cursor = null`. Lakukan ini **setelah
  restore backup** aplikasi SPP, karena data hasil restore membawa `updated_at` lama.
- `updated_since` (ISO 8601 **dengan** zona waktu) setara dengan `updated_at >= nilai`. Tidak boleh
  digabung dengan `cursor`. Untuk sinkronisasi rutin, gunakan cursor.
- `limit` 1–1000, default 200. Cursor bersifat opak; jangan di-parse.
- `period_from=YYYY-MM` (khusus `/payments`) hanya mengirim pembayaran dengan **bulan iuran**
  (`allocations[].year/month`) ≥ nilai tersebut, misalnya `period_from=2025-01`. Dasarnya bulan
  iuran, bukan tanggal bayar: tunggakan iuran 2024 yang dibayar tahun 2025 tidak ikut.
  - Filter **tersimpan di `next_cursor`**. Halaman lanjutan dan sinkronisasi berikutnya cukup
    membawa `cursor`; boleh juga mengirim ulang `period_from` yang sama.
  - Cursor yang dipakai bersama `period_from` berbeda (atau cursor tanpa filter + `period_from`)
    ditolak `400`. Untuk mengganti filter, mulai sinkronisasi baru tanpa cursor.
  - Respons menyertakan `"filters": { "period_from": "2025-01" }` (atau `null`).
  - Perubahan atas pembayaran dengan bulan iuran sebelum `period_from` tidak dikirim.
- Pembayaran tidak pernah dihapus permanen oleh aplikasi SPP (relasi `Restrict`). Penghapusan
  diwakili oleh `status: CANCELLED`. Refund yang dihapus tetap dikirim sebagai tombstone
  `status: VOIDED`.

---

## 4. Arti field

### Pembayaran (`/payments`)

| Field | Arti |
|---|---|
| `payment_id` | ID tetap dan unik (cuid dari tabel `Pembayaran`). Kunci upsert. |
| `school_id` | ID sekolah (NPSN). |
| `student.student_id / nis / name` | ID internal siswa (tetap), NIS, nama. |
| `enrollment` | Kelas (`grade` X/XI/XII), rombel (mis. `XII.4`), dan `academic_year` **untuk tahun ajaran bulan iuran**, bukan tahun ajaran saat membayar. `null` jika siswa tidak terdaftar di rombel pada tahun ajaran tersebut (mis. data lama sebelum 2023). |
| `receipt_number` | No. Bukti BPD. `null` untuk input manual. |
| `fund` | Jenis dana. Saat ini selalu `SUMBANGAN_KOMITE` (lihat §7). Petakan ke **Dana Komite**. |
| `channel.code` | `BPD` (impor/tempel rekonsiliasi BPD) atau `MANUAL` (input manual di aplikasi SPP). |
| `channel.source` | Sumber teknis: `IMPORT_EXCEL`, `PASTE_SPREADSHEET`, `MANUAL`. |
| `channel.branch_code`, `channel.teller` | Kode mentah dari file BPD (mis. `TLR`/`webteller`, `EB`/`igate_pac`, `GAPURA`/`GAPURA129`, `UEL`/`UANG_ELEKTRONIK`, nomor cabang). |
| `amount` | Nominal iuran, **tanpa** biaya administrasi. |
| `admin_fee` | Biaya administrasi, dicatat terpisah. |
| `total_paid` | `amount + admin_fee`. |
| `is_cash_receipt` | `false` jika `amount = "0.00"`. Baris ini adalah penanda keringanan/pindahan di matriks SPP (contoh: catatan "JUARA — keringanan"), bukan uang masuk. |
| `paid_at` | Tanggal dan jam pembayaran sebenarnya, WITA (`+08:00`). |
| `paid_date` | Tanggal pembayaran (WITA). |
| `paid_time_known` | `false` jika sumber hanya memberi tanggal; jam ditulis `00:00:00`. |
| `status` | `PAID` (tercatat lunas) atau `CANCELLED` (pembayaran dibatalkan/di-void di SPP). |
| `allocations[]` | Bulan iuran yang dibayar: `allocation_id`, `year`, `month`, `academic_year`, `amount`. **Bulan iuran terpisah dari tanggal pembayaran.** Jumlah `allocations[].amount` = `amount`. |
| `refunded_amount` | Jumlah refund `ACTIVE` yang terkait pembayaran ini. |
| `net_amount` | `(amount jika PAID, 0 jika CANCELLED) − refunded_amount`. |
| `adjustments[]` | Riwayat pembatalan (REVERSAL) dan refund (REFUND) untuk pembayaran ini. |
| `note` | Catatan bebas dari aplikasi SPP. |
| `created_at`, `updated_at` | Instan UTC (`Z`). `updated_at` adalah dasar sinkronisasi. |

### Adjustment (di `payments[].adjustments` dan `/refunds`)

| Field | Arti |
|---|---|
| `adjustment_id` | ID tetap. REFUND: ID refund. REVERSAL: `rev_<payment_id>`. |
| `type` | `REVERSAL` = **pembatalan pembayaran**: catatan pembayaran dinyatakan tidak berlaku (salah input, salah siswa, dobel). Tidak berarti ada uang yang keluar. `REFUND` = **pengembalian uang yang benar-benar terjadi** kepada siswa/orang tua; bisa sebagian. |
| `payment_id` | Referensi pembayaran asal. Refund boleh `null` (refund kelebihan bayar tanpa pembayaran spesifik). |
| `amount` | Nominal (string rupiah). REVERSAL = nominal pembayaran yang dibatalkan. |
| `occurred_on` | Tanggal kejadian (WITA): tanggal refund / tanggal pembatalan disetujui. |
| `occurred_at` | (REVERSAL) instan pembatalan disetujui. |
| `document_number` | No. bukti refund jika ada. |
| `reason` | Alasan. |
| `status` | `ACTIVE`, atau `VOIDED` = refund dihapus/dibatalkan di SPP (tombstone, lihat `voided_at`). |
| `source` | (REVERSAL) `CANCEL_REQUEST` (alur persetujuan), `DIRECT_CANCEL`, atau `UNKNOWN`. |

**Pembatalan tagihan vs. pembayaran vs. pengembalian uang:**
- *Pembatalan/pembebasan tagihan* (keringanan) **tidak** dikirim sebagai pembayaran, kecuali
  baris penanda bernominal 0 (`is_cash_receipt: false`). Lihat §7.
- *Pembatalan pembayaran* → `status: CANCELLED` + adjustment `REVERSAL`. Uang tidak dianggap masuk.
- *Refund* → adjustment `REFUND`. Uang tetap dihitung masuk di tanggal bayar, lalu dikurangi di
  tanggal refund.

### Nominal

Semua nominal adalah rupiah dalam bentuk **string desimal dengan 2 angka di belakang titik**
(`"350000.00"`), tanpa pemisah ribuan. Gunakan tipe desimal (`shopspring/decimal` di Go,
`NUMERIC` di DB), jangan float.

### Waktu

| Field | Format | Zona |
|---|---|---|
| `paid_at` | `2026-08-05T10:15:00+08:00` | Waktu lokal sekolah (WITA, `Asia/Makassar`) |
| `paid_date`, `occurred_on`, `allocations[].year/month` | `YYYY-MM-DD` / angka | Kalender WITA |
| `created_at`, `updated_at`, `voided_at`, `occurred_at`, `settled_until`, `server_time` | `2026-11-03T02:15:04.120Z` | UTC |

---

## 5. Contoh JSON (data sintetis)

### `GET /info`

```json
{
  "api_version": "1.0.0",
  "school": { "school_id": "99990001", "name": "SMA Contoh Sintetis", "npsn": "99990001", "address": "Jl. Contoh No. 1" },
  "currency": "IDR",
  "timezone": "Asia/Makassar",
  "utc_offset": "+08:00",
  "funds": [{ "code": "SUMBANGAN_KOMITE", "name": "Sumbangan Komite (SPP)" }],
  "token": { "token_id": "bdh-test", "scopes": ["payments:read"] },
  "sync": { "settle_lag_seconds": 30, "max_page_size": 1000, "default_page_size": 200 },
  "server_time": "2026-11-07T05:10:00.000Z"
}
```

### `GET /payments` — tiga bulan dibayar sekaligus, satu di antaranya ada refund sebagian

Di sistem SPP, satu kunjungan bayar 3 bulan tercatat sebagai 3 transaksi BPD, masing-masing dengan
No. Bukti sendiri. Karena itu ketiganya muncul sebagai 3 pembayaran dengan satu alokasi per pembayaran.

```json
{
  "data": [
    {
      "payment_id": "cmsyn0000pay0000000000001",
      "school_id": "99990001",
      "student": { "student_id": "cmsyn0000sis0000000000001", "nis": "900001", "name": "Siswa Sintetis A" },
      "enrollment": { "academic_year": "2026/2027", "grade": "XII", "rombel": "XII.4", "rombel_id": "cmsyn0000rmb0000000000001" },
      "receipt_number": "SYN-0101",
      "fund": { "code": "SUMBANGAN_KOMITE", "name": "Sumbangan Komite (SPP)" },
      "channel": { "code": "BPD", "source": "IMPORT_EXCEL", "branch_code": "EB", "teller": "igate_pac" },
      "currency": "IDR",
      "amount": "350000.00",
      "admin_fee": "0.00",
      "total_paid": "350000.00",
      "is_cash_receipt": true,
      "paid_at": "2026-08-05T10:15:00+08:00",
      "paid_date": "2026-08-05",
      "paid_time_known": true,
      "status": "PAID",
      "allocations": [
        { "allocation_id": "cmsyn0000pay0000000000001:2026-07", "year": 2026, "month": 7, "academic_year": "2026/2027", "amount": "350000.00" }
      ],
      "refunded_amount": "0.00",
      "net_amount": "350000.00",
      "adjustments": [],
      "note": null,
      "created_at": "2026-08-05T02:20:11.402Z",
      "updated_at": "2026-08-05T02:20:11.402Z"
    },
    {
      "payment_id": "cmsyn0000pay0000000000002",
      "school_id": "99990001",
      "student": { "student_id": "cmsyn0000sis0000000000001", "nis": "900001", "name": "Siswa Sintetis A" },
      "enrollment": { "academic_year": "2026/2027", "grade": "XII", "rombel": "XII.4", "rombel_id": "cmsyn0000rmb0000000000001" },
      "receipt_number": "SYN-0102",
      "fund": { "code": "SUMBANGAN_KOMITE", "name": "Sumbangan Komite (SPP)" },
      "channel": { "code": "BPD", "source": "IMPORT_EXCEL", "branch_code": "EB", "teller": "igate_pac" },
      "currency": "IDR",
      "amount": "350000.00",
      "admin_fee": "0.00",
      "total_paid": "350000.00",
      "is_cash_receipt": true,
      "paid_at": "2026-08-05T10:15:00+08:00",
      "paid_date": "2026-08-05",
      "paid_time_known": true,
      "status": "PAID",
      "allocations": [
        { "allocation_id": "cmsyn0000pay0000000000002:2026-08", "year": 2026, "month": 8, "academic_year": "2026/2027", "amount": "350000.00" }
      ],
      "refunded_amount": "50000.00",
      "net_amount": "300000.00",
      "adjustments": [
        {
          "adjustment_id": "cmsyn0000rfd0000000000001",
          "type": "REFUND",
          "payment_id": "cmsyn0000pay0000000000002",
          "student_id": "cmsyn0000sis0000000000001",
          "amount": "50000.00",
          "occurred_on": "2026-08-10",
          "document_number": null,
          "reason": "Refund sebagian (sintetis)",
          "status": "ACTIVE",
          "voided_at": null,
          "created_at": "2026-08-10T03:00:00.000Z",
          "updated_at": "2026-08-10T03:00:00.000Z"
        }
      ],
      "note": null,
      "created_at": "2026-08-05T02:20:11.405Z",
      "updated_at": "2026-08-10T03:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 2,
    "has_more": true,
    "next_cursor": "eyJ2IjoxLCJ0IjoiMjAyNi0wOC0xMFQwMzowMDowMC4wMDBaIiwiaWQiOiJjbXN5bjAwMDBwYXkwMDAwMDAwMDAwMDAyIn0",
    "settled_until": "2026-11-07T05:09:30.000Z"
  }
}
```

### Pembayaran dibatalkan (REVERSAL)

```json
{
  "payment_id": "cmsyn0000pay0000000000005",
  "status": "CANCELLED",
  "amount": "350000.00",
  "refunded_amount": "0.00",
  "net_amount": "0.00",
  "paid_at": "2026-08-31T23:59:00+08:00",
  "allocations": [
    { "allocation_id": "cmsyn0000pay0000000000005:2026-08", "year": 2026, "month": 8, "academic_year": "2026/2027", "amount": "350000.00" }
  ],
  "adjustments": [
    {
      "adjustment_id": "rev_cmsyn0000pay0000000000005",
      "type": "REVERSAL",
      "payment_id": "cmsyn0000pay0000000000005",
      "student_id": "cmsyn0000sis0000000000002",
      "amount": "350000.00",
      "occurred_at": "2026-09-01T01:12:45.310Z",
      "occurred_on": "2026-09-01",
      "document_number": null,
      "reason": "Salah input siswa (sintetis)",
      "status": "ACTIVE",
      "source": "CANCEL_REQUEST",
      "cancel_request_id": "cmsyn0000crq0000000000001"
    }
  ],
  "updated_at": "2026-09-01T01:12:45.311Z"
}
```

(Field lain sama seperti contoh sebelumnya; dipersingkat.)

### `GET /refunds` — refund yang dibatalkan (tombstone)

```json
{
  "data": [
    {
      "adjustment_id": "cmsyn0000rfd0000000000002",
      "type": "REFUND",
      "payment_id": "cmsyn0000pay0000000000004",
      "student_id": "cmsyn0000sis0000000000002",
      "amount": "100000.00",
      "occurred_on": "2026-09-02",
      "document_number": "RF-SYN-01",
      "reason": "Kelebihan bayar (sintetis)",
      "status": "VOIDED",
      "voided_at": "2026-09-03T06:40:00.000Z",
      "created_at": "2026-09-02T04:00:00.000Z",
      "updated_at": "2026-09-03T06:40:00.000Z",
      "school_id": "99990001",
      "student": { "student_id": "cmsyn0000sis0000000000002", "nis": "900002", "name": "Siswa Sintetis B" },
      "currency": "IDR"
    }
  ],
  "pagination": { "limit": 200, "has_more": false, "next_cursor": "eyJ2IjoxLCJ0Ijo...", "settled_until": "2026-11-07T05:09:30.000Z" }
}
```

### `GET /summary?from=2026-08-01&to=2026-08-31`

```json
{
  "school_id": "99990001",
  "currency": "IDR",
  "period": { "from": "2026-08-01", "to": "2026-08-31", "basis": "payment_date", "timezone": "Asia/Makassar" },
  "gross_receipts": "1400000.00",
  "refunds": "50000.00",
  "net_receipts": "1350000.00",
  "admin_fees": "2500.00",
  "cancelled_amount": "350000.00",
  "counts": { "payments": 5, "cash_payments": 4, "cancelled_payments": 1, "refunds": 1 },
  "generated_at": "2026-11-07T05:10:00.000Z"
}
```

Dengan `group_by=month` (atau `day`), ditambahkan
`"group_by": "month", "groups": [{ "key": "2026-08", "gross_receipts": "...", "refunds": "...", ... }]`.

Definisi:
- `gross_receipts` = Σ `amount` pembayaran `PAID` dengan `paid_date` dalam periode.
- `refunds` = Σ refund `ACTIVE` dengan tanggal refund dalam periode, termasuk refund atas pembayaran
  periode sebelumnya.
- `net_receipts` = `gross_receipts − refunds`.
- `admin_fees` dihitung terpisah dan tidak termasuk dalam gross.
- `cancelled_amount` hanya informasi; tidak dihitung dalam gross maupun net.
- `counts.payments` mencakup baris bernominal 0; `counts.cash_payments` hanya yang `amount > 0`.
- Batas tanggal mengikuti WITA: pembayaran `2026-08-31T23:59+08:00` masuk Agustus.

Catatan: laporan "Pemasukan" di dashboard SPP mengelompokkan menurut **bulan iuran**, sedangkan
`/summary` mengelompokkan menurut **tanggal pembayaran**. Angkanya bisa berbeda untuk periode yang
sama. Untuk rekap per bulan iuran, jumlahkan `allocations` dari feed `/payments`.

---

## 6. Error

```json
{ "error": { "code": "SCHOOL_FORBIDDEN", "message": "Token ini tidak memiliki akses ke sekolah ini." } }
```

| HTTP | `code` | Kapan |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Parameter salah (detail di `error.details.fields`) |
| 400 | `INVALID_CURSOR` | Cursor rusak |
| 401 | `UNAUTHORIZED` | Token tidak ada, salah format, salah, atau dicabut |
| 403 | `SCHOOL_FORBIDDEN` | Token untuk sekolah lain, atau `school_id` tidak cocok |
| 429 | `RATE_LIMITED` | Batas terlampaui; tunggu `Retry-After` detik |
| 503 | `NOT_CONFIGURED` | ID sekolah belum diatur di server |
| 500 | `INTERNAL_ERROR` | Kesalahan server; ulangi dengan backoff |

---

## 7. Perbedaan struktur & data yang belum tersedia

Hal-hal berikut perlu diputuskan saat memetakan data ke aplikasi bendahara:

1. **Satu transaksi = satu bulan.** Model SPP menyimpan satu baris `Pembayaran` per siswa per bulan,
   dan setiap baris BPD punya No. Bukti sendiri. Karena itu `allocations` saat ini **selalu berisi
   1 elemen**. Pembayaran beberapa bulan sekaligus muncul sebagai beberapa `payment` dengan `paid_at`
   yang sama atau berdekatan. Tidak ada ID "kunjungan bayar" yang menyatukannya. Format `allocations`
   sudah siap jika kelak satu transaksi mencakup banyak bulan.
2. **Hanya satu jenis dana.** Aplikasi SPP hanya mencatat *Sumbangan Komite (SPP)*. Tidak ada dana
   lain (seragam, kegiatan, dll.). `fund.code` selalu `SUMBANGAN_KOMITE`.
3. **Pelunasan sekaligus (tabel `Pelunasan`) tidak dikirim.** Ada 6 catatan:
   - 4 di antaranya (masing-masing Rp 12.600.000, 36 bulan) **sudah** tercermin sebagai 36 baris
     `Pembayaran` MANUAL per siswa, sehingga sudah masuk feed. Tanggal bayarnya 2026-04-16, yaitu
     tanggal input dari arsip PDF, bukan tanggal bayar asli.
   - **2 catatan (Rp 8.400.000 untuk 2021-08 s/d 2024-06 dan Rp 10.325.000 untuk 2020-07 s/d 2023-06)
     tidak punya baris `Pembayaran`.** Di matriks SPP kedua siswa ini tampil LUNAS, tetapi uangnya
     tidak muncul di feed API. Rinciannya per bulan juga tidak tersimpan (hanya total dan rentang).
     **Perlu keputusan:** dibuatkan baris pembayaran per bulan di SPP, atau dicatat manual di aplikasi
     bendahara.
4. **Keringanan (pembebasan tagihan)** tidak dikirim sebagai data tersendiri. Sebagian keringanan
   tercatat sebagai pembayaran bernominal 0 (`is_cash_receipt: false`, 83 baris). Data keringanan
   lengkap (181 baris, tabel `Keringanan`) belum diekspos. Jika matriks bendahara perlu membedakan
   "dibebaskan" dari "belum bayar", endpoint ini bisa ditambahkan.
5. **Riwayat koreksi belum tersimpan.** Koreksi (impor ulang BPD mode "replace", ubah catatan/kode
   cabang) menimpa baris di tempat. API mengirim **nilai terbaru** dengan `payment_id` yang sama dan
   `updated_at` baru, tetapi nilai sebelum koreksi tidak tersedia. Tidak ada adjustment bertipe
   `CORRECTION`. Jika diperlukan, tabel revisi pembayaran harus ditambahkan.
6. **Pembatalan dibatalkan lagi.** Jika baris `CANCELLED` kemudian ditimpa impor BPD menjadi `PAID`,
   adjustment `REVERSAL` hilang dari pembayaran tersebut (status menjadi `PAID` lagi). Riwayat
   pembatalan ini tidak disimpan.
7. **Biaya administrasi** sudah tersedia sebagai field, tetapi seluruh data produksi saat ini bernilai
   0. File BPD yang diimpor tidak memuat biaya admin.
8. **Jam pembayaran.** Sekitar 18 ribu baris (impor lama/manual) hanya punya tanggal
   (`paid_time_known: false`). Jam dari BPD diasumsikan WITA.
9. **Kanal pembayaran** hanya `BPD` atau `MANUAL`, ditambah kode mentah BPD (`TLR`, `EB`, `GAPURA`,
   `UEL`, nomor cabang). Belum ada pemetaan resmi kode BPD ke nama kanal (teller/e-banking/agen/uang
   elektronik).
10. **Kelas/rombel** diambil dari pendaftaran siswa pada tahun ajaran bulan iuran. Data rombel
    tahun ajaran 2019/2020–2022/2023 hampir tidak ada di SPP, sehingga **45.260 dari 100.468
    pembayaran** (hampir semuanya bulan iuran Juli 2019 – Juni 2023) bernilai `enrollment: null`.
    Mulai TA 2023/2024 hanya 119 pembayaran yang tidak punya rombel. Bendahara bisa memakai rombel
    terakhir yang diketahui, atau data kelas historis perlu dilengkapi di SPP.
11. **Refund** belum pernah dipakai di produksi (0 baris), begitu juga pembatalan (0 baris).
    Mulai versi ini, refund yang dihapus di aplikasi SPP disimpan sebagai tombstone (soft delete),
    tidak lagi dihapus permanen.
12. **Restore backup** SPP menyisipkan baris dengan `updated_at` lama. Setelah restore, aplikasi
    bendahara perlu melakukan sinkronisasi ulang penuh.

---

## 8. Pengujian

`tests/integration/integrasi-bendahara.test.ts` (20 test, Postgres sungguhan, data sintetis):

```sh
DATABASE_URL=postgresql://...db-sekali-pakai... npm run test:integration   # MENGHAPUS isi DB tsb
```

Skenario yang dicakup:
- akses: tanpa token / token salah / token dicabut → 401, token sekolah lain dan `school_id` tidak
  cocok → 403, batas per token → 429 + `Retry-After`, batas kegagalan per IP → 429
- pengambilan awal seluruh riwayat dengan pagination
- pembayaran beberapa bulan sekaligus; jumlah alokasi = nominal; `allocation_id` unik
- biaya admin terpisah; baris bernominal 0
- sinkronisasi ulang tanpa perubahan (0 data, cursor tetap); impor ulang penuh tanpa duplikasi
- refund sebagian; pembatalan (REVERSAL); penghapusan refund (tombstone VOIDED, baris tetap ada)
- koreksi transaksi lama (tahun ajaran sebelumnya) terkirim ulang dengan ID sama
- perubahan di tengah pagination tidak menyebabkan transaksi terlewat
- jeda pengendapan; validasi `updated_since` / `cursor` / `limit`
- ringkasan: gross/refund/net/jumlah, batas hari WITA, `group_by=month`

Hasil 2026-11-07: **20/20 lulus**. Typecheck dan lint bersih, dan 75 unit test lama tetap lulus.
Migrasi juga diuji pada salinan skema produksi; tidak ada drift baru.

Uji ujung-ke-ujung (build produksi `next start` + salinan sementara DB produksi, dihapus setelah uji):

| Pemeriksaan | Hasil |
|---|---|
| Tanpa token / token sekolah lain | 401 / 403 |
| API internal `/api/v1/*` tanpa sesi | tetap 401 |
| Sinkronisasi penuh `/payments?limit=1000` | 100.468 pembayaran, 101 halaman, ±11 detik, maks. 242 ms/halaman |
| Jumlah & total PAID vs. query DB langsung | sama persis (100.468; Rp 30.282.283.298,00) |
| Σ alokasi = nominal; format nominal & waktu | 0 selisih; 0 format salah |
| Sinkronisasi inkremental setelah sinkronisasi penuh | 0 baris |
| `/summary` Okt 2026 dan TA 2025/2026 vs. DB | sama persis (483 / Rp 169.050.000; 14.565 / Rp 5.072.008.298), ±36 ms |
