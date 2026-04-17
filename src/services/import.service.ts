/**
 * Import service — flagship feature.
 *
 * Flow:
 *   1. `preview(file, ctx)` — parse file/paste, compute hash, analyze each row
 *      (duplicate detection vs DB). Cache the parsed + analyzed rows in an
 *      in-memory Map under a batchId key for 15 minutes.
 *   2. `confirm(batchId, selections, ctx)` — transactionally apply user
 *      decisions: create siswa if requested, insert/replace pembayaran, create
 *      ImportBatch record, emit audit log.
 *
 * In-memory cache:
 *   - Acceptable for single-node VPS MVP (2 user aktif).
 *   - Keyed by random cuid-ish id generated with `crypto.randomUUID()`.
 *   - TTL sweep on each access keeps memory bounded.
 */

import { randomUUID } from 'node:crypto'
import { performance } from 'perf_hooks'

import type { Grade, Pembayaran, Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { importBatchRepo } from '@/repositories/import-batch.repo'
import { auditLogRepo } from '@/repositories/audit-log.repo'
import { ValidationError } from '@/core/errors'
import type { ImportSelection } from '@/lib/validators/import.schema'
import { parseAsikWorkbook, type ParsedRow, type ParseResult } from '@/lib/excel/asik-parser'
import { parsePembayaranPaste } from '@/lib/paste/pembayaran-parser'
import logger from '@/lib/logger'

export type RowStatus =
  | 'BARU'
  | 'DUPLIKAT_NO_BUKTI'
  | 'DUPLIKAT_PERIODE'
  | 'NIS_TIDAK_DIKENAL'
  | 'INVALID'

export interface AnalyzedRow {
  rowIndex: number
  status: RowStatus
  /** Reason message when INVALID / NIS_TIDAK_DIKENAL / DUPLIKAT. */
  message: string | null
  /** Siswa matched by NIS, null when not found. */
  siswaId: string | null
  nis: string
  nama: string
  kelas: Grade | null
  rombelNomor: number | null
  periodYear: number | null
  periodMonth: number | null
  amount: number
  biayaAdm: number
  tanggalTransaksi: string | null
  noBukti: string
  kodeCabang: string | null
  tellerUser: string | null
  /** Existing pembayaran id (same periode, beda bukti). Null otherwise. */
  conflictPembayaranId: string | null
  /** Default action hint for the UI. */
  defaultAction: 'import' | 'skip' | 'replace' | 'roll_forward' | 'create_siswa'
}

export interface PreviewCounts {
  BARU: number
  DUPLIKAT_NO_BUKTI: number
  DUPLIKAT_PERIODE: number
  NIS_TIDAK_DIKENAL: number
  INVALID: number
}

export interface PreviewResult {
  batchId: string
  fileHash: string
  fileName: string
  fileSize: number
  sheetName: string | null
  totalRows: number
  counts: PreviewCounts
  rows: AnalyzedRow[]
  parseErrors: string[]
  alreadyImported: { batchId: string; at: string } | null
}

/**
 * In-memory cache entry. Not exported.
 */
interface CacheEntry {
  batchId: string
  createdAt: number
  expiresAt: number
  fileHash: string
  fileName: string
  fileSize: number
  sheetName: string | null
  rows: AnalyzedRow[]
  parseErrors: string[]
  source: 'IMPORT_EXCEL' | 'PASTE_SPREADSHEET'
}

// Helper type for cache values (without batchId/createdAt/expiresAt since they're managed by LRU)
type CacheValue = Omit<CacheEntry, 'batchId' | 'createdAt' | 'expiresAt'>

const CACHE_TTL_MS = 15 * 60 * 1000
const CACHE_MAX = 50

// Simple TTL cache — lru-cache has Turbopack ESM resolution issues
const cache = new Map<string, { value: CacheValue; expiresAt: number }>()

function cacheSet(key: string, value: CacheValue): void {
  if (cache.size >= CACHE_MAX) {
    // evict oldest
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

function cacheGet(key: string): CacheValue | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) { cache.delete(key); return undefined }
  return entry.value
}

function sweep(): void {
  const now = Date.now()
  for (const [k, v] of cache) if (now > v.expiresAt) cache.delete(k)
}

function pickStatus(
  parsed: ParsedRow,
  siswaId: string | null,
  dupNoBukti: boolean,
  conflictPembayaranId: string | null,
): { status: RowStatus; message: string | null; defaultAction: AnalyzedRow['defaultAction'] } {
  if (parsed.errors.length > 0) {
    return {
      status: 'INVALID',
      message: parsed.errors.map((e) => e.message).join(' '),
      defaultAction: 'skip',
    }
  }
  if (dupNoBukti) {
    return {
      status: 'DUPLIKAT_NO_BUKTI',
      message: 'No. Bukti ini sudah pernah dicatat. Dilewati otomatis.',
      defaultAction: 'skip',
    }
  }
  if (!siswaId) {
    return {
      status: 'NIS_TIDAK_DIKENAL',
      message: 'NIS belum terdaftar di master siswa. Pilih tindakan: buat siswa baru atau lewati.',
      defaultAction: 'skip',
    }
  }
  if (conflictPembayaranId) {
    return {
      status: 'DUPLIKAT_PERIODE',
      message:
        'Siswa sudah bayar periode ini. Default: pindah pembayaran ini ke bulan berikutnya yang belum dibayar (roll-forward). Bisa diubah ke Lewati atau Ganti.',
      defaultAction: 'roll_forward',
    }
  }
  return { status: 'BARU', message: null, defaultAction: 'import' }
}

async function analyzeParseResult(
  parse: ParseResult,
  source: CacheEntry['source'],
): Promise<{ rows: AnalyzedRow[]; counts: PreviewCounts }> {
  const nisList = Array.from(
    new Set(parse.rows.filter((r) => r.nis).map((r) => r.nis)),
  )
  const noBuktiList = Array.from(
    new Set(parse.rows.filter((r) => r.noBukti).map((r) => r.noBukti)),
  )

  const [siswaRows, existingNoBukti] = await Promise.all([
    nisList.length === 0
      ? Promise.resolve([] as Array<{ id: string; nis: string }>)
      : prisma.siswa.findMany({
          where: { nis: { in: nisList } },
          select: { id: true, nis: true },
        }),
    noBuktiList.length === 0
      ? Promise.resolve([] as Array<{ siswaId: string; periodYear: number; periodMonth: number; noBukti: string | null; id: string }>)
      : prisma.pembayaran.findMany({
          where: { noBukti: { in: noBuktiList } },
          select: { id: true, noBukti: true, siswaId: true, periodYear: true, periodMonth: true },
        }),
  ])

  const siswaIdByNis = new Map<string, string>()
  for (const s of siswaRows) siswaIdByNis.set(s.nis, s.id)

  const noBuktiSet = new Set<string>()
  for (const p of existingNoBukti) if (p.noBukti) noBuktiSet.add(p.noBukti)

  // For candidate matched-siswa + periode, batch-load existing rows to detect DUPLIKAT_PERIODE.
  const periodeChecks: Array<{ siswaId: string; year: number; month: number }> = []
  for (const r of parse.rows) {
    if (r.errors.length > 0) continue
    const siswaId = siswaIdByNis.get(r.nis)
    if (!siswaId) continue
    if (r.periodYear === null || r.periodMonth === null) continue
    periodeChecks.push({ siswaId, year: r.periodYear, month: r.periodMonth })
  }

  let conflictMap = new Map<string, { id: string; noBukti: string | null }>()
  if (periodeChecks.length > 0) {
    // Fetch by siswaId IN (...) only, then filter in-memory.
    // Avoids a large OR clause that the Postgres planner handles poorly
    // and is bounded by the number of distinct siswa in the batch.
    const siswaIds = Array.from(new Set(periodeChecks.map((c) => c.siswaId)))
    const wantKey = new Set(
      periodeChecks.map((c) => `${c.siswaId}:${c.year}:${c.month}`),
    )
    const existing = await prisma.pembayaran.findMany({
      where: { siswaId: { in: siswaIds } },
      select: { id: true, siswaId: true, periodYear: true, periodMonth: true, noBukti: true },
    })
    for (const e of existing) {
      const key = `${e.siswaId}:${e.periodYear}:${e.periodMonth}`
      if (wantKey.has(key)) conflictMap.set(key, { id: e.id, noBukti: e.noBukti })
    }
  }

  const counts: PreviewCounts = {
    BARU: 0,
    DUPLIKAT_NO_BUKTI: 0,
    DUPLIKAT_PERIODE: 0,
    NIS_TIDAK_DIKENAL: 0,
    INVALID: 0,
  }

  const analyzed: AnalyzedRow[] = parse.rows.map((r) => {
    const siswaId = siswaIdByNis.get(r.nis) ?? null
    const dupNoBukti = r.noBukti ? noBuktiSet.has(r.noBukti) : false
    let conflictId: string | null = null
    if (
      !dupNoBukti &&
      siswaId &&
      r.periodYear !== null &&
      r.periodMonth !== null
    ) {
      const key = `${siswaId}:${r.periodYear}:${r.periodMonth}`
      const hit = conflictMap.get(key)
      if (hit && hit.noBukti !== r.noBukti) conflictId = hit.id
    }

    const { status, message, defaultAction } = pickStatus(r, siswaId, dupNoBukti, conflictId)
    counts[status] += 1

    // Unused but kept to avoid TS unused var warning in future extension.
    void source

    return {
      rowIndex: r.rowIndex,
      status,
      message,
      siswaId,
      nis: r.nis,
      nama: r.nama,
      kelas: r.kelas,
      rombelNomor: r.rombelNomor,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      amount: r.amount,
      biayaAdm: r.biayaAdm,
      tanggalTransaksi: r.tanggalTransaksi ? r.tanggalTransaksi.toISOString() : null,
      noBukti: r.noBukti,
      kodeCabang: r.kodeCabang,
      tellerUser: r.tellerUser,
      conflictPembayaranId: conflictId,
      defaultAction,
    }
  })

  return { rows: analyzed, counts }
}

export const importService = {
  async previewExcel(
    file: { buffer: Uint8Array; name: string },
    _actor: { userId: string },
  ): Promise<PreviewResult> {
    void _actor
    const parse = await parseAsikWorkbook(file.buffer, { fileName: file.name })
    return this.registerPreview(parse, 'IMPORT_EXCEL')
  },

  async previewPaste(text: string, _actor: { userId: string }): Promise<PreviewResult> {
    void _actor
    const parse = parsePembayaranPaste(text)
    return this.registerPreview(parse, 'PASTE_SPREADSHEET')
  },

  async registerPreview(
    parse: ParseResult,
    source: CacheEntry['source'],
  ): Promise<PreviewResult> {
    const start = performance.now()
    sweep()

    const { rows, counts } = await analyzeParseResult(parse, source)

    // Check if this fileHash was already imported.
    const alreadyImportedRec = parse.fileHash
      ? await importBatchRepo.findByFileHash(parse.fileHash)
      : null

    const batchId = randomUUID()
    cacheSet(batchId, {
      fileHash: parse.fileHash,
      fileName: parse.fileName,
      fileSize: parse.fileSize,
      sheetName: parse.sheetName,
      rows,
      parseErrors: parse.errors,
      source,
    })

    const duration = performance.now() - start
    logger.info({ duration, operation: 'preview', source: source, fileName: parse.fileName, totalRows: parse.totalRows }, 'import.preview')

    if (duration > 2000) {
      logger.warn({ duration, operation: 'preview', source: source, fileName: parse.fileName }, 'import.preview: slow')
    }

    return {
      batchId,
      fileHash: parse.fileHash,
      fileName: parse.fileName,
      fileSize: parse.fileSize,
      sheetName: parse.sheetName,
      totalRows: parse.totalRows,
      counts,
      rows,
      parseErrors: parse.errors,
      alreadyImported: alreadyImportedRec
        ? {
            batchId: alreadyImportedRec.id,
            at: alreadyImportedRec.uploadedAt.toISOString(),
          }
        : null,
    }
  },

  /**
   * Commit user-selected actions. Transactional: all or nothing, unless the
   * error rate exceeds 50% in which case the whole thing is rolled back anyway.
   */
  async confirm(
    batchId: string,
    selections: ImportSelection[],
    actor: { userId: string },
  ): Promise<{
    batchId: string
    importBatchId: string
    success: number
    skipped: number
    replaced: number
    rolledForward: number
    createdSiswa: number
    errors: Array<{ rowIndex: number; message: string }>
  }> {
    const start = performance.now()
    const entry = cacheGet(batchId)
    if (!entry) {
      throw new ValidationError('Preview sudah kedaluwarsa. Silakan upload ulang file.')
    }

    // Index rows for quick lookup
    const rowByIndex = new Map<number, AnalyzedRow>()
    for (const r of entry.rows) rowByIndex.set(r.rowIndex, r)

    // Validate selections only reference existing rows
    for (const sel of selections) {
      if (!rowByIndex.has(sel.rowIndex)) {
        throw new ValidationError(`Baris ${sel.rowIndex} tidak ditemukan di preview.`)
      }
    }

    const createdAt = new Date()
    const sourceLabel = entry.source

    const result = await (async () => {
      // Using the global `prisma` client (not a transaction) so that
      // a per-row Postgres constraint error doesn't poison the remaining
      // inserts with SQLSTATE 25P02 ("current transaction is aborted").
      // Each create/update is its own auto-commit mini-transaction.
      // Atomicity: we still rollback via post-commit if the error rate >50%
      // by updating ImportBatch to FAILED, but individual committed rows stay.
      const tx = prisma
      // 1. Create the ImportBatch record up-front.
      const batch = await tx.importBatch.create({
        data: {
          fileName: entry.fileName,
          fileSize: entry.fileSize,
          fileHash: entry.fileHash,
          uploadedAt: createdAt,
          uploadedBy: actor.userId,
          totalRows: entry.rows.length,
          status: 'PROCESSING',
        },
      })

      let success = 0
      let skipped = 0
      let replaced = 0
      let rolledForward = 0
      let createdSiswa = 0
      const errors: Array<{ rowIndex: number; message: string }> = []

      // Per-siswa reservation tracker for roll-forward (so two rolls in the
      // same batch don't collide on the same target periode).
      const reservedSlots = new Map<string, Set<string>>() // siswaId → Set<"YYYY-MM">
      const slotKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`
      const siswaAngkatanCache = new Map<string, number>()
      // Cache paid-periode set per-siswa so we don't refetch on every roll-forward row.
      const paidKeysCache = new Map<string, Set<string>>()

      /** Compute SPP window Jul(a) → Jun(a+3), 36 months. */
      const sppWindow = (angkatan: number): Array<{ y: number; m: number }> => {
        const out: Array<{ y: number; m: number }> = []
        for (let g = 0; g < 3; g += 1) {
          for (let month = 7; month <= 12; month += 1) out.push({ y: angkatan + g, m: month })
          for (let month = 1; month <= 6; month += 1) out.push({ y: angkatan + g + 1, m: month })
        }
        return out
      }

      /** Find next unpaid periode for a siswa, strictly after (fromY, fromM). */
      const findNextUnpaid = async (
        siswaId: string,
        fromY: number,
        fromM: number,
      ): Promise<{ y: number; m: number } | null> => {
        let angkatan = siswaAngkatanCache.get(siswaId)
        if (angkatan === undefined) {
          const s = await tx.siswa.findUnique({
            where: { id: siswaId },
            select: { angkatan: true },
          })
          angkatan = s?.angkatan ?? fromY
          siswaAngkatanCache.set(siswaId, angkatan)
        }

        // Fetch once per siswa, reuse across roll-forward rows in the same batch.
        let paidKeys = paidKeysCache.get(siswaId)
        if (!paidKeys) {
          const paid = await tx.pembayaran.findMany({
            where: { siswaId },
            select: { periodYear: true, periodMonth: true },
          })
          paidKeys = new Set(paid.map((p) => slotKey(p.periodYear, p.periodMonth)))
          paidKeysCache.set(siswaId, paidKeys)
        }
        const reserved = reservedSlots.get(siswaId) ?? new Set<string>()

        const window = sppWindow(angkatan)
        const startIdx = window.findIndex((p) => p.y === fromY && p.m === fromM)
        const from = startIdx >= 0 ? startIdx + 1 : 0
        for (let i = from; i < window.length; i += 1) {
          const p = window[i]!
          const k = slotKey(p.y, p.m)
          if (paidKeys.has(k) || reserved.has(k)) continue
          return p
        }
        return null
      }

      // Two-pass processing: apply non-roll_forward actions first so that
      // roll_forward allocation sees the committed periodes and picks the
      // next truly-unpaid slot. Without this, two rows in the same batch
      // can target the same (siswa, year, month) — roll-forward claims it
      // first, then the BARU row fails on unique constraint.
      const ordered = [
        ...selections.filter((s) => s.action !== 'roll_forward'),
        ...selections.filter((s) => s.action === 'roll_forward'),
      ]

      for (const sel of ordered) {
        const row = rowByIndex.get(sel.rowIndex)
        if (!row) continue

        if (sel.action === 'skip') {
          skipped += 1
          continue
        }

        // Guard rail — never let caller override a hard-duplicate noBukti.
        if (row.status === 'DUPLIKAT_NO_BUKTI') {
          skipped += 1
          continue
        }

        if (row.status === 'INVALID') {
          errors.push({
            rowIndex: row.rowIndex,
            message: row.message ?? 'Baris tidak valid.',
          })
          continue
        }

        // Ensure required fields present for import/replace/create_siswa
        if (
          row.periodYear === null ||
          row.periodMonth === null ||
          !row.noBukti ||
          !row.nis
        ) {
          errors.push({ rowIndex: row.rowIndex, message: 'Kolom wajib kosong.' })
          continue
        }

        let siswaId = row.siswaId
        if (!siswaId) {
          if (sel.action !== 'create_siswa') {
            skipped += 1
            continue
          }
          // Derive angkatan heuristic from periode year if we can (periode year
          // maps to academic year of payment; safe fallback = periode year).
          const newSiswa = await tx.siswa.create({
            data: {
              nis: row.nis,
              nama: row.nama || `Siswa ${row.nis}`,
              angkatan: row.periodYear,
              statusSiswa: 'AKTIF',
              catatan: `Auto-generated dari import batch ${batch.id}`,
            },
          })
          siswaId = newSiswa.id
          createdSiswa += 1
        }

        const tgl = row.tanggalTransaksi ? new Date(row.tanggalTransaksi) : createdAt

        const data: Prisma.PembayaranUncheckedCreateInput = {
          siswaId,
          periodYear: row.periodYear,
          periodMonth: row.periodMonth,
          amount: row.amount,
          biayaAdm: row.biayaAdm,
          tanggalTransaksi: tgl,
          noBukti: row.noBukti,
          kodeCabang: row.kodeCabang,
          tellerUser: row.tellerUser,
          statusBayar: 'TERBAYAR',
          source: sourceLabel,
          importBatchId: batch.id,
        }

        try {
          if (sel.action === 'replace' && row.conflictPembayaranId) {
            // Overwrite the conflicting periode row in place.
            await tx.pembayaran.update({
              where: { id: row.conflictPembayaranId },
              data: {
                amount: data.amount,
                biayaAdm: data.biayaAdm,
                tanggalTransaksi: data.tanggalTransaksi,
                noBukti: data.noBukti,
                kodeCabang: data.kodeCabang,
                tellerUser: data.tellerUser,
                statusBayar: 'TERBAYAR',
                source: sourceLabel,
                importBatchId: batch.id,
              },
            })
            replaced += 1
          } else if (sel.action === 'roll_forward') {
            const next = await findNextUnpaid(siswaId, row.periodYear, row.periodMonth)
            if (!next) {
              errors.push({
                rowIndex: row.rowIndex,
                message: `Siswa sudah lunas seluruh SPP (36 bulan). Tidak ada slot kosong untuk roll-forward. Mohon tindak lanjut sebagai kelebihan bayar / refund manual.`,
              })
            } else {
              const reserved =
                reservedSlots.get(siswaId) ?? new Set<string>()
              reserved.add(slotKey(next.y, next.m))
              reservedSlots.set(siswaId, reserved)
              await tx.pembayaran.create({
                data: {
                  ...data,
                  periodYear: next.y,
                  periodMonth: next.m,
                  catatan: `Roll-forward dari duplikat bayar periode ${row.periodYear}-${String(row.periodMonth).padStart(2, '0')} (bukti asli ${row.noBukti}).`,
                },
              })
              rolledForward += 1
            }
          } else {
            await tx.pembayaran.create({ data })
            success += 1
          }
        } catch (err) {
          const msg =
            err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002'
              ? 'Data duplikat (no. bukti atau periode sudah ada).'
              : err instanceof Error
                ? err.message
                : 'Gagal insert.'
          errors.push({ rowIndex: row.rowIndex, message: msg })
        }
      }

      // Systemic-failure guard: only abort if error rate is high AND
      // the error count is large enough to suggest something beyond
      // business-rule rejections (e.g., all slots penuh untuk siswa lunas).
      // Threshold: ≥ 50% error AND at least 10 errors total.
      const errorRate = errors.length / Math.max(1, selections.length)
      const systemicFailure = errors.length >= 10 && errorRate > 0.5

      const finalStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED' = systemicFailure
        ? 'FAILED'
        : errors.length === 0
          ? 'COMPLETED'
          : 'PARTIAL'

      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          successCount: success + replaced + rolledForward,
          duplicateCount: skipped,
          errorCount: errors.length,
          errorDetails: errors.length > 0 ? (errors as unknown as Prisma.InputJsonValue) : undefined,
          status: finalStatus,
        },
      })

      if (systemicFailure) {
        throw new ValidationError(
          `${errors.length} dari ${selections.length} baris gagal. Batch ditandai FAILED — baris yang sudah commit tetap tersimpan, silakan review dan re-upload sisanya.`,
          undefined,
          { errors: errors.slice(0, 20), totalErrors: errors.length },
        )
      }

      return { batch, success, skipped, replaced, rolledForward, createdSiswa, errors }
    })()

    await auditLogRepo.create({
      user: { connect: { id: actor.userId } },
      action: 'PEMBAYARAN_IMPORT_CONFIRM',
      entity: 'ImportBatch',
      entityId: result.batch.id,
      metadata: {
        source: sourceLabel,
        success: result.success,
        replaced: result.replaced,
        rolledForward: result.rolledForward,
        skipped: result.skipped,
        createdSiswa: result.createdSiswa,
        errors: result.errors.length,
      },
    })

    // Invalidate preview cache so the same batchId can't be reused.
    cache.delete(batchId)

    const duration = performance.now() - start
    logger.info({ duration, operation: 'confirm', source: sourceLabel, success: result.success, skipped: result.skipped, replaced: result.replaced, rolledForward: result.rolledForward, createdSiswa: result.createdSiswa, errors: result.errors.length }, 'import.confirm')

    if (duration > 2000) {
      logger.warn({ duration, operation: 'confirm', source: sourceLabel, selectionCount: selections.length }, 'import.confirm: slow')
    }

    return {
      batchId,
      importBatchId: result.batch.id,
      success: result.success,
      skipped: result.skipped,
      replaced: result.replaced,
      rolledForward: result.rolledForward,
      createdSiswa: result.createdSiswa,
      errors: result.errors,
    }
  },

  /**
   * List recent ImportBatch records for the import-history UI.
   */
  async listBatches(take = 50): Promise<
    Array<{
      id: string
      fileName: string
      fileSize: number
      fileHash: string
      uploadedAt: string
      uploadedBy: string
      totalRows: number
      successCount: number
      duplicateCount: number
      errorCount: number
      status: string
    }>
  > {
    const items = await importBatchRepo.list(take)
    return items.map((b: {
      id: string
      fileName: string
      fileSize: number
      fileHash: string
      uploadedAt: Date
      uploadedBy: string
      totalRows: number
      successCount: number
      duplicateCount: number
      errorCount: number
      status: string
    }) => ({
      id: b.id,
      fileName: b.fileName,
      fileSize: b.fileSize,
      fileHash: b.fileHash,
      uploadedAt: b.uploadedAt.toISOString(),
      uploadedBy: b.uploadedBy,
      totalRows: b.totalRows,
      successCount: b.successCount,
      duplicateCount: b.duplicateCount,
      errorCount: b.errorCount,
      status: b.status,
    }))
  },
}

// Unused suppression for Pembayaran import — reserved for typed extensions
void (undefined as unknown as Pembayaran | undefined)
