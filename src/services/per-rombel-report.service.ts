/**
 * Per-Rombel Report — compute summary pembayaran per siswa untuk satu rombel.
 *
 * Diekstrak dari app/api/v1/reports/per-rombel/route.ts agar bisa dipakai
 * juga oleh route PDF (cetak per-rombel 1 lembar per rombel).
 */
import { prisma } from '@/lib/db'
import { NotFoundError } from '@/core/errors'

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

/**
 * Historical multi-TA report — output one page per tahun ajaran the cohort
 * (siswa di rombel target sekarang) has been through.
 *
 * - Kelas X (baru masuk): 1 halaman (TA aktif saja).
 * - Kelas XI: 2 halaman (TA tahun lalu + TA aktif).
 * - Kelas XII: 3 halaman.
 *
 * Siswa list di tiap halaman = kohort yang sekarang di rombel target.
 * Header per-halaman: TA kode + daftar rombel saat itu (multiple kalau cohort
 * sebelumnya tersebar).
 */
export interface PerRombelHistoryPage {
  tahunAjaranId: string
  tahunAjaranKode: string
  /** Rombel yang dihuni anggota kohort di TA ini (bisa lebih dari satu). */
  rombelKodes: string[]
  nominalSppDefault: number
  totalBulan: number
  siswa: PerRombelSiswaRow[]
}

export interface PerRombelHistoryResult {
  rombelId: string
  rombelKode: string
  grade: string
  currentTahunAjaranKode: string
  pages: PerRombelHistoryPage[]
}

export async function computePerRombelReport(
  rombelId: string,
  tahunAjaranId: string,
): Promise<PerRombelResult> {
  const rombel = await prisma.rombel.findUnique({
    where: { id: rombelId },
    include: { tahunAjaran: true },
  })
  if (!rombel) throw new NotFoundError('Rombel tidak ditemukan.')

  const ta =
    rombel.tahunAjaranId === tahunAjaranId
      ? rombel.tahunAjaran
      : await prisma.tahunAjaran.findUnique({ where: { id: tahunAjaranId } })
  if (!ta) throw new NotFoundError('Tahun ajaran tidak ditemukan.')

  const nominalSppDefault = Number(ta.nominalSppDefault)

  // Build month range from tahun ajaran (capped at "now")
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
    if (m > 12) {
      m = 1
      y += 1
    }
  }

  const totalBulan = months.length

  const enrollments = await prisma.enrollment.findMany({
    where: { rombelId, tahunAjaranId },
    include: {
      siswa: { select: { id: true, nis: true, nama: true, statusSiswa: true } },
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
    }
  }

  const siswaIds = enrollments.map((e) => e.siswaId)
  const monthOR = months.map((p) => ({ periodYear: p.year, periodMonth: p.month }))

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

  const paidMap = new Map<string, Map<string, number>>()
  for (const p of pembayarans) {
    const m2 = paidMap.get(p.siswaId) ?? new Map<string, number>()
    m2.set(`${p.periodYear}-${p.periodMonth}`, Number(p.amount))
    paidMap.set(p.siswaId, m2)
  }

  const coveredMap = new Map<string, Set<string>>()
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
      const sy = parts1[0]
      const sm = parts1[1]
      const ey = parts2[0]
      const em = parts2[1]
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
        if (pm > 12) {
          pm = 1
          py += 1
        }
      }
    }
  }

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
  }
}

/**
 * Multi-TA history report. Kohort = siswa yang sekarang ada di rombel target.
 * Output: 1 halaman per TA yang sudah dilalui kohort (X=1, XI=2, XII=3).
 */
export async function computePerRombelHistory(
  rombelId: string,
  tahunAjaranId: string,
): Promise<PerRombelHistoryResult> {
  const rombel = await prisma.rombel.findUnique({ where: { id: rombelId } })
  if (!rombel) throw new NotFoundError('Rombel tidak ditemukan.')

  const currentTa = await prisma.tahunAjaran.findUnique({ where: { id: tahunAjaranId } })
  if (!currentTa) throw new NotFoundError('Tahun ajaran tidak ditemukan.')

  // 1) Kohort siswa = siswa di rombel target pada TA saat ini
  const cohortEnrollments = await prisma.enrollment.findMany({
    where: { rombelId, tahunAjaranId },
    include: { siswa: { select: { id: true, nis: true, nama: true, statusSiswa: true } } },
    orderBy: [{ siswa: { nama: 'asc' } }],
  })
  if (cohortEnrollments.length === 0) {
    return {
      rombelId,
      rombelKode: rombel.kode,
      grade: rombel.grade,
      currentTahunAjaranKode: currentTa.kode,
      pages: [],
    }
  }
  const siswaIds = cohortEnrollments.map((e) => e.siswaId)
  const siswaById = new Map<string, { id: string; nis: string; nama: string; statusSiswa: string }>()
  for (const e of cohortEnrollments) siswaById.set(e.siswaId, e.siswa)

  // 2) Ambil semua enrollment siswa kohort lintas TA (untuk header & filter TA)
  const allEnrollments = await prisma.enrollment.findMany({
    where: { siswaId: { in: siswaIds } },
    include: {
      rombel: { select: { kode: true } },
      tahunAjaran: {
        select: { id: true, kode: true, tanggalMulai: true, tanggalAkhir: true, nominalSppDefault: true },
      },
    },
  })

  // 3) Kumpulkan TA unik yang ≤ currentTa.tanggalAkhir (mundur historis sampai sekarang)
  const taMap = new Map<
    string,
    {
      id: string
      kode: string
      tanggalMulai: Date
      tanggalAkhir: Date
      nominalSppDefault: number
      rombelKodes: Set<string>
    }
  >()
  const currentEnd = new Date(currentTa.tanggalAkhir)
  for (const e of allEnrollments) {
    const ta = e.tahunAjaran
    if (new Date(ta.tanggalMulai) > currentEnd) continue
    let entry = taMap.get(ta.id)
    if (!entry) {
      entry = {
        id: ta.id,
        kode: ta.kode,
        tanggalMulai: new Date(ta.tanggalMulai),
        tanggalAkhir: new Date(ta.tanggalAkhir),
        nominalSppDefault: Number(ta.nominalSppDefault),
        rombelKodes: new Set<string>(),
      }
      taMap.set(ta.id, entry)
    }
    if (e.rombel?.kode) entry.rombelKodes.add(e.rombel.kode)
  }
  const sortedTas = Array.from(taMap.values()).sort(
    (a, b) => a.tanggalMulai.getTime() - b.tanggalMulai.getTime(),
  )

  // 4) Pre-load semua pembayaran, keringanan, pelunasan untuk siswa kohort
  const [allPembayarans, allKeringanans, allPelunasans] = await Promise.all([
    prisma.pembayaran.findMany({
      where: { siswaId: { in: siswaIds }, statusBayar: 'TERBAYAR' },
      select: { siswaId: true, periodYear: true, periodMonth: true, amount: true },
    }),
    prisma.keringanan.findMany({
      where: { siswaId: { in: siswaIds }, persentase: 100 },
      select: { siswaId: true, periodYear: true, periodMonth: true },
    }),
    prisma.pelunasan.findMany({
      where: { siswaId: { in: siswaIds } },
      select: { siswaId: true, periodeMulai: true, periodeAkhir: true },
    }),
  ])

  // 5) Untuk setiap TA, hitung pages
  const now = new Date()
  const pages: PerRombelHistoryPage[] = []

  for (const ta of sortedTas) {
    // Build months range capped at "now"
    const effectiveEnd = ta.tanggalAkhir < now ? ta.tanggalAkhir : now
    if (effectiveEnd < ta.tanggalMulai) continue

    const months: Array<{ year: number; month: number }> = []
    let y = ta.tanggalMulai.getUTCFullYear()
    let m = ta.tanggalMulai.getUTCMonth() + 1
    const endY = effectiveEnd.getUTCFullYear()
    const endM = effectiveEnd.getUTCMonth() + 1
    while (y < endY || (y === endY && m <= endM)) {
      months.push({ year: y, month: m })
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
    const totalBulan = months.length
    const monthKeySet = new Set(months.map((p) => `${p.year}-${p.month}`))

    // Covered map for this TA (per siswa)
    const paidMap = new Map<string, Map<string, number>>()
    const coveredMap = new Map<string, Set<string>>()
    const addCovered = (sid: string, key: string) => {
      const s = coveredMap.get(sid) ?? new Set<string>()
      s.add(key)
      coveredMap.set(sid, s)
    }

    for (const p of allPembayarans) {
      const key = `${p.periodYear}-${p.periodMonth}`
      if (!monthKeySet.has(key)) continue
      const m2 = paidMap.get(p.siswaId) ?? new Map<string, number>()
      m2.set(key, Number(p.amount))
      paidMap.set(p.siswaId, m2)
      addCovered(p.siswaId, key)
    }
    for (const k of allKeringanans) {
      const key = `${k.periodYear}-${k.periodMonth}`
      if (!monthKeySet.has(key)) continue
      addCovered(k.siswaId, key)
    }
    if (months.length > 0) {
      const rangeStartNum = months[0]!.year * 100 + months[0]!.month
      const rangeEndNum = months[months.length - 1]!.year * 100 + months[months.length - 1]!.month
      for (const pl of allPelunasans) {
        const parts1 = pl.periodeMulai.split('-').map((n) => Number(n))
        const parts2 = pl.periodeAkhir.split('-').map((n) => Number(n))
        const sy = parts1[0]
        const sm = parts1[1]
        const ey = parts2[0]
        const em = parts2[1]
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
          if (pm > 12) {
            pm = 1
            py += 1
          }
        }
      }
    }

    const siswaRows: PerRombelSiswaRow[] = siswaIds.map((sid) => {
      const siswa = siswaById.get(sid)!
      const covered = coveredMap.get(sid) ?? new Set<string>()
      const paid = paidMap.get(sid) ?? new Map<string, number>()
      const bulanBayar = months.filter((p) => covered.has(`${p.year}-${p.month}`)).length
      const bulanTunggak = totalBulan - bulanBayar
      const totalBayar = Array.from(paid.values()).reduce((acc, v) => acc + v, 0)
      const totalTunggakan = bulanTunggak * ta.nominalSppDefault
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

    pages.push({
      tahunAjaranId: ta.id,
      tahunAjaranKode: ta.kode,
      rombelKodes: Array.from(ta.rombelKodes).sort(),
      nominalSppDefault: ta.nominalSppDefault,
      totalBulan,
      siswa: siswaRows,
    })
  }

  return {
    rombelId,
    rombelKode: rombel.kode,
    grade: rombel.grade,
    currentTahunAjaranKode: currentTa.kode,
    pages,
  }
}
