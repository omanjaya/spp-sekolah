-- Performance indexes for scale. Safe to re-run (IF NOT EXISTS).

-- Trigram search for siswa.nama (ILIKE/contains queries)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Siswa_nama_trgm_idx"
  ON "Siswa" USING gin (nama gin_trgm_ops);

-- Pembayaran: default list order is (tanggalTransaksi desc) with status filter.
CREATE INDEX IF NOT EXISTS "Pembayaran_status_tanggal_idx"
  ON "Pembayaran" ("statusBayar", "tanggalTransaksi" DESC);

-- Partial index for the hot path: active payments only.
CREATE INDEX IF NOT EXISTS "Pembayaran_terbayar_tanggal_idx"
  ON "Pembayaran" ("tanggalTransaksi" DESC)
  WHERE "statusBayar" = 'TERBAYAR';

-- NIS prefix search (startsWith) benefits from text_pattern_ops.
CREATE INDEX IF NOT EXISTS "Siswa_nis_prefix_idx"
  ON "Siswa" (nis text_pattern_ops);

-- Pelunasan period range lookups (matrix build).
CREATE INDEX IF NOT EXISTS "Pelunasan_siswa_periode_idx"
  ON "Pelunasan" ("siswaId", "periodeMulai", "periodeAkhir");
