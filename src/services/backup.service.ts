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

import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import bcrypt from 'bcryptjs'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import logger from '@/lib/logger'

export const BACKUP_VERSION = '1.0'
const gunzipAsync = promisify(gunzip)

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

/**
 * Baca semua baris tabel besar via cursor-based pagination.
 *
 * Menghindari OFFSET N scan yang mahal di Postgres — alih-alih skip N rows,
 * kita minta rows setelah cursor (id) terakhir dari batch sebelumnya.
 * orderBy HARUS by `id` (PK) agar cursor konsisten.
 */
async function* batchRead<T extends { id: string }>(
  fetcher: (cursor: string | undefined, take: number) => Promise<T[]>,
  batchSize = 5_000,
): AsyncGenerator<T[], void, unknown> {
  let cursor: string | undefined = undefined
  while (true) {
    const rows = await fetcher(cursor, batchSize)
    if (rows.length === 0) break
    yield rows
    cursor = rows[rows.length - 1]!.id
    if (rows.length < batchSize) break
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
    {
      key: 'periodeLock',
      fn: () => prisma.periodeLock.findMany({ orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }] }),
    },
    {
      key: 'refund',
      fn: () => prisma.refund.findMany({ orderBy: { createdAt: 'asc' } }),
    },
    {
      key: 'cancelRequests',
      fn: () => prisma.pembayaranCancelRequest.findMany({ orderBy: { createdAt: 'asc' } }),
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
      (cursor, take) => prisma.pembayaran.findMany({
        take,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        orderBy: { id: 'asc' },
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
      (cursor, take) => prisma.tagihanBpdMaster.findMany({
        take,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        orderBy: { id: 'asc' },
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
    periodeLock, refund, cancelRequests,
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
    prisma.periodeLock.count(),
    prisma.refund.count(),
    prisma.pembayaranCancelRequest.count(),
  ])

  return {
    users, settings, tahunAjaran, rombel, siswa, enrollment,
    keringanan, pelunasan, kwitansi, kwitansiItems,
    importBatches, tagihanBpdImportBatch, auditLog,
    pembayaran, tagihanBpdMaster,
    periodeLock, refund, cancelRequests,
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

// ─── Restore ────────────────────────────────────────────────────────────────

export interface RestoreProgressEvent {
  type:    'progress'
  table:   string
  total:   number
  inserted: number
  skipped: number
}

export interface RestoreDoneEvent {
  type:    'done'
  summary: Record<string, { inserted: number; skipped: number }>
  ms:      number
}

export interface RestoreErrorEvent {
  type:    'error'
  message: string
}

export type RestoreEvent = RestoreProgressEvent | RestoreDoneEvent | RestoreErrorEvent

// NOTE: setelah restore, semua user non-existing di-create dengan passwordHash
// random (tidak diketahui siapapun) dan isActive=false. Admin harus
// mengaktifkan dan me-reset password lewat flow terpisah sebelum user bisa login.
// Tidak ada shared default password.
import { randomBytes } from 'node:crypto'
function randomSecret(): string {
  return randomBytes(32).toString('hex')
}

/** Chunk tabel besar saat insert. */
const INSERT_BATCH = 1_000

type Row = Record<string, unknown>

/**
 * Restore data dari buffer .json.gz.
 * Yields `RestoreEvent` sebagai SSE-style events.
 *
 * Urutan insert mengikuti dependency FK:
 *   settings → users → tahunAjaran → rombel → siswa → enrollment
 *   → importBatches → tagihanBpdImportBatch → keringanan
 *   → pembayaran → pelunasan → kwitansi → kwitansiItems
 *   → tagihanBpdMaster → auditLog
 */
export async function* restoreBackup(
  gzipBuffer: Buffer,
): AsyncGenerator<RestoreEvent, void, unknown> {
  const t0 = Date.now()

  // 1. Dekompresi + parse JSON
  let parsed: Record<string, unknown>
  try {
    const jsonBuffer = await gunzipAsync(gzipBuffer)
    parsed = JSON.parse(jsonBuffer.toString('utf8')) as Record<string, unknown>
  } catch {
    yield { type: 'error', message: 'File tidak valid atau korup.' }
    return
  }

  const tables = parsed['tables'] as Record<string, Row[]> | undefined
  if (!tables) {
    yield { type: 'error', message: 'Format backup tidak dikenali (missing "tables").' }
    return
  }

  const summary: Record<string, { inserted: number; skipped: number }> = {}

  // ── Pre-filter semua tabel: reject row dengan ID yang tidak valid ──
  // Kecuali `settings` (PK-nya `key`, bukan `id`).
  const ID_RE_PRE = /^[a-z0-9]{10,40}$/
  function validId(v: unknown): boolean {
    return typeof v === 'string' && ID_RE_PRE.test(v)
  }
  for (const key of Object.keys(tables)) {
    if (key === 'settings') continue
    const rows = tables[key] as Row[]
    if (!Array.isArray(rows)) continue
    const before = rows.length
    tables[key] = rows.filter((r) => validId(r['id']))
    const rejected = before - tables[key].length
    if (rejected > 0) {
      logger.warn({ table: key, rejected }, 'restore: rejected rows with invalid id')
    }
  }
  // Khusus auditLog — drop baris yang userId-nya bukan CUID valid atau tidak
  // ada di tabel users (cegah pollution audit trail).
  {
    const userRows = (tables['users'] ?? []) as Row[]
    const validUserIds = new Set(userRows.map((u) => u['id']).filter((x): x is string => typeof x === 'string'))
    const audits = (tables['auditLog'] ?? []) as Row[]
    const filtered = audits.filter((r) => {
      const uid = r['userId']
      return validId(uid) && validUserIds.has(uid as string)
    })
    if (filtered.length !== audits.length) {
      logger.warn(
        { table: 'auditLog', rejected: audits.length - filtered.length },
        'restore: rejected auditLog rows with unknown userId',
      )
    }
    tables['auditLog'] = filtered
  }

  // Helper: coerce date strings back to Date
  function toDate(v: unknown): Date | null {
    if (!v) return null
    if (v instanceof Date) return v
    const d = new Date(v as string)
    return isNaN(d.getTime()) ? null : d
  }

  function s(v: unknown): string      { return (v as string)  ?? '' }
  function n(v: unknown): number      { const x = Number(v); return isNaN(x) ? 0 : x }
  function b(v: unknown): boolean     { return Boolean(v) }
  function opt(v: unknown): string | null { return v != null ? (v as string) : null }


  /** Ambil set existing IDs (untuk kolom `id`) */
  async function existIds(
    findMany: (args: object) => Promise<{ id: string }[]>,
  ): Promise<Set<string>> {
    const rows = await findMany({ select: { id: true } })
    return new Set(rows.map((r) => r.id))
  }

  /** Insert rows in batches, skip duplicates manually via existSet */
  async function insertBatched(
    rows: Row[],
    getKey: (r: Row) => string,
    existSet: Set<string>,
    createMany: (batch: Row[]) => Promise<{ count: number }>,
  ): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0
    let skipped  = 0
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch    = rows.slice(i, i + INSERT_BATCH)
      const newRows  = batch.filter((r) => !existSet.has(getKey(r)))
      skipped       += batch.length - newRows.length
      if (newRows.length > 0) {
        const res  = await createMany(newRows)
        inserted  += res.count
      }
    }
    return { inserted, skipped }
  }

  // Helper: emit progress
  async function doTable(
    table: string,
    rows: Row[],
    getKey: (r: Row) => string,
    existSet: Set<string>,
    createMany: (batch: Row[]) => Promise<{ count: number }>,
  ): Promise<RestoreProgressEvent> {
    const { inserted, skipped } = await insertBatched(rows, getKey, existSet, createMany)
    summary[table] = { inserted, skipped }
    return { type: 'progress', table, total: rows.length, inserted, skipped }
  }

  // ── 1. settings ── (PK = key, not id)
  {
    const rows = (tables['settings'] ?? []) as Row[]
    const existing = await prisma.setting.findMany({ select: { key: true } })
    const existSet = new Set(existing.map((r) => r.key))
    let inserted = 0
    let skipped  = 0
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch   = rows.slice(i, i + INSERT_BATCH)
      const newRows = batch.filter((r) => !existSet.has(r['key'] as string))
      skipped      += batch.length - newRows.length
      if (newRows.length > 0) {
        const res = await prisma.setting.createMany({
          data: newRows.map((r) => ({
            key:         s(r['key']),
            value:       r['value'] as object,
            description: opt(r['description']),
            updatedAt:   toDate(r['updatedAt']) ?? new Date(),
          })),
          skipDuplicates: true,
        })
        inserted += res.count
      }
    }
    summary['settings'] = { inserted, skipped }
    yield { type: 'progress', table: 'settings', total: rows.length, inserted, skipped }
  }

  // ── 2. users
  {
    const rows    = (tables['users'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.user.findMany(a as Parameters<typeof prisma.user.findMany>[0]))
    yield await doTable('users', rows, (r) => s(r['id']), existSet,
      async (batch) => {
        const data = await Promise.all(
          batch.map(async (r) => ({
            id:           s(r['id']),
            email:        s(r['email']),
            nama:         s(r['nama']),
            role:         (s(r['role']) || 'VIEWER') as 'SUPER_ADMIN' | 'BENDAHARA' | 'TU' | 'VIEWER',
            // Force inactive — admin harus aktifkan + reset password manual.
            isActive:     false,
            // Hash random unik per user — tidak bisa login sampai di-reset.
            passwordHash: await bcrypt.hash(randomSecret(), 10),
            lastLoginAt:  toDate(r['lastLoginAt']),
            createdAt:    toDate(r['createdAt']) ?? new Date(),
            updatedAt:    toDate(r['updatedAt']) ?? new Date(),
          })),
        )
        return prisma.user.createMany({ data, skipDuplicates: true })
      },
    )
  }

  // ── 2b. periodeLock (depends on User FK)
  {
    const rows     = (tables['periodeLock'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.periodeLock.findMany(a as Parameters<typeof prisma.periodeLock.findMany>[0]))
    yield await doTable('periodeLock', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.periodeLock.createMany({
        data: batch.map((r) => ({
          id:          s(r['id']),
          periodYear:  n(r['periodYear']),
          periodMonth: n(r['periodMonth']),
          lockedAt:    toDate(r['lockedAt']) ?? new Date(),
          lockedById:  s(r['lockedById']),
          catatan:     opt(r['catatan']),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 3. tahunAjaran
  {
    const rows     = (tables['tahunAjaran'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.tahunAjaran.findMany(a as Parameters<typeof prisma.tahunAjaran.findMany>[0]))
    yield await doTable('tahunAjaran', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.tahunAjaran.createMany({
        data: batch.map((r) => ({
          id:                s(r['id']),
          kode:              s(r['kode']),
          tahunMulai:        n(r['tahunMulai']),
          tahunAkhir:        n(r['tahunAkhir']),
          tanggalMulai:      toDate(r['tanggalMulai']) ?? new Date(),
          tanggalAkhir:      toDate(r['tanggalAkhir']) ?? new Date(),
          isActive:          b(r['isActive']),
          nominalSppDefault: n(r['nominalSppDefault']),
          createdAt:         toDate(r['createdAt']) ?? new Date(),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 4. rombel
  {
    const rows     = (tables['rombel'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.rombel.findMany(a as Parameters<typeof prisma.rombel.findMany>[0]))
    yield await doTable('rombel', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.rombel.createMany({
        data: batch.map((r) => ({
          id:            s(r['id']),
          tahunAjaranId: s(r['tahunAjaranId']),
          grade:         s(r['grade']) as 'X' | 'XI' | 'XII',
          nomor:         n(r['nomor']),
          kode:          s(r['kode']),
          waliKelas:     opt(r['waliKelas']),
          createdAt:     toDate(r['createdAt']) ?? new Date(),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 5. siswa
  {
    const rows     = (tables['siswa'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.siswa.findMany(a as Parameters<typeof prisma.siswa.findMany>[0]))
    yield await doTable('siswa', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.siswa.createMany({
        data: batch.map((r) => ({
          id:           s(r['id']),
          nis:          s(r['nis']),
          nama:         s(r['nama']),
          jenisKelamin: (['L','P'].includes(s(r['jenisKelamin'])) ? s(r['jenisKelamin']) : null) as 'L' | 'P' | null,
          angkatan:     n(r['angkatan']),
          statusSiswa:  (s(r['statusSiswa']) || 'AKTIF') as 'AKTIF' | 'PINDAH' | 'LULUS' | 'DO' | 'CUTI',
          alamat:       opt(r['alamat']),
          kontakOrtu:   opt(r['kontakOrtu']),
          catatan:      opt(r['catatan']),
          createdAt:    toDate(r['createdAt']) ?? new Date(),
          updatedAt:    toDate(r['updatedAt']) ?? new Date(),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 6. enrollment
  {
    const rows     = (tables['enrollment'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.enrollment.findMany(a as Parameters<typeof prisma.enrollment.findMany>[0]))
    yield await doTable('enrollment', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.enrollment.createMany({
        data: batch.map((r) => ({
          id:            s(r['id']),
          siswaId:       s(r['siswaId']),
          rombelId:      s(r['rombelId']),
          tahunAjaranId: s(r['tahunAjaranId']),
          noAbsen:       r['noAbsen'] != null ? n(r['noAbsen']) : null,
          createdAt:     toDate(r['createdAt']) ?? new Date(),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 7. importBatches
  {
    const rows     = (tables['importBatches'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.importBatch.findMany(a as Parameters<typeof prisma.importBatch.findMany>[0]))
    yield await doTable('importBatches', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.importBatch.createMany({
        data: batch.map((r) => ({
          id:             s(r['id']),
          fileName:       s(r['fileName']),
          fileSize:       n(r['fileSize']),
          fileHash:       s(r['fileHash']),
          uploadedAt:     toDate(r['uploadedAt']) ?? new Date(),
          uploadedBy:     s(r['uploadedBy']),
          totalRows:      n(r['totalRows']),
          successCount:   n(r['successCount']),
          duplicateCount: n(r['duplicateCount']),
          errorCount:     n(r['errorCount']),
          errorDetails:   r['errorDetails'] != null ? (r['errorDetails'] as Prisma.InputJsonValue) : Prisma.JsonNull,
          status:         (s(r['status']) || 'COMPLETED') as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL',
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 8. tagihanBpdImportBatch
  {
    const rows     = (tables['tagihanBpdImportBatch'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.tagihanBpdImportBatch.findMany(a as Parameters<typeof prisma.tagihanBpdImportBatch.findMany>[0]))
    yield await doTable('tagihanBpdImportBatch', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.tagihanBpdImportBatch.createMany({
        data: batch.map((r) => ({
          id:         s(r['id']),
          fileName:   s(r['fileName']),
          fileSize:   n(r['fileSize']),
          fileHash:   s(r['fileHash']),
          importedAt: toDate(r['importedAt']) ?? new Date(),
          importedBy: s(r['importedBy']),
          totalRows:  n(r['totalRows']),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 9. keringanan
  {
    const rows     = (tables['keringanan'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.keringanan.findMany(a as Parameters<typeof prisma.keringanan.findMany>[0]))
    yield await doTable('keringanan', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.keringanan.createMany({
        data: batch.map((r) => ({
          id:          s(r['id']),
          siswaId:     s(r['siswaId']),
          periodYear:  n(r['periodYear']),
          periodMonth: n(r['periodMonth']),
          jenis:       (['JUARA','OSN','JUARA_UMUM','BEASISWA','KELUARGA_TIDAK_MAMPU','PINDAHAN','LAINNYA'].includes(s(r['jenis'])) ? s(r['jenis']) : 'LAINNYA') as 'JUARA' | 'OSN' | 'JUARA_UMUM' | 'BEASISWA' | 'KELUARGA_TIDAK_MAMPU' | 'PINDAHAN' | 'LAINNYA',
          persentase:  n(r['persentase']),
          alasan:      opt(r['alasan']),
          buktiUrl:    opt(r['buktiUrl']),
          createdAt:   toDate(r['createdAt']) ?? new Date(),
          createdBy:   opt(r['createdBy']),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 10. pembayaran (large)
  {
    const rows     = (tables['pembayaran'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.pembayaran.findMany(a as Parameters<typeof prisma.pembayaran.findMany>[0]))
    yield await doTable('pembayaran', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.pembayaran.createMany({
        data: batch.map((r) => ({
          id:               s(r['id']),
          siswaId:          s(r['siswaId']),
          periodYear:       n(r['periodYear']),
          periodMonth:      n(r['periodMonth']),
          amount:           n(r['amount']),
          biayaAdm:         n(r['biayaAdm']),
          tanggalTransaksi: toDate(r['tanggalTransaksi']) ?? new Date(),
          noBukti:          opt(r['noBukti']),
          kodeCabang:       opt(r['kodeCabang']),
          tellerUser:       opt(r['tellerUser']),
          statusBayar:      (['TERBAYAR','DIBATALKAN'].includes(s(r['statusBayar'])) ? s(r['statusBayar']) : 'TERBAYAR') as 'TERBAYAR' | 'DIBATALKAN',
          source:           (['IMPORT_EXCEL','PASTE_SPREADSHEET','MANUAL'].includes(s(r['source'])) ? s(r['source']) : 'MANUAL') as 'IMPORT_EXCEL' | 'PASTE_SPREADSHEET' | 'MANUAL',
          importBatchId:    opt(r['importBatchId']),
          catatan:          opt(r['catatan']),
          createdAt:        toDate(r['createdAt']) ?? new Date(),
          updatedAt:        toDate(r['updatedAt']) ?? new Date(),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 10b. refund (depends on Siswa + Pembayaran)
  {
    const rows     = (tables['refund'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.refund.findMany(a as Parameters<typeof prisma.refund.findMany>[0]))
    yield await doTable('refund', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.refund.createMany({
        data: batch.map((r) => ({
          id:           s(r['id']),
          siswaId:      s(r['siswaId']),
          pembayaranId: opt(r['pembayaranId']),
          amount:       n(r['amount']),
          alasan:       s(r['alasan']),
          tanggal:      toDate(r['tanggal']) ?? new Date(),
          noBukti:      opt(r['noBukti']),
          createdById:  s(r['createdById']),
          createdAt:    toDate(r['createdAt']) ?? new Date(),
          updatedAt:    toDate(r['updatedAt']) ?? new Date(),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 10c. cancelRequests (depends on Pembayaran + User)
  {
    const rows     = (tables['cancelRequests'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.pembayaranCancelRequest.findMany(a as Parameters<typeof prisma.pembayaranCancelRequest.findMany>[0]))
    yield await doTable('cancelRequests', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.pembayaranCancelRequest.createMany({
        data: batch.map((r) => ({
          id:             s(r['id']),
          pembayaranId:   s(r['pembayaranId']),
          requestedById:  s(r['requestedById']),
          alasan:         s(r['alasan']),
          status:         (['PENDING','APPROVED','REJECTED'].includes(s(r['status'])) ? s(r['status']) : 'PENDING') as 'PENDING' | 'APPROVED' | 'REJECTED',
          reviewedById:   opt(r['reviewedById']),
          reviewedAt:     toDate(r['reviewedAt']),
          reviewNote:     opt(r['reviewNote']),
          createdAt:      toDate(r['createdAt']) ?? new Date(),
          updatedAt:      toDate(r['updatedAt']) ?? new Date(),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 11. pelunasan
  {
    const rows     = (tables['pelunasan'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.pelunasan.findMany(a as Parameters<typeof prisma.pelunasan.findMany>[0]))
    yield await doTable('pelunasan', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.pelunasan.createMany({
        data: batch.map((r) => ({
          id:            s(r['id']),
          siswaId:       s(r['siswaId']),
          periodeMulai:  s(r['periodeMulai']),
          periodeAkhir:  s(r['periodeAkhir']),
          tanggalLunas:  toDate(r['tanggalLunas']) ?? new Date(),
          nominalTotal:  n(r['nominalTotal']),
          noBukti:       opt(r['noBukti']),
          metodeLabel:   opt(r['metodeLabel']),
          catatan:       opt(r['catatan']),
          createdAt:     toDate(r['createdAt']) ?? new Date(),
          createdBy:     opt(r['createdBy']),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 12. kwitansi
  {
    const rows     = (tables['kwitansi'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.kwitansi.findMany(a as Parameters<typeof prisma.kwitansi.findMany>[0]))
    yield await doTable('kwitansi', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.kwitansi.createMany({
        data: batch.map((r) => ({
          id:            s(r['id']),
          nomorKwitansi: s(r['nomorKwitansi']),
          siswaId:       s(r['siswaId']),
          tanggal:       toDate(r['tanggal']) ?? new Date(),
          totalAmount:   n(r['totalAmount']),
          biayaAdm:      n(r['biayaAdm']),
          namaOrangTua:  opt(r['namaOrangTua']),
          catatan:       opt(r['catatan']),
          createdById:   s(r['createdById']),
          createdAt:     toDate(r['createdAt']) ?? new Date(),
          updatedAt:     toDate(r['updatedAt']) ?? new Date(),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 13. kwitansiItems
  {
    const rows     = (tables['kwitansiItems'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.kwitansiItem.findMany(a as Parameters<typeof prisma.kwitansiItem.findMany>[0]))
    yield await doTable('kwitansiItems', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.kwitansiItem.createMany({
        data: batch.map((r) => ({
          id:           s(r['id']),
          kwitansiId:   s(r['kwitansiId']),
          periodYear:   n(r['periodYear']),
          periodMonth:  n(r['periodMonth']),
          amount:       n(r['amount']),
          keterangan:   opt(r['keterangan']),
          pembayaranId: opt(r['pembayaranId']),
          createdAt:    toDate(r['createdAt']) ?? new Date(),
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 14. tagihanBpdMaster (large)
  {
    const rows     = (tables['tagihanBpdMaster'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.tagihanBpdMaster.findMany(a as Parameters<typeof prisma.tagihanBpdMaster.findMany>[0]))
    yield await doTable('tagihanBpdMaster', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.tagihanBpdMaster.createMany({
        data: batch.map((r) => ({
          id:            s(r['id']),
          importBatchId: s(r['importBatchId']),
          nis:           s(r['nis']),
          nama:          s(r['nama']),
          tahun:         n(r['tahun']),
          bulan:         n(r['bulan']),
          kelas:         s(r['kelas']),
          jurusan:       s(r['jurusan']),
          nominal:       n(r['nominal']),
          keterangan:    s(r['keterangan']) || '-',
          instansi:      s(r['instansi']) || 'SMAN_1_DENPASAR',
          alamat:        s(r['alamat']) || 'Jl Kamboja No 4',
        })),
        skipDuplicates: true,
      }),
    )
  }

  // ── 15. auditLog
  {
    const rows     = (tables['auditLog'] ?? []) as Row[]
    const existSet = await existIds((a) => prisma.auditLog.findMany(a as Parameters<typeof prisma.auditLog.findMany>[0]))
    yield await doTable('auditLog', rows, (r) => s(r['id']), existSet,
      (batch) => prisma.auditLog.createMany({
        data: batch.map((r) => ({
          id:        s(r['id']),
          userId:    s(r['userId']),
          action:    s(r['action']),
          entity:    opt(r['entity']),
          entityId:  opt(r['entityId']),
          metadata:  r['metadata'] != null ? (r['metadata'] as Prisma.InputJsonValue) : Prisma.JsonNull,
          ipAddress: opt(r['ipAddress']),
          userAgent: opt(r['userAgent']),
          createdAt: toDate(r['createdAt']) ?? new Date(),
        })),
        skipDuplicates: true,
      }),
    )
  }

  logger.info({ summary, ms: Date.now() - t0 }, 'restore: complete')
  yield { type: 'done', summary, ms: Date.now() - t0 }
}
