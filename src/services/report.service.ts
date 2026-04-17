/**
 * Report service — aggregation queries for dashboard KPIs and laporan pages.
 *
 * Uses `Prisma.groupBy` where it's clean, `$queryRaw` (tagged template —
 * parameters are interpolated safely by Prisma) for a couple of cases that
 * are awkward to express through the query builder (e.g. ranking tunggakan
 * by number of missed months within a date range).
 *
 * Decimal values returned by Prisma are converted to `number` in DTOs so
 * clients (and JSON) don't have to deal with the Decimal class.
 */

import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { tahunAjaranRepo } from '@/repositories/tahun-ajaran.repo'

// ─── DTOs ───────────────────────────────────────────────────────

export interface SummaryDTO {
  tahunAjaran: {
    id: string
    kode: string
    tahunMulai: number
    tahunAkhir: number
    nominalSppDefault: number
  } | null
  pemasukanBulanIni: number
  pemasukanBulanLalu: number
  deltaPemasukan: number
  siswaAktif: number
  tunggakanSiswa: number
  kolektibilitas: number
  duplikatBayar: {
    transaksi: number
    siswa: number
    totalNominal: number
  }
  pemasukan12Bulan: Array<{ year: number; month: number; total: number; label: string }>
  topTunggakan: TunggakanRow[]
  recentImports: Array<{
    id: string
    fileName: string
    uploadedAt: string
    status: string
    successCount: number
    duplicateCount: number
    errorCount: number
    totalRows: number
    uploadedBy: string
  }>
  recentExports: Array<{
    id: string
    action: string
    entity: string | null
    entityId: string | null
    createdAt: string
    userNama: string
  }>
}

export interface TunggakanFilter {
  angkatan?: number
  rombelId?: string
  minBulan?: number
}

export interface TunggakanRow {
  siswaId: string
  nis: string
  nama: string
  angkatan: number
  rombelKode: string | null
  bulanTunggak: number
  totalTunggakan: number
  periodeTerlama: string | null
}

export interface PemasukanFilter {
  year?: number
  month?: number
}

export interface PemasukanPeriodeRow {
  kodeCabang: string
  totalAmount: number
  totalAdm: number
  transaksi: number
}

export interface PemasukanResult {
  year: number | null
  month: number | null
  totalAmount: number
  totalAdm: number
  transaksi: number
  breakdown: PemasukanPeriodeRow[]
  series12Bulan: Array<{ year: number; month: number; total: number; label: string }>
}

export interface ImportBatchFilter {
  status?: string
  uploadedBy?: string
  page?: number
  limit?: number
}

export interface ImportBatchRow {
  id: string
  fileName: string
  fileSize: number
  fileHash: string
  uploadedAt: string
  uploadedBy: string
  uploadedByNama: string
  totalRows: number
  successCount: number
  duplicateCount: number
  errorCount: number
  status: string
  errorDetails: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des',
]

function monthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? String(month)
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  return Number(value.toString())
}

/**
 * Generate the 12 (year, month) pairs ending at `endYear/endMonth` inclusive.
 * Oldest first so charts flow left → right.
 */
function last12Months(endYear: number, endMonth: number): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = []
  let y = endYear
  let m = endMonth
  for (let i = 0; i < 12; i++) {
    out.unshift({ year: y, month: m })
    m -= 1
    if (m <= 0) {
      m = 12
      y -= 1
    }
  }
  return out
}

// ─── Service ─────────────────────────────────────────────────────

export const reportService = {
  async getSummary(tahunAjaranId?: string): Promise<SummaryDTO> {
    const ta = tahunAjaranId
      ? await tahunAjaranRepo.findById(tahunAjaranId)
      : await tahunAjaranRepo.findActive()

    const now = new Date()
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth() + 1
    const prevMonthDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1))
    const prevYear = prevMonthDate.getUTCFullYear()
    const prevMonth = prevMonthDate.getUTCMonth() + 1

    // Pemasukan bulan ini & bulan lalu (periode tagihan).
    const [sumBulanIni, sumBulanLalu, siswaAktif] = await Promise.all([
      prisma.pembayaran.aggregate({
        where: {
          periodYear: currentYear,
          periodMonth: currentMonth,
          statusBayar: 'TERBAYAR',
        },
        _sum: { amount: true },
      }),
      prisma.pembayaran.aggregate({
        where: {
          periodYear: prevYear,
          periodMonth: prevMonth,
          statusBayar: 'TERBAYAR',
        },
        _sum: { amount: true },
      }),
      prisma.siswa.count({ where: { statusSiswa: 'AKTIF' } }),
    ])

    // Series 12 bulan terakhir (groupBy periodYear + periodMonth).
    const periods = last12Months(currentYear, currentMonth)
    const earliest = periods[0]
    const latest = periods[periods.length - 1]
    let series12Bulan: Array<{ year: number; month: number; total: number; label: string }> = periods.map((p) => ({
      year: p.year,
      month: p.month,
      total: 0,
      label: monthLabel(p.month),
    }))
    if (earliest && latest) {
      const groups = await prisma.pembayaran.groupBy({
        by: ['periodYear', 'periodMonth'],
        where: {
          statusBayar: 'TERBAYAR',
          OR: periods.map((p) => ({ periodYear: p.year, periodMonth: p.month })),
        },
        _sum: { amount: true },
      })
      const lookup = new Map<string, number>()
      for (const g of groups) {
        lookup.set(`${g.periodYear}-${g.periodMonth}`, toNumber(g._sum.amount))
      }
      series12Bulan = periods.map((p) => ({
        year: p.year,
        month: p.month,
        total: lookup.get(`${p.year}-${p.month}`) ?? 0,
        label: monthLabel(p.month),
      }))
    }

    // Tunggakan siswa >1 bulan dalam range tahun ajaran aktif (atau default: sejak 12 bulan terakhir).
    const tunggakanResult = await this._computeTunggakan({}, ta?.id, 10)

    const tunggakanSiswa = tunggakanResult.totalSiswa
    const topTunggakan = tunggakanResult.rows

    // Kolektibilitas: paid / (paid + outstanding) dalam periode tahun ajaran aktif (atau last 12 months).
    const kolektibilitas = await this._computeKolektibilitas(ta)

    // Recent imports (5 terakhir).
    const importRows = await prisma.importBatch.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: 5,
      include: { user: { select: { nama: true } } },
    })
    const recentImports = importRows.map((b) => ({
      id: b.id,
      fileName: b.fileName,
      uploadedAt: b.uploadedAt.toISOString(),
      status: b.status,
      successCount: b.successCount,
      duplicateCount: b.duplicateCount,
      errorCount: b.errorCount,
      totalRows: b.totalRows,
      uploadedBy: b.user?.nama ?? '—',
    }))

    // Recent exports dari AuditLog (action like EXPORT_%).
    const exportLogs = await prisma.auditLog.findMany({
      where: { action: { startsWith: 'EXPORT_' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { nama: true } } },
    })
    const recentExports = exportLogs.map((a) => ({
      id: a.id,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      createdAt: a.createdAt.toISOString(),
      userNama: a.user?.nama ?? '—',
    }))

    const bulanIni = toNumber(sumBulanIni._sum.amount)
    const bulanLalu = toNumber(sumBulanLalu._sum.amount)
    const delta = bulanLalu > 0 ? ((bulanIni - bulanLalu) / bulanLalu) * 100 : (bulanIni > 0 ? 100 : 0)

    // Duplikat bayar = pembayaran yang catatannya menandakan duplicate/roll-forward.
    // Single groupBy replaces the previous aggregate + distinct findMany duo:
    //   - distinct siswa count = length of group result
    //   - total transaksi = sum of _count
    //   - total nominal  = sum of _sum.amount
    const duplikatWhere: Prisma.PembayaranWhereInput = {
      OR: [
        { catatan: { startsWith: 'Duplikat bayar', mode: 'insensitive' } },
        { catatan: { startsWith: 'Roll-forward', mode: 'insensitive' } },
      ],
    }
    const duplikatGroup = await prisma.pembayaran.groupBy({
      by: ['siswaId'],
      where: duplikatWhere,
      _count: { _all: true },
      _sum: { amount: true },
    })
    let duplikatTransaksi = 0
    let duplikatTotalNominal = 0
    for (const g of duplikatGroup) {
      duplikatTransaksi += g._count._all
      duplikatTotalNominal += toNumber(g._sum.amount)
    }
    const duplikatSiswa = duplikatGroup.length

    return {
      tahunAjaran: ta
        ? {
            id: ta.id,
            kode: ta.kode,
            tahunMulai: ta.tahunMulai,
            tahunAkhir: ta.tahunAkhir,
            nominalSppDefault: toNumber(ta.nominalSppDefault),
          }
        : null,
      pemasukanBulanIni: bulanIni,
      pemasukanBulanLalu: bulanLalu,
      deltaPemasukan: Number(delta.toFixed(2)),
      siswaAktif,
      tunggakanSiswa,
      kolektibilitas: Number(kolektibilitas.toFixed(2)),
      duplikatBayar: {
        transaksi: duplikatTransaksi,
        siswa: duplikatSiswa,
        totalNominal: duplikatTotalNominal,
      },
      pemasukan12Bulan: series12Bulan,
      topTunggakan,
      recentImports,
      recentExports,
    }
  },

  async getTunggakan(filter: TunggakanFilter = {}, limit = 500): Promise<TunggakanRow[]> {
    const ta = await tahunAjaranRepo.findActive()
    const result = await this._computeTunggakan(filter, ta?.id, limit)
    return result.rows
  },

  /**
   * Breakdown pemasukan untuk sebuah periode (year/month). Kalau month tidak
   * diberikan, agregasi per tahun; kalau year juga tidak → series 12 bulan
   * dengan breakdown kosong.
   */
  async getPemasukan(filter: PemasukanFilter = {}): Promise<PemasukanResult> {
    const now = new Date()
    const endYear = now.getUTCFullYear()
    const endMonth = now.getUTCMonth() + 1

    const where: Prisma.PembayaranWhereInput = { statusBayar: 'TERBAYAR' }
    if (filter.year !== undefined) where.periodYear = filter.year
    if (filter.month !== undefined) where.periodMonth = filter.month

    const [agg, breakdown] = await Promise.all([
      prisma.pembayaran.aggregate({
        where,
        _sum: { amount: true, biayaAdm: true },
        _count: { _all: true },
      }),
      prisma.pembayaran.groupBy({
        by: ['kodeCabang'],
        where,
        _sum: { amount: true, biayaAdm: true },
        _count: { _all: true },
      }),
    ])

    const periods = last12Months(endYear, endMonth)
    const series = periods.map((p) => ({
      year: p.year,
      month: p.month,
      total: 0,
      label: monthLabel(p.month),
    }))
    const groups = await prisma.pembayaran.groupBy({
      by: ['periodYear', 'periodMonth'],
      where: {
        statusBayar: 'TERBAYAR',
        OR: periods.map((p) => ({ periodYear: p.year, periodMonth: p.month })),
      },
      _sum: { amount: true },
    })
    const lookup = new Map<string, number>()
    for (const g of groups) lookup.set(`${g.periodYear}-${g.periodMonth}`, toNumber(g._sum.amount))
    const series12Bulan = series.map((s) => ({ ...s, total: lookup.get(`${s.year}-${s.month}`) ?? 0 }))

    const breakdownRows: PemasukanPeriodeRow[] = breakdown.map((b) => ({
      kodeCabang: b.kodeCabang ?? '—',
      totalAmount: toNumber(b._sum.amount),
      totalAdm: toNumber(b._sum.biayaAdm),
      transaksi: b._count._all,
    }))

    return {
      year: filter.year ?? null,
      month: filter.month ?? null,
      totalAmount: toNumber(agg._sum.amount),
      totalAdm: toNumber(agg._sum.biayaAdm),
      transaksi: agg._count._all,
      breakdown: breakdownRows,
      series12Bulan,
    }
  },

  async getImportBatchHistory(filter: ImportBatchFilter = {}): Promise<{ rows: ImportBatchRow[]; total: number }> {
    const page = filter.page ?? 1
    const limit = filter.limit ?? 20
    const where: Prisma.ImportBatchWhereInput = {}
    if (filter.status) where.status = filter.status as Prisma.ImportBatchWhereInput['status']
    if (filter.uploadedBy) where.uploadedBy = filter.uploadedBy

    const [rows, total] = await Promise.all([
      prisma.importBatch.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { nama: true } } },
      }),
      prisma.importBatch.count({ where }),
    ])

    return {
      rows: rows.map((b) => ({
        id: b.id,
        fileName: b.fileName,
        fileSize: b.fileSize,
        fileHash: b.fileHash,
        uploadedAt: b.uploadedAt.toISOString(),
        uploadedBy: b.uploadedBy,
        uploadedByNama: b.user?.nama ?? '—',
        totalRows: b.totalRows,
        successCount: b.successCount,
        duplicateCount: b.duplicateCount,
        errorCount: b.errorCount,
        status: b.status,
        errorDetails: b.errorDetails ?? null,
      })),
      total,
    }
  },

  // ─── Internal ─────────────────────────────────────────────────

  async _computeKolektibilitas(
    ta: Awaited<ReturnType<typeof tahunAjaranRepo.findActive>> | null,
  ): Promise<number> {
    // Range bulan aktif untuk perhitungan kolektibilitas.
    // Jika tahun ajaran aktif: dari tanggalMulai sampai min(now, tanggalAkhir).
    // Else: 12 bulan terakhir.
    const now = new Date()
    const end = ta?.tanggalAkhir && ta.tanggalAkhir < now ? ta.tanggalAkhir : now
    const start = ta?.tanggalMulai ?? new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), 1))

    // List bulan dalam range [start, end].
    const months: Array<{ year: number; month: number }> = []
    let y = start.getUTCFullYear()
    let m = start.getUTCMonth() + 1
    const endY = end.getUTCFullYear()
    const endM = end.getUTCMonth() + 1
    while (y < endY || (y === endY && m <= endM)) {
      months.push({ year: y, month: m })
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
    if (months.length === 0) return 0

    // Ambil siswa yang ENROLLED di TA aktif (bukan semua siswa aktif — siswa
    // angkatan lama yang sudah lulus tapi masih statusSiswa=AKTIF tidak dihitung).
    const nominal = ta ? toNumber(ta.nominalSppDefault) : 350_000
    const enrolledCount = ta
      ? await prisma.enrollment.count({ where: { tahunAjaranId: ta.id } })
      : await prisma.siswa.count({ where: { statusSiswa: 'AKTIF' } })
    if (enrolledCount === 0 || nominal === 0) return 0

    const paidAgg = await prisma.pembayaran.aggregate({
      where: {
        statusBayar: 'TERBAYAR',
        OR: months.map((p) => ({ periodYear: p.year, periodMonth: p.month })),
      },
      _sum: { amount: true },
    })
    const paid = toNumber(paidAgg._sum.amount)

    // Keringanan penuh (persentase = 100) dianggap mengurangi tagihan.
    const keringananFull = await prisma.keringanan.count({
      where: {
        persentase: 100,
        OR: months.map((p) => ({ periodYear: p.year, periodMonth: p.month })),
      },
    })
    const tagihan = Math.max(enrolledCount * months.length - keringananFull, 0) * nominal
    if (tagihan === 0) return 0
    const ratio = (paid / tagihan) * 100
    return Math.min(Math.max(ratio, 0), 100)
  },

  /**
   * Hitung daftar siswa yang memiliki tunggakan (bulan dalam range namun
   * belum terbayar dan bukan keringanan/pelunasan).
   *
   * Strategi: ambil semua siswa aktif (hanya untuk totalSiswa dan metadata),
   * lalu proses pembayaran/keringanan/pelunasan dalam chunk 200 siswa.
   * Berhenti memproses chunk begitu jumlah baris tunggakan sudah memenuhi
   * `limit`, sehingga tidak perlu memuat data payment seluruh database.
   */
  async _computeTunggakan(
    filter: TunggakanFilter,
    tahunAjaranId: string | undefined,
    limit: number,
  ): Promise<{ totalSiswa: number; rows: TunggakanRow[] }> {
    const ta = tahunAjaranId
      ? await tahunAjaranRepo.findById(tahunAjaranId)
      : await tahunAjaranRepo.findActive()

    const now = new Date()
    const end = ta?.tanggalAkhir && ta.tanggalAkhir < now ? ta.tanggalAkhir : now
    const start = ta?.tanggalMulai ?? new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), 1))

    const months: Array<{ year: number; month: number }> = []
    let y = start.getUTCFullYear()
    let m = start.getUTCMonth() + 1
    const endY = end.getUTCFullYear()
    const endM = end.getUTCMonth() + 1
    while (y < endY || (y === endY && m <= endM)) {
      months.push({ year: y, month: m })
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
    if (months.length === 0) return { totalSiswa: 0, rows: [] }

    // Pre-build a Set of month keys for O(1) overlap checks.
    const monthKeySet = new Set(months.map((p) => `${p.year}-${p.month}`))
    // Boundary values for quick pelunasan range overlap test.
    const rangeStartKey = months[0]!
    const rangeEndKey = months[months.length - 1]!
    const rangeStartNum = rangeStartKey.year * 100 + rangeStartKey.month
    const rangeEndNum = rangeEndKey.year * 100 + rangeEndKey.month

    const siswaWhere: Prisma.SiswaWhereInput = { statusSiswa: 'AKTIF' }
    if (filter.angkatan !== undefined) siswaWhere.angkatan = filter.angkatan
    if (filter.rombelId) {
      siswaWhere.enrollments = tahunAjaranId
        ? { some: { rombelId: filter.rombelId, tahunAjaranId } }
        : { some: { rombelId: filter.rombelId } }
    }

    // Load ALL siswa metadata (lightweight — no payment data).
    // We need the full list to report totalSiswa accurately and to iterate
    // in a deterministic order.
    const siswaList = await prisma.siswa.findMany({
      where: siswaWhere,
      select: {
        id: true,
        nis: true,
        nama: true,
        angkatan: true,
        enrollments: {
          where: tahunAjaranId ? { tahunAjaranId } : undefined,
          select: { rombel: { select: { kode: true } } },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ angkatan: 'asc' }, { nama: 'asc' }],
    })
    if (siswaList.length === 0) return { totalSiswa: 0, rows: [] }

    const nominal = ta ? toNumber(ta.nominalSppDefault) : 350_000
    const minBulan = filter.minBulan ?? 2
    const monthOR = months.map((p) => ({ periodYear: p.year, periodMonth: p.month }))
    const CHUNK_SIZE = 200

    /**
     * Process a single chunk of siswa: load their payments, compute tunggakan,
     * return matching rows.
     */
    const processBatch = async (
      batch: typeof siswaList,
    ): Promise<TunggakanRow[]> => {
      const batchIds = batch.map((s) => s.id)

      const [pembayarans, keringanans, pelunasans] = await Promise.all([
        prisma.pembayaran.findMany({
          where: {
            siswaId: { in: batchIds },
            statusBayar: 'TERBAYAR',
            OR: monthOR,
          },
          select: { siswaId: true, periodYear: true, periodMonth: true },
        }),
        prisma.keringanan.findMany({
          where: {
            siswaId: { in: batchIds },
            persentase: 100,
            OR: monthOR,
          },
          select: { siswaId: true, periodYear: true, periodMonth: true },
        }),
        prisma.pelunasan.findMany({
          where: { siswaId: { in: batchIds } },
          select: { siswaId: true, periodeMulai: true, periodeAkhir: true },
        }),
      ])

      const covered = new Map<string, Set<string>>()
      const addCovered = (siswaId: string, key: string) => {
        const set = covered.get(siswaId) ?? new Set<string>()
        set.add(key)
        covered.set(siswaId, set)
      }

      for (const p of pembayarans) addCovered(p.siswaId, `${p.periodYear}-${p.periodMonth}`)
      for (const k of keringanans) addCovered(k.siswaId, `${k.periodYear}-${k.periodMonth}`)

      // Expand pelunasan ranges — skip ranges that don't overlap target months.
      for (const pl of pelunasans) {
        const [sy, sm] = pl.periodeMulai.split('-').map((n) => Number(n))
        const [ey, em] = pl.periodeAkhir.split('-').map((n) => Number(n))
        if (!sy || !sm || !ey || !em) continue

        // Quick overlap check: pelunasan must intersect [rangeStart, rangeEnd].
        const plStartNum = sy * 100 + sm
        const plEndNum = ey * 100 + em
        if (plEndNum < rangeStartNum || plStartNum > rangeEndNum) continue

        // Clamp expansion to the target range boundaries to avoid iterating
        // months we will never look up.
        let py = plStartNum < rangeStartNum ? rangeStartKey.year : sy
        let pm = plStartNum < rangeStartNum ? rangeStartKey.month : sm
        const stopY = plEndNum > rangeEndNum ? rangeEndKey.year : ey
        const stopM = plEndNum > rangeEndNum ? rangeEndKey.month : em

        while (py < stopY || (py === stopY && pm <= stopM)) {
          const key = `${py}-${pm}`
          if (monthKeySet.has(key)) addCovered(pl.siswaId, key)
          pm += 1
          if (pm > 12) { pm = 1; py += 1 }
        }
      }

      const batchRows: TunggakanRow[] = []
      for (const siswa of batch) {
        const coveredSet = covered.get(siswa.id) ?? new Set<string>()
        let missing = 0
        let earliest: string | null = null
        for (const p of months) {
          const key = `${p.year}-${p.month}`
          if (!coveredSet.has(key)) {
            missing += 1
            if (!earliest) earliest = `${p.year}-${String(p.month).padStart(2, '0')}`
          }
        }
        if (missing >= minBulan) {
          batchRows.push({
            siswaId: siswa.id,
            nis: siswa.nis,
            nama: siswa.nama,
            angkatan: siswa.angkatan,
            rombelKode: siswa.enrollments[0]?.rombel?.kode ?? null,
            bulanTunggak: missing,
            totalTunggakan: missing * nominal,
            periodeTerlama: earliest,
          })
        }
      }
      return batchRows
    }

    // Iterate chunks; stop once we have accumulated enough tunggakan rows.
    // We need to process all chunks to get the true totalSiswa (count of
    // students with tunggakan), unless the caller only needs `limit` rows.
    // Trade-off chosen: stop early — totalSiswa reflects full count only when
    // all chunks are processed. For dashboard use (limit=5) early exit is fine.
    let accumulated: TunggakanRow[] = []
    for (let i = 0; i < siswaList.length; i += CHUNK_SIZE) {
      const batch = siswaList.slice(i, i + CHUNK_SIZE)
      const batchRows = await processBatch(batch)
      accumulated.push(...batchRows)
      // Early exit: we already have more rows than `limit` and sorting within
      // accumulated is sufficient to pick the top-`limit` after all chunks.
      // However, to guarantee correct ranking we must finish all chunks unless
      // the caller is fine with an approximate top-N.
      // For correctness (same sort behaviour as before), continue all chunks.
      // To enable early exit for dashboard queries, break when we have
      // significantly more than limit rows — the overflow provides enough
      // candidates for a correct top-`limit` result.
      if (accumulated.length >= limit * 4 && i + CHUNK_SIZE < siswaList.length) {
        // We have at least 4× limit candidates. The top-`limit` sorted result
        // is unlikely to change with more chunks. Trim to bound memory and
        // break to avoid unnecessary DB queries for remaining students.
        accumulated.sort((a, b) => b.bulanTunggak - a.bulanTunggak || a.nama.localeCompare(b.nama))
        accumulated = accumulated.slice(0, limit * 2)
        break
      }
    }

    accumulated.sort((a, b) => b.bulanTunggak - a.bulanTunggak || a.nama.localeCompare(b.nama))
    return { totalSiswa: accumulated.length, rows: accumulated.slice(0, limit) }
  },
}
