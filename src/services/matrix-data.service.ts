/**
 * Matrix Data Builder
 *
 * Core data contract for:
 *  - PDF export (react-pdf)
 *  - Excel export (exceljs)
 *  - Siswa detail matrix view (HTML)
 *
 * Builds a 36-month grid (3 years × 12 months, Jul → Jun) per angkatan.
 *  - Grade X : Jul(t)   .. Jun(t+1)
 *  - Grade XI: Jul(t+1) .. Jun(t+2)
 *  - Grade XII Jul(t+2) .. Jun(t+3)
 * where `t = angkatan` (year siswa first enrolled).
 *
 * Rows are ordered by (rombel.kode asc, enrollment.noAbsen asc, siswa.nama asc).
 *
 * Cell precedence (highest wins):
 *  1. Keringanan (JUARA/OSN/JUARA_UMUM/BEASISWA/...) — shown as status label
 *  2. Pelunasan covering the period — LUNAS with tanggalLunas
 *  3. Pembayaran TERBAYAR — LUNAS with tanggalTransaksi
 *  4. Otherwise BELUM
 *
 * An in-memory TTL cache (60s) keyed by (angkatan, rombelId?) avoids rebuilding
 * during export/preview bursts. Consumers should invalidate by calling
 * `invalidateMatrixCache()` after any write that could affect the matrix.
 */

import type { Grade, JenisKeringanan, Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { NotFoundError, ValidationError } from '@/core/errors'

export type MatrixCellStatus =
  | 'LUNAS'
  | 'BELUM'
  | 'JUARA'
  | 'OSN'
  | 'JUARA_UMUM'
  | 'BEASISWA'
  | 'KELUARGA_TIDAK_MAMPU'
  | 'PINDAHAN'
  | 'LAINNYA'

export interface MatrixCell {
  status: MatrixCellStatus
  date?: Date
  amount?: number
}

export interface MatrixPeriod {
  /** Grade at which this month is billed: X | XI | XII */
  grade: Grade
  /** Calendar year */
  year: number
  /** 1..12 */
  month: number
  /** Short label "Jul", "Agu", ... */
  label: string
}

export interface MatrixSiswaRow {
  id: string
  nis: string
  nama: string
  noAbsen: number | null
  rombelId: string
  /**
   * Map keyed by "YYYY-MM". Missing entries mean BELUM (not rendered as cell,
   * but renderer can default).
   */
  cells: Record<string, MatrixCell>
}

export interface MatrixRombelGroup {
  rombelId: string
  rombelKode: string
  grade: Grade
  nomor: number
  waliKelas: string | null
  tahunAjaranKode: string
  siswa: MatrixSiswaRow[]
}

export interface MatrixData {
  angkatan: number
  /** 36 periods spanning X(12) + XI(12) + XII(12) */
  periods: MatrixPeriod[]
  rombels: MatrixRombelGroup[]
  generatedAt: Date
}

export interface BuildMatrixOptions {
  angkatan: number
  /** Restrict to a single rombel (of the angkatan). Optional. */
  rombelId?: string
}

// ─── Constants ─────────────────────────────────────────────
const MONTH_LABELS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const

const CACHE_TTL_MS = 60_000

// ─── Cache ─────────────────────────────────────────────────
type CacheEntry = { builtAt: number; data: MatrixData }

const cache = new Map<string, CacheEntry>()

function cacheKey(angkatan: number, rombelId?: string): string {
  return `${angkatan}::${rombelId ?? '*'}`
}

export function invalidateMatrixCache(angkatan?: number): void {
  if (angkatan === undefined) {
    cache.clear()
    return
  }
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(`${angkatan}::`)) cache.delete(k)
  }
}

// ─── Helpers ───────────────────────────────────────────────
function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function periodMatches(pelunasanStart: string, pelunasanEnd: string, year: number, month: number): boolean {
  // Periods are "YYYY-MM" strings; lexical comparison works.
  const current = monthKey(year, month)
  return current >= pelunasanStart && current <= pelunasanEnd
}

/** Build the 36 periods (Jul(t)..Jun(t+3)) given an angkatan t. */
export function buildPeriodsForAngkatan(angkatan: number): MatrixPeriod[] {
  const periods: MatrixPeriod[] = []
  const grades: Grade[] = ['X', 'XI', 'XII']
  for (let gi = 0; gi < grades.length; gi += 1) {
    const grade = grades[gi]
    if (!grade) continue
    // Year for July = angkatan + gi (offset). Dec = same year. Jan..Jun = year + 1.
    const yearJulStart = angkatan + gi
    for (let m = 7; m <= 12; m += 1) {
      periods.push({
        grade,
        year: yearJulStart,
        month: m,
        label: MONTH_LABELS_SHORT[m - 1] ?? String(m),
      })
    }
    for (let m = 1; m <= 6; m += 1) {
      periods.push({
        grade,
        year: yearJulStart + 1,
        month: m,
        label: MONTH_LABELS_SHORT[m - 1] ?? String(m),
      })
    }
  }
  return periods
}

function mapKeringananToStatus(jenis: JenisKeringanan): MatrixCellStatus {
  // All JenisKeringanan values are also MatrixCellStatus values.
  return jenis
}

// ─── Query ─────────────────────────────────────────────────
async function fetchRombels(angkatan: number, rombelId?: string) {
  const where: Prisma.RombelWhereInput = {
    enrollments: {
      some: { siswa: { angkatan } },
    },
    ...(rombelId ? { id: rombelId } : {}),
  }
  return prisma.rombel.findMany({
    where,
    include: {
      tahunAjaran: true,
      enrollments: {
        where: { siswa: { angkatan } },
        include: { siswa: true },
        orderBy: [{ noAbsen: 'asc' }, { siswa: { nama: 'asc' } }],
      },
    },
    orderBy: [{ grade: 'asc' }, { nomor: 'asc' }],
  })
}

// ─── Public API ────────────────────────────────────────────
export async function buildMatrix(opts: BuildMatrixOptions): Promise<MatrixData> {
  const { angkatan, rombelId } = opts

  if (!Number.isInteger(angkatan) || angkatan < 2000 || angkatan > 2100) {
    throw new ValidationError('Parameter angkatan tidak valid.', {
      angkatan: ['Harus bilangan bulat tahun masuk yang valid.'],
    })
  }

  const key = cacheKey(angkatan, rombelId)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.builtAt < CACHE_TTL_MS) {
    return hit.data
  }

  const rombels = await fetchRombels(angkatan, rombelId)

  if (rombelId && rombels.length === 0) {
    throw new NotFoundError('Rombel tidak ditemukan atau tidak memiliki siswa dengan angkatan tersebut.')
  }

  const periods = buildPeriodsForAngkatan(angkatan)

  // Collect all siswaIds across requested rombels.
  const siswaIds: string[] = []
  for (const r of rombels) {
    for (const e of r.enrollments) siswaIds.push(e.siswaId)
  }

  // Periods bound for WHERE (only pull pembayaran/keringanan in the 36-month
  // window to keep payloads small).
  const minPeriod = periods[0]
  const maxPeriod = periods[periods.length - 1]

  const periodFilter: Prisma.PembayaranWhereInput | undefined = minPeriod && maxPeriod
    ? {
        OR: [
          // Same year between months
          {
            periodYear: { gt: minPeriod.year, lt: maxPeriod.year },
          },
          {
            periodYear: minPeriod.year,
            periodMonth: { gte: minPeriod.month },
          },
          {
            periodYear: maxPeriod.year,
            periodMonth: { lte: maxPeriod.month },
          },
        ],
      }
    : undefined

  const [pembayarans, keringanans, pelunasans] =
    siswaIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          prisma.pembayaran.findMany({
            where: {
              siswaId: { in: siswaIds },
              statusBayar: 'TERBAYAR',
              ...(periodFilter ? periodFilter : {}),
            },
          }),
          prisma.keringanan.findMany({
            where: {
              siswaId: { in: siswaIds },
              ...(periodFilter
                ? (periodFilter as unknown as Prisma.KeringananWhereInput)
                : {}),
            },
          }),
          prisma.pelunasan.findMany({
            where: { siswaId: { in: siswaIds } },
          }),
        ])

  // Index pembayarans and keringanans per siswa per period.
  type PayRec = { date: Date; amount: number }
  const payIndex = new Map<string, PayRec>() // `${siswaId}|${YYYY-MM}`
  for (const p of pembayarans) {
    const k = `${p.siswaId}|${monthKey(p.periodYear, p.periodMonth)}`
    payIndex.set(k, { date: p.tanggalTransaksi, amount: Number(p.amount) })
  }

  const waiverIndex = new Map<string, JenisKeringanan>()
  for (const w of keringanans) {
    const k = `${w.siswaId}|${monthKey(w.periodYear, w.periodMonth)}`
    waiverIndex.set(k, w.jenis)
  }

  // Index pelunasans by siswaId → list of ranges.
  const pelunasanIndex = new Map<string, { start: string; end: string; date: Date }[]>()
  for (const pel of pelunasans) {
    const arr = pelunasanIndex.get(pel.siswaId) ?? []
    arr.push({ start: pel.periodeMulai, end: pel.periodeAkhir, date: pel.tanggalLunas })
    pelunasanIndex.set(pel.siswaId, arr)
  }

  // Assemble groups.
  const groups: MatrixRombelGroup[] = rombels.map((r) => {
    const siswaRows: MatrixSiswaRow[] = r.enrollments.map((e) => {
      const cells: Record<string, MatrixCell> = {}
      for (const period of periods) {
        const mk = monthKey(period.year, period.month)
        const waiver = waiverIndex.get(`${e.siswaId}|${mk}`)
        if (waiver) {
          cells[mk] = { status: mapKeringananToStatus(waiver) }
          continue
        }
        const pay = payIndex.get(`${e.siswaId}|${mk}`)
        if (pay) {
          cells[mk] = { status: 'LUNAS', date: pay.date, amount: pay.amount }
          continue
        }
        const pelList = pelunasanIndex.get(e.siswaId)
        if (pelList) {
          const match = pelList.find((x) => periodMatches(x.start, x.end, period.year, period.month))
          if (match) {
            cells[mk] = { status: 'LUNAS', date: match.date }
            continue
          }
        }
        cells[mk] = { status: 'BELUM' }
      }
      return {
        id: e.siswa.id,
        nis: e.siswa.nis,
        nama: e.siswa.nama,
        noAbsen: e.noAbsen,
        rombelId: r.id,
        cells,
      }
    })

    return {
      rombelId: r.id,
      rombelKode: r.kode,
      grade: r.grade,
      nomor: r.nomor,
      waliKelas: r.waliKelas,
      tahunAjaranKode: r.tahunAjaran.kode,
      siswa: siswaRows,
    }
  })

  const data: MatrixData = {
    angkatan,
    periods,
    rombels: groups,
    generatedAt: new Date(),
  }
  cache.set(key, { builtAt: Date.now(), data })
  return data
}

/**
 * Helper: given a rombelId, resolve the angkatan as the earliest angkatan
 * among enrolled siswa. PDF format is per-angkatan so callers usually want
 * the angkatan derived from the rombel.
 */
export async function resolveAngkatanForRombel(rombelId: string): Promise<number> {
  const rombel = await prisma.rombel.findUnique({
    where: { id: rombelId },
    include: {
      enrollments: {
        include: { siswa: { select: { angkatan: true } } },
        take: 1,
        orderBy: { siswa: { angkatan: 'asc' } },
      },
    },
  })
  if (!rombel) throw new NotFoundError('Rombel tidak ditemukan.')
  const first = rombel.enrollments[0]
  if (!first) {
    // Fallback: derive from tahunAjaran + grade.
    const ta = await prisma.tahunAjaran.findUnique({ where: { id: rombel.tahunAjaranId } })
    if (!ta) throw new NotFoundError('Tahun ajaran tidak ditemukan.')
    const gradeOffset = rombel.grade === 'X' ? 0 : rombel.grade === 'XI' ? 1 : 2
    return ta.tahunMulai - gradeOffset
  }
  return first.siswa.angkatan
}

/** Project the cell label the way PDF/Excel renders it. */
export function cellDisplay(cell: MatrixCell | undefined): string {
  if (!cell) return '-'
  switch (cell.status) {
    case 'BELUM':
      return '-'
    case 'LUNAS':
      if (!cell.date) return 'LUNAS'
      return formatDayMonthYear(cell.date)
    case 'JUARA':
      return 'JUARA'
    case 'OSN':
      return 'OSN'
    case 'JUARA_UMUM':
      return 'JUARA UMUM'
    case 'BEASISWA':
      return 'BEASISWA'
    case 'KELUARGA_TIDAK_MAMPU':
      return 'KTM'
    case 'LAINNYA':
      return 'BEBAS'
    default:
      return '-'
  }
}

function formatDayMonthYear(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${dd}/${mm}/${yyyy}`
}

/** Build a "rombel label" like "X1" (without dot/space). */
export function formatRombelLabel(grade: Grade, nomor: number): string {
  return `${grade}${nomor}`
}
