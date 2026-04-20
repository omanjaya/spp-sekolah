import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { prisma } from '@/lib/db'
import { NotFoundError } from '@/core/errors'

export const dynamic = 'force-dynamic'

const filterSchema = z.object({
  rombelId: z.string().min(1),
  tahunAjaranId: z.string().min(1),
})

export interface PerRombelSiswaRow {
  siswaId: string
  nis: string
  nama: string
  statusSiswa: string
  totalBayar: number
  totalTunggakan: number
  totalBulan: number
  bulanBayar: number
  persentaseLunas: number
}

export interface PerRombelResult {
  rombelId: string
  rombelKode: string
  grade: string
  tahunAjaranKode: string
  nominalSppDefault: number
  totalBulan: number
  siswa: PerRombelSiswaRow[]
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU, ROLES.VIEWER])

  const raw = Object.fromEntries(req.nextUrl.searchParams)
  const { rombelId, tahunAjaranId } = filterSchema.parse(raw)

  // Load rombel + tahun ajaran
  const rombel = await prisma.rombel.findUnique({
    where: { id: rombelId },
    include: { tahunAjaran: true },
  })
  if (!rombel) throw new NotFoundError('Rombel tidak ditemukan.')

  const ta = rombel.tahunAjaranId === tahunAjaranId
    ? rombel.tahunAjaran
    : await prisma.tahunAjaran.findUnique({ where: { id: tahunAjaranId } })
  if (!ta) throw new NotFoundError('Tahun ajaran tidak ditemukan.')

  const nominalSppDefault = Number(ta.nominalSppDefault)

  // Build month range from tahun ajaran
  const start = new Date(ta.tanggalMulai)
  const end = new Date(ta.tanggalAkhir)
  const now = new Date()
  const effectiveEnd = end < now ? end : now

  const months: Array<{ year: number; month: number }> = []
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth() + 1
  const endY = effectiveEnd.getUTCFullYear()
  const endM = effectiveEnd.getUTCMonth() + 1
  while (y < endY || (y === endY && m <= endM)) {
    months.push({ year: y, month: m })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }

  const totalBulan = months.length

  // Load students enrolled in this rombel
  const enrollments = await prisma.enrollment.findMany({
    where: { rombelId, tahunAjaranId },
    include: {
      siswa: {
        select: { id: true, nis: true, nama: true, statusSiswa: true },
      },
    },
    orderBy: [{ siswa: { nama: 'asc' } }],
  })

  if (enrollments.length === 0) {
    return {
      rombelId,
      rombelKode: rombel.kode,
      grade: rombel.grade,
      tahunAjaranKode: ta.kode,
      nominalSppDefault,
      totalBulan,
      siswa: [],
    } satisfies PerRombelResult
  }

  const siswaIds = enrollments.map((e) => e.siswaId)
  const monthOR = months.map((p) => ({ periodYear: p.year, periodMonth: p.month }))

  // Load payments for all students in this rombel for the tahun ajaran period
  const [pembayarans, keringanans, pelunasans] = await Promise.all([
    prisma.pembayaran.findMany({
      where: {
        siswaId: { in: siswaIds },
        statusBayar: 'TERBAYAR',
        OR: monthOR.length > 0 ? monthOR : [{ periodYear: -1 }],
      },
      select: { siswaId: true, periodYear: true, periodMonth: true, amount: true },
    }),
    prisma.keringanan.findMany({
      where: {
        siswaId: { in: siswaIds },
        persentase: 100,
        OR: monthOR.length > 0 ? monthOR : [{ periodYear: -1 }],
      },
      select: { siswaId: true, periodYear: true, periodMonth: true },
    }),
    prisma.pelunasan.findMany({
      where: { siswaId: { in: siswaIds } },
      select: { siswaId: true, periodeMulai: true, periodeAkhir: true },
    }),
  ])

  // Build covered map per siswa
  const paidMap = new Map<string, Map<string, number>>() // siswaId -> "year-month" -> amount
  for (const p of pembayarans) {
    const m2 = paidMap.get(p.siswaId) ?? new Map<string, number>()
    m2.set(`${p.periodYear}-${p.periodMonth}`, Number(p.amount))
    paidMap.set(p.siswaId, m2)
  }

  const coveredMap = new Map<string, Set<string>>() // siswaId -> covered month keys
  const addCovered = (siswaId: string, key: string) => {
    const s = coveredMap.get(siswaId) ?? new Set<string>()
    s.add(key)
    coveredMap.set(siswaId, s)
  }

  for (const p of pembayarans) addCovered(p.siswaId, `${p.periodYear}-${p.periodMonth}`)
  for (const k of keringanans) addCovered(k.siswaId, `${k.periodYear}-${k.periodMonth}`)

  if (months.length > 0) {
    const rangeStartNum = months[0]!.year * 100 + months[0]!.month
    const rangeEndNum = months[months.length - 1]!.year * 100 + months[months.length - 1]!.month
    const monthKeySet = new Set(months.map((p) => `${p.year}-${p.month}`))

    for (const pl of pelunasans) {
      const parts1 = pl.periodeMulai.split('-').map((n) => Number(n))
      const parts2 = pl.periodeAkhir.split('-').map((n) => Number(n))
      const sy = parts1[0]; const sm = parts1[1]
      const ey = parts2[0]; const em = parts2[1]
      if (!sy || !sm || !ey || !em) continue
      const plStartNum = sy * 100 + sm
      const plEndNum = ey * 100 + em
      if (plEndNum < rangeStartNum || plStartNum > rangeEndNum) continue

      let py = plStartNum < rangeStartNum ? months[0]!.year : sy
      let pm = plStartNum < rangeStartNum ? months[0]!.month : sm
      const stopY = plEndNum > rangeEndNum ? months[months.length - 1]!.year : ey
      const stopM = plEndNum > rangeEndNum ? months[months.length - 1]!.month : em
      while (py < stopY || (py === stopY && pm <= stopM)) {
        const key = `${py}-${pm}`
        if (monthKeySet.has(key)) addCovered(pl.siswaId, key)
        pm += 1
        if (pm > 12) { pm = 1; py += 1 }
      }
    }
  }

  // Compute per-siswa summary
  const siswaRows: PerRombelSiswaRow[] = enrollments.map((e) => {
    const siswa = e.siswa
    const covered = coveredMap.get(siswa.id) ?? new Set<string>()
    const paid = paidMap.get(siswa.id) ?? new Map<string, number>()

    const bulanBayar = months.filter((p) => covered.has(`${p.year}-${p.month}`)).length
    const bulanTunggak = totalBulan - bulanBayar
    const totalBayar = Array.from(paid.values()).reduce((acc, v) => acc + v, 0)
    const totalTunggakan = bulanTunggak * nominalSppDefault
    const persentaseLunas = totalBulan > 0 ? Math.round((bulanBayar / totalBulan) * 100) : 0

    return {
      siswaId: siswa.id,
      nis: siswa.nis,
      nama: siswa.nama,
      statusSiswa: siswa.statusSiswa,
      totalBayar,
      totalTunggakan,
      totalBulan,
      bulanBayar,
      persentaseLunas,
    }
  })

  return {
    rombelId,
    rombelKode: rombel.kode,
    grade: rombel.grade,
    tahunAjaranKode: ta.kode,
    nominalSppDefault,
    totalBulan,
    siswa: siswaRows,
  } satisfies PerRombelResult
})
