/**
 * Backup Service — ekspor semua data ke JSON.
 *
 * Catatan keamanan:
 *  - passwordHash TIDAK disertakan (user harus reset password setelah restore).
 *  - File JSON di-gzip sebelum dikirim ke client.
 *
 * Strategi baca:
 *  - Tabel besar (Pembayaran, TagihanBpdMaster) dibaca per-batch 5.000 rows
 *    untuk menghindari OOM.
 *  - Tabel kecil dibaca sekaligus.
 */

import { prisma } from '@/lib/db'
import logger from '@/lib/logger'

export const BACKUP_VERSION = '1.0'

// ─── Tipe manifest ──────────────────────────────────────────────────────────

export interface BackupManifest {
  version:     string
  exportedAt:  string
  rowCounts:   Record<string, number>
  sizeHint:    string  // perkiraan ukuran sebelum kompresi
}

export interface BackupResult {
  manifest: BackupManifest
  /** Jumlah total baris di semua tabel */
  totalRows: number
  /** Iteratable generator — hasilkan chunk JSON string untuk streaming */
  stream: AsyncGenerator<string, void, unknown>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Baca semua baris tabel besar via batch cursor. */
async function* batchRead<T extends { id: string }>(
  fetcher: (skip: number, take: number) => Promise<T[]>,
  batchSize = 5_000,
): AsyncGenerator<T[], void, unknown> {
  let skip = 0
  while (true) {
    const rows = await fetcher(skip, batchSize)
    if (rows.length === 0) break
    yield rows
    if (rows.length < batchSize) break
    skip += batchSize
  }
}

/** Serialisasi Decimal/Date ke primitive sebelum JSON.stringify. */
function serialize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(serialize)
  if (obj instanceof Date) return obj.toISOString()
  if (typeof obj === 'object' && 'toNumber' in (obj as object)) {
    return (obj as { toNumber: () => number }).toNumber()
  }
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = serialize(v)
    }
    return out
  }
  return obj
}

// ─── Stream JSON generator ──────────────────────────────────────────────────

/**
 * Menghasilkan backup JSON sebagai stream string chunk.
 * Format: `{ "manifest": {...}, "tables": { "users": [...], ... } }`
 *
 * Setiap tabel ditulis sebagai array JSON in-line agar bisa di-stream
 * tanpa buffering semua data sekaligus di memori.
 */
async function* generateJsonStream(
  rowCounts: Record<string, number>,
): AsyncGenerator<string, void, unknown> {
  const exportedAt = new Date().toISOString()
  const totalRows   = Object.values(rowCounts).reduce((a, b) => a + b, 0)
  const sizeHint    = `~${Math.round(totalRows * 350 / 1_024 / 1_024)}MB uncompressed`

  const manifest: BackupManifest = {
    version:    BACKUP_VERSION,
    exportedAt,
    rowCounts,
    sizeHint,
  }

  yield `{"manifest":${JSON.stringify(manifest)},"tables":{\n`

  const tables: Array<{ key: string; fn: () => Promise<unknown[]> | AsyncGenerator<unknown[], void, unknown> }> = [
    // ── Kecil — baca sekaligus ─────────────────────────────────────────
    {
      key: 'users',
      fn: () => prisma.user.findMany({
        select: {
          id: true, email: true, nama: true, role: true,
          isActive: true, lastLoginAt: true, createdAt: true, updatedAt: true,
          // passwordHash TIDAK disertakan
        },
        orderBy: { createdAt: 'asc' },
      }),
    },
    {
      key: 'settings',
      fn: () => prisma.setting.findMany({ orderBy: { key: 'asc' } }),
    },
    {
      key: 'tahunAjaran',
      fn: () => prisma.tahunAjaran.findMany({ orderBy: { tahunMulai: 'asc' } }),
    },
    {
      key: 'rombel',
      fn: () => prisma.rombel.findMany({ orderBy: [{ tahunAjaranId: 'asc' }, { grade: 'asc' }, { nomor: 'asc' }] }),
    },
    {
      key: 'siswa',
      fn: () => prisma.siswa.findMany({ orderBy: { nis: 'asc' } }),
    },
    {
      key: 'enrollment',
      fn: () => prisma.enrollment.findMany({ orderBy: { createdAt: 'asc' } }),
    },
    {
      key: 'keringanan',
      fn: () => prisma.keringanan.findMany({ orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }] }),
    },
    {
      key: 'pelunasan',
      fn: () => prisma.pelunasan.findMany({ orderBy: { tanggalLunas: 'asc' } }),
    },
    {
      key: 'kwitansi',
      fn: () => prisma.kwitansi.findMany({ orderBy: { createdAt: 'asc' } }),
    },
    {
      key: 'kwitansiItems',
      fn: () => prisma.kwitansiItem.findMany({ orderBy: { createdAt: 'asc' } }),
    },
    {
      key: 'importBatches',
      fn: () => prisma.importBatch.findMany({ orderBy: { uploadedAt: 'asc' } }),
    },
    {
      key: 'tagihanBpdImportBatch',
      fn: () => prisma.tagihanBpdImportBatch.findMany({ orderBy: { importedAt: 'asc' } }),
    },
    {
      key: 'auditLog',
      fn: () => prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } }),
    },
  ]

  // Tabel besar — stream per batch
  const largeTables: Array<{ key: string }> = [
    { key: 'pembayaran' },
    { key: 'tagihanBpdMaster' },
  ]

  let isFirst = true

  // ── Tabel kecil ────────────────────────────────────────────────────────
  for (const { key, fn } of tables) {
    const rows = await fn()
    const arr = Array.isArray(rows) ? rows : []
    const serialized = serialize(arr)
    if (!isFirst) yield ',\n'
    yield `"${key}":${JSON.stringify(serialized)}`
    isFirst = false
  }

  // ── Tabel besar: Pembayaran ─────────────────────────────────────────
  {
    if (!isFirst) yield ',\n'
    yield `"pembayaran":[`
    let firstRow = true
    for await (const batch of batchRead(
      (skip, take) => prisma.pembayaran.findMany({
        skip, take,
        orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
      }),
    )) {
      for (const row of batch) {
        if (!firstRow) yield ','
        yield JSON.stringify(serialize(row))
        firstRow = false
      }
    }
    yield `]`
    isFirst = false
  }

  // ── Tabel besar: TagihanBpdMaster ──────────────────────────────────
  {
    yield ',\n'
    yield `"tagihanBpdMaster":[`
    let firstRow = true
    for await (const batch of batchRead(
      (skip, take) => prisma.tagihanBpdMaster.findMany({
        skip, take,
        orderBy: [{ tahun: 'asc' }, { bulan: 'asc' }],
      }),
    )) {
      for (const row of batch) {
        if (!firstRow) yield ','
        yield JSON.stringify(serialize(row))
        firstRow = false
      }
    }
    yield `]`
  }

  yield '\n}}'
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Hitung row count semua tabel (untuk manifest). */
export async function getRowCounts(): Promise<Record<string, number>> {
  const [
    users, settings, tahunAjaran, rombel, siswa, enrollment,
    keringanan, pelunasan, kwitansi, kwitansiItems,
    importBatches, tagihanBpdImportBatch, auditLog,
    pembayaran, tagihanBpdMaster,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.setting.count(),
    prisma.tahunAjaran.count(),
    prisma.rombel.count(),
    prisma.siswa.count(),
    prisma.enrollment.count(),
    prisma.keringanan.count(),
    prisma.pelunasan.count(),
    prisma.kwitansi.count(),
    prisma.kwitansiItem.count(),
    prisma.importBatch.count(),
    prisma.tagihanBpdImportBatch.count(),
    prisma.auditLog.count(),
    prisma.pembayaran.count(),
    prisma.tagihanBpdMaster.count(),
  ])

  return {
    users, settings, tahunAjaran, rombel, siswa, enrollment,
    keringanan, pelunasan, kwitansi, kwitansiItems,
    importBatches, tagihanBpdImportBatch, auditLog,
    pembayaran, tagihanBpdMaster,
  }
}

/**
 * Mulai proses backup.
 * Mengembalikan manifest + async generator JSON string chunks.
 */
export async function startBackup(): Promise<{
  manifest: BackupManifest
  jsonStream: AsyncGenerator<string, void, unknown>
}> {
  const t0 = Date.now()
  logger.info('backup: starting full data export')

  const rowCounts = await getRowCounts()
  const totalRows = Object.values(rowCounts).reduce((a, b) => a + b, 0)
  logger.info({ rowCounts, totalRows }, 'backup: row counts collected')

  const manifest: BackupManifest = {
    version:   BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    rowCounts,
    sizeHint:  `~${Math.round(totalRows * 350 / 1_024 / 1_024)}MB uncompressed`,
  }

  const jsonStream = generateJsonStream(rowCounts)

  logger.info({ ms: Date.now() - t0 }, 'backup: stream started')

  return { manifest, jsonStream }
}
