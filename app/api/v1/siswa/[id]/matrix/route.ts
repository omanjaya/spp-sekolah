import { apiHandler, requireAuth } from '@/lib/api-handler'
import { NotFoundError } from '@/core/errors'
import { prisma } from '@/lib/db'
import {
  buildPeriodsForAngkatan,
  type MatrixCell,
  type MatrixCellStatus,
  type MatrixData,
  type MatrixRombelGroup,
  type MatrixSiswaRow,
} from '@/services/matrix-data.service'
import type { JenisKeringanan } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ─── Helpers (mirrors matrix-data.service.ts internals) ───────────────────────

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function periodMatches(pelunasanStart: string, pelunasanEnd: string, year: number, month: number): boolean {
  const current = monthKey(year, month)
  return current >= pelunasanStart && current <= pelunasanEnd
}

function mapKeringananToStatus(jenis: JenisKeringanan): MatrixCellStatus {
  return jenis
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const GET = apiHandler<unknown, { id: string }>(async (_req, ctx) => {
  await requireAuth()
  const { id } = await ctx.params

  // Fetch only the single student with all their payment-related data.
  // We grab ALL enrollments so we can build rombel groups for each class year.
  const siswa = await prisma.siswa.findUnique({
    where: { id },
    select: {
      id: true, nis: true, nama: true, angkatan: true,
      enrollments: {
        include: {
          rombel: { include: { tahunAjaran: true } },
        },
        orderBy: [{ noAbsen: 'asc' }],
      },
    },
  })

  if (!siswa) throw new NotFoundError('Siswa tidak ditemukan.')

  const { angkatan } = siswa
  const periods = buildPeriodsForAngkatan(angkatan)

  // Build period filter to avoid loading unbounded payment history
  const minP = periods[0]!
  const maxP = periods[periods.length - 1]!
  const periodOR = periods.map((p) => ({ periodYear: p.year, periodMonth: p.month }))

  const [pembayarans, keringanans, pelunasans] = await Promise.all([
    prisma.pembayaran.findMany({
      where: { siswaId: id, statusBayar: 'TERBAYAR', OR: periodOR },
      select: { periodYear: true, periodMonth: true, tanggalTransaksi: true, amount: true },
    }),
    prisma.keringanan.findMany({
      where: { siswaId: id, OR: periodOR },
      select: { periodYear: true, periodMonth: true, jenis: true, persentase: true },
    }),
    prisma.pelunasan.findMany({
      where: { siswaId: id },
      select: { periodeMulai: true, periodeAkhir: true, tanggalLunas: true },
    }),
  ])

  // Determine period boundaries for any future filtering (already fetched all above).
  // Build cells for this single student once — shared across all rombel rows.
  const cells: Record<string, MatrixCell> = {}

  for (const period of periods) {
    const mk = monthKey(period.year, period.month)

    // 1. Keringanan (highest priority)
    const keringanan = keringanans.find(
      (k) => k.periodYear === period.year && k.periodMonth === period.month
    )
    if (keringanan) {
      cells[mk] = { status: mapKeringananToStatus(keringanan.jenis) }
      continue
    }

    // 2. Pembayaran TERBAYAR
    const pembayaran = pembayarans.find(
      (p) => p.periodYear === period.year && p.periodMonth === period.month
    )
    if (pembayaran) {
      cells[mk] = {
        status: 'LUNAS',
        date: pembayaran.tanggalTransaksi,
        amount: Number(pembayaran.amount),
      }
      continue
    }

    // 3. Pelunasan covering this period
    const pelunasan = pelunasans.find((pel) =>
      periodMatches(pel.periodeMulai, pel.periodeAkhir, period.year, period.month)
    )
    if (pelunasan) {
      cells[mk] = { status: 'LUNAS', date: pelunasan.tanggalLunas }
      continue
    }

    // 4. Default
    cells[mk] = { status: 'BELUM' }
  }

  const siswaRow: MatrixSiswaRow = {
    id: siswa.id,
    nis: siswa.nis,
    nama: siswa.nama,
    noAbsen: null, // filled per-enrollment below
    rombelId: '', // filled per-enrollment below
    cells,
  }

  // Build one MatrixRombelGroup per enrollment (a student may have moved classes).
  const rombels: MatrixRombelGroup[] = siswa.enrollments.map((e) => ({
    rombelId: e.rombel.id,
    rombelKode: e.rombel.kode,
    grade: e.rombel.grade,
    nomor: e.rombel.nomor,
    waliKelas: e.rombel.waliKelas,
    tahunAjaranKode: e.rombel.tahunAjaran.kode,
    siswa: [
      {
        ...siswaRow,
        noAbsen: e.noAbsen,
        rombelId: e.rombel.id,
        cells: { ...cells },
      },
    ],
  }))

  const data: MatrixData = {
    angkatan,
    periods,
    rombels,
    generatedAt: new Date(),
  }

  return data
})
