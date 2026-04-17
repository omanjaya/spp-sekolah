/**
 * Naik Kelas service.
 *
 * Flow:
 *   1. preview(file, fileName, targetTahunAjaranId)
 *      - Parse Excel → rows dengan (nis, namaExcel, rombelKode)
 *      - Analisis tiap baris: cek NIS, nama, sudah assign atau belum
 *      - Cache hasil analisis 15 menit dengan batchId
 *      - Return preview lengkap + daftar siswa tidak terassign
 *
 *   2. confirm(batchId, tahunAjaranId, selections, actor)
 *      - Ambil dari cache
 *      - Proses tiap selection: assign/skip/pakai_db/pakai_excel/buat_baru
 *      - Individual inserts (tidak pakai $transaction) agar tidak poison
 *      - Audit log
 *
 * In-memory cache: globalThis map, 15 menit TTL, keyed by batchId (UUID).
 */

import { randomUUID } from 'node:crypto'

import { prisma } from '@/lib/db'
import { auditLogRepo } from '@/repositories/audit-log.repo'
import { ValidationError } from '@/core/errors'
import { parseNaikKelasWorkbook } from '@/lib/excel/naik-kelas-parser'
import type { NaikKelasSelection } from '@/lib/validators/naik-kelas.schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NaikKelasRowStatus =
  | 'MATCH'
  | 'NAMA_BEDA'
  | 'NIS_TIDAK_DIKENAL'
  | 'SUDAH_ASSIGN'

export interface AnalyzedNaikKelasRow {
  rowIndex: number
  nis: string
  namaExcel: string
  /** Nama siswa di DB; null jika NIS tidak ditemukan. */
  namaDb: string | null
  rombelKode: string
  status: NaikKelasRowStatus
  /** true jika rombelKode belum ada di tahun ajaran target. */
  rombelBaru: boolean
  /** ID siswa di DB; null jika tidak ditemukan. */
  siswaId: string | null
  /** ID rombel target jika sudah ada di DB; null jika belum. */
  rombelId: string | null
  /** ID Enrollment yang sudah ada (status SUDAH_ASSIGN). */
  enrollmentId: string | null
  message: string | null
}

export interface TidakTerassignEntry {
  nis: string
  nama: string
  siswaId: string
}

export type NaikKelasCounts = Record<NaikKelasRowStatus, number>

export interface NaikKelasPreviewResult {
  batchId: string
  tahunAjaranId: string
  rows: AnalyzedNaikKelasRow[]
  counts: NaikKelasCounts
  tidakTerassign: TidakTerassignEntry[]
}

export interface NaikKelasConfirmResult {
  assigned: number
  skipped: number
  namaUpdated: number
  siswaCreated: number
  errors: Array<{ rowIndex: number; message: string }>
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface NaikKelasCacheEntry {
  batchId: string
  createdAt: number
  expiresAt: number
  tahunAjaranId: string
  rows: AnalyzedNaikKelasRow[]
}

const CACHE_TTL_MS = 15 * 60 * 1000
type NaikKelasCacheStore = Map<string, NaikKelasCacheEntry>

const globalForCache = globalThis as unknown as {
  __naikKelasPreviewCache?: NaikKelasCacheStore
}
const naikKelasCache: NaikKelasCacheStore =
  globalForCache.__naikKelasPreviewCache ?? new Map<string, NaikKelasCacheEntry>()
if (!globalForCache.__naikKelasPreviewCache) {
  globalForCache.__naikKelasPreviewCache = naikKelasCache
}

function sweep(now: number): void {
  for (const [k, v] of naikKelasCache) {
    if (v.expiresAt <= now) naikKelasCache.delete(k)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes string for case-insensitive comparison: trim + collapse whitespace.
 */
function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Extracts grade prefix from rombelKode like "XI.6" → "XI".
 */
function gradeFromKode(kode: string): string {
  return kode.split('.')[0]?.toUpperCase() ?? ''
}

/**
 * Extracts nomor from rombelKode like "XI.6" → 6.
 */
function nomorFromKode(kode: string): number | null {
  const parts = kode.split('.')
  if (parts.length < 2) return null
  const n = Number(parts[1])
  return Number.isInteger(n) && n > 0 ? n : null
}

function gradeEnumFromStr(s: string): 'X' | 'XI' | 'XII' | null {
  const v = s.trim().toUpperCase()
  if (v === 'X') return 'X'
  if (v === 'XI') return 'XI'
  if (v === 'XII') return 'XII'
  return null
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export const naikKelasService = {
  async preview(
    file: Buffer,
    fileName: string,
    targetTahunAjaranId: string,
  ): Promise<NaikKelasPreviewResult> {
    sweep(Date.now())

    const { rows: parsedRows, errors: parseErrors } = await parseNaikKelasWorkbook(
      file,
      fileName,
    )

    if (parseErrors.length > 0 && parsedRows.length === 0) {
      throw new ValidationError(
        `Gagal membaca file: ${parseErrors.join(' ')}`,
      )
    }

    // ── Batch DB queries ────────────────────────────────────────────────────

    const nisList = Array.from(new Set(parsedRows.map((r) => r.nis).filter(Boolean)))

    // All siswa matching NIS list
    const siswaList = nisList.length
      ? await prisma.siswa.findMany({
          where: { nis: { in: nisList } },
          select: { id: true, nis: true, nama: true },
        })
      : []

    const siswaByNis = new Map(siswaList.map((s) => [s.nis, s]))

    // All rombels in target tahun ajaran
    const rombelsInTarget = await prisma.rombel.findMany({
      where: { tahunAjaranId: targetTahunAjaranId },
      select: { id: true, kode: true },
    })
    const rombelByKode = new Map(rombelsInTarget.map((r) => [r.kode.toUpperCase(), r]))

    // All enrollments in target TA for found siswa
    const siswaIds = siswaList.map((s) => s.id)
    const enrollmentsInTarget = siswaIds.length
      ? await prisma.enrollment.findMany({
          where: {
            tahunAjaranId: targetTahunAjaranId,
            siswaId: { in: siswaIds },
          },
          select: { id: true, siswaId: true },
        })
      : []
    const enrollmentBySiswaId = new Map(enrollmentsInTarget.map((e) => [e.siswaId, e.id]))

    // ── Find TIDAK_TERASSIGN: enrolled in previous TA but not in Excel ──────

    // Determine "previous" TA: find TA with the latest tanggalMulai before target
    const targetTa = await prisma.tahunAjaran.findUnique({
      where: { id: targetTahunAjaranId },
      select: { tahunMulai: true },
    })

    const tidakTerassign: TidakTerassignEntry[] = []

    if (targetTa) {
      // Previous TA = TA with tahunMulai = targetTa.tahunMulai - 1
      const prevTa = await prisma.tahunAjaran.findFirst({
        where: { tahunMulai: targetTa.tahunMulai - 1 },
        select: { id: true },
      })

      if (prevTa) {
        const prevEnrollments = await prisma.enrollment.findMany({
          where: { tahunAjaranId: prevTa.id },
          select: { siswaId: true, siswa: { select: { nis: true, nama: true } } },
        })

        const nisInExcel = new Set(nisList)
        for (const e of prevEnrollments) {
          if (!nisInExcel.has(e.siswa.nis)) {
            tidakTerassign.push({
              nis: e.siswa.nis,
              nama: e.siswa.nama,
              siswaId: e.siswaId,
            })
          }
        }
      }
    }

    // ── Analyze rows ────────────────────────────────────────────────────────

    const counts: NaikKelasCounts = {
      MATCH: 0,
      NAMA_BEDA: 0,
      NIS_TIDAK_DIKENAL: 0,
      SUDAH_ASSIGN: 0,
    }

    const analyzed: AnalyzedNaikKelasRow[] = parsedRows.map((row) => {
      const siswa = siswaByNis.get(row.nis) ?? null
      const rombelKodeUpper = row.rombelKode.toUpperCase()
      const rombel = rombelByKode.get(rombelKodeUpper) ?? null
      const rombelBaru = !rombel

      if (!siswa) {
        counts.NIS_TIDAK_DIKENAL += 1
        return {
          rowIndex: row.rowIndex,
          nis: row.nis,
          namaExcel: row.namaExcel,
          namaDb: null,
          rombelKode: row.rombelKode,
          status: 'NIS_TIDAK_DIKENAL' as NaikKelasRowStatus,
          rombelBaru,
          siswaId: null,
          rombelId: rombel?.id ?? null,
          enrollmentId: null,
          message: 'NIS belum terdaftar di master siswa.',
        }
      }

      const enrollmentId = enrollmentBySiswaId.get(siswa.id) ?? null
      if (enrollmentId) {
        counts.SUDAH_ASSIGN += 1
        return {
          rowIndex: row.rowIndex,
          nis: row.nis,
          namaExcel: row.namaExcel,
          namaDb: siswa.nama,
          rombelKode: row.rombelKode,
          status: 'SUDAH_ASSIGN' as NaikKelasRowStatus,
          rombelBaru,
          siswaId: siswa.id,
          rombelId: rombel?.id ?? null,
          enrollmentId,
          message: 'Siswa sudah memiliki Enrollment di tahun ajaran ini.',
        }
      }

      const namaBeda =
        normalizeName(siswa.nama) !== normalizeName(row.namaExcel) && row.namaExcel !== ''

      if (namaBeda) {
        counts.NAMA_BEDA += 1
        return {
          rowIndex: row.rowIndex,
          nis: row.nis,
          namaExcel: row.namaExcel,
          namaDb: siswa.nama,
          rombelKode: row.rombelKode,
          status: 'NAMA_BEDA' as NaikKelasRowStatus,
          rombelBaru,
          siswaId: siswa.id,
          rombelId: rombel?.id ?? null,
          enrollmentId: null,
          message: `Nama berbeda — DB: "${siswa.nama}", Excel: "${row.namaExcel}".`,
        }
      }

      counts.MATCH += 1
      return {
        rowIndex: row.rowIndex,
        nis: row.nis,
        namaExcel: row.namaExcel,
        namaDb: siswa.nama,
        rombelKode: row.rombelKode,
        status: 'MATCH' as NaikKelasRowStatus,
        rombelBaru,
        siswaId: siswa.id,
        rombelId: rombel?.id ?? null,
        enrollmentId: null,
        message: null,
      }
    })

    // ── Cache & return ──────────────────────────────────────────────────────

    const batchId = randomUUID()
    const now = Date.now()
    naikKelasCache.set(batchId, {
      batchId,
      createdAt: now,
      expiresAt: now + CACHE_TTL_MS,
      tahunAjaranId: targetTahunAjaranId,
      rows: analyzed,
    })

    return { batchId, tahunAjaranId: targetTahunAjaranId, rows: analyzed, counts, tidakTerassign }
  },

  // ---------------------------------------------------------------------------
  // Confirm
  // ---------------------------------------------------------------------------

  async confirm(
    batchId: string,
    tahunAjaranId: string,
    selections: NaikKelasSelection[],
    actor: { userId: string },
  ): Promise<NaikKelasConfirmResult> {
    const entry = naikKelasCache.get(batchId)
    if (!entry || entry.expiresAt <= Date.now()) {
      throw new ValidationError('Preview sudah kedaluwarsa. Silakan upload ulang file.')
    }
    if (entry.tahunAjaranId !== tahunAjaranId) {
      throw new ValidationError('tahunAjaranId tidak cocok dengan preview.')
    }

    const rowByIndex = new Map(entry.rows.map((r) => [r.rowIndex, r]))

    for (const sel of selections) {
      if (!rowByIndex.has(sel.rowIndex)) {
        throw new ValidationError(`Baris ${sel.rowIndex} tidak ditemukan di preview.`)
      }
    }

    // ── Rombel auto-create cache (avoid duplicate creates per batch) ─────────
    // key: rombelKode.toUpperCase()
    const rombelIdCache = new Map<string, string>()

    // Pre-seed with already-known rombel IDs from preview rows
    for (const row of entry.rows) {
      if (row.rombelId) {
        rombelIdCache.set(row.rombelKode.toUpperCase(), row.rombelId)
      }
    }

    const getOrCreateRombel = async (rombelKode: string): Promise<string | null> => {
      const key = rombelKode.toUpperCase()
      if (rombelIdCache.has(key)) return rombelIdCache.get(key)!

      const gradeStr = gradeFromKode(rombelKode)
      const nomor = nomorFromKode(rombelKode)
      const grade = gradeEnumFromStr(gradeStr)
      if (!grade || nomor === null) return null

      try {
        const created = await prisma.rombel.create({
          data: {
            tahunAjaranId,
            grade,
            nomor,
            kode: rombelKode,
          },
        })
        rombelIdCache.set(key, created.id)
        return created.id
      } catch {
        // Might have been created concurrently — try to find it
        const existing = await prisma.rombel.findUnique({
          where: { tahunAjaranId_kode: { tahunAjaranId, kode: rombelKode } },
          select: { id: true },
        })
        if (existing) {
          rombelIdCache.set(key, existing.id)
          return existing.id
        }
        return null
      }
    }

    // ── Process selections ──────────────────────────────────────────────────

    let assigned = 0
    let skipped = 0
    let namaUpdated = 0
    let siswaCreated = 0
    const errors: Array<{ rowIndex: number; message: string }> = []

    // Derive angkatan from TA tahunMulai
    const ta = await prisma.tahunAjaran.findUnique({
      where: { id: tahunAjaranId },
      select: { tahunMulai: true },
    })
    const angkatanDefault = ta?.tahunMulai ?? new Date().getFullYear()

    for (const sel of selections) {
      const row = rowByIndex.get(sel.rowIndex)
      if (!row) continue

      if (sel.action === 'skip') {
        skipped += 1
        continue
      }

      // SUDAH_ASSIGN rows: guard — already handled skip above, so any remaining
      // action on an already-assigned row becomes a skip
      if (row.status === 'SUDAH_ASSIGN') {
        skipped += 1
        continue
      }

      try {
        let siswaId = row.siswaId

        // --- buat_baru: create new Siswa ---
        if (sel.action === 'buat_baru') {
          if (siswaId) {
            // Siswa already exists; treat as assign
          } else {
            const newSiswa = await prisma.siswa.create({
              data: {
                nis: row.nis,
                nama: row.namaExcel || `Siswa ${row.nis}`,
                angkatan: angkatanDefault,
                statusSiswa: 'AKTIF',
              },
            })
            siswaId = newSiswa.id
            siswaCreated += 1
          }
        }

        // --- pakai_excel: update nama ---
        if (sel.action === 'pakai_excel' && siswaId && row.namaExcel) {
          await prisma.siswa.update({
            where: { id: siswaId },
            data: { nama: row.namaExcel },
          })
          namaUpdated += 1
        }

        if (!siswaId) {
          errors.push({ rowIndex: row.rowIndex, message: 'Siswa tidak ditemukan dan action bukan buat_baru.' })
          continue
        }

        // --- Resolve or create rombel ---
        const rombelId = await getOrCreateRombel(row.rombelKode)
        if (!rombelId) {
          errors.push({
            rowIndex: row.rowIndex,
            message: `Gagal membuat/menemukan rombel "${row.rombelKode}". Pastikan format kode valid (mis. XI.6).`,
          })
          continue
        }

        // --- Create Enrollment ---
        await prisma.enrollment.create({
          data: {
            siswaId,
            rombelId,
            tahunAjaranId,
          },
        })
        assigned += 1
      } catch (err) {
        const msg =
          err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002'
            ? 'Enrollment sudah ada untuk siswa ini di tahun ajaran yang sama.'
            : err instanceof Error
              ? err.message
              : 'Gagal memproses baris.'
        errors.push({ rowIndex: row.rowIndex, message: msg })
      }
    }

    // ── Audit log ───────────────────────────────────────────────────────────

    await auditLogRepo.create({
      user: { connect: { id: actor.userId } },
      action: 'NAIK_KELAS_CONFIRM',
      entity: 'Enrollment',
      metadata: {
        tahunAjaranId,
        assigned,
        skipped,
        namaUpdated,
        siswaCreated,
        errors: errors.length,
      },
    })

    // Invalidate cache
    naikKelasCache.delete(batchId)

    return { assigned, skipped, namaUpdated, siswaCreated, errors }
  },
}
