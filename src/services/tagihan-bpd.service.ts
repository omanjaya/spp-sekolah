import { prisma } from '@/lib/db'
import type { TagihanBpdParseResult } from '@/lib/excel/tagihan-bpd-parser'

export type ReviewStatus = 'tetap' | 'dihapus_rekonsiliasi' | 'dihapus_manual'
export type TagihanSumber = 'BPD' | 'MANUAL' | 'AUTO_GENERATE'

export interface ReviewRow {
  nis: string
  nama: string
  tahun: number
  bulan: number
  kelas: string
  jurusan: string
  nominal: number
  keterangan: string
  instansi: string
  alamat: string
  sumber: TagihanSumber
  status: ReviewStatus
  alasan?: string
}

export interface TagihanReviewResult {
  rows: ReviewRow[]
  counts: { tetap: number; dihapus_rekonsiliasi: number; dihapus_manual: number }
  lastImportAt: string | null
}

export interface ImportTagihanResult {
  importBatchId: string
  totalRows: number
  upserted: number
  skipped: number
}

export async function importTagihanBpd(
  parsed: TagihanBpdParseResult,
  fileName: string,
  fileSize: number,
  actor: { id: string; nama: string },
): Promise<ImportTagihanResult> {
  // Strategi baru: hanya hapus & ganti row dengan sumber = 'BPD'.
  // Row MANUAL / AUTO_GENERATE dipertahankan supaya user tidak kehilangan
  // tagihan yang dibuat manual atau bulk-generated antar cycle import BPD.
  //
  // Konflik (NIS + periode) antara file BPD baru dan row MANUAL/AUTO
  // yang sudah ada: BPD menang — row di-UPDATE dan sumber-nya di-upgrade
  // ke 'BPD' (BPD sekarang punya = tidak perlu antrian manual lagi).
  const result = await prisma.$transaction(async (tx) => {
    // Hapus HANYA row sumber = BPD (bekas import BPD sebelumnya)
    await tx.tagihanBpdMaster.deleteMany({ where: { sumber: 'BPD' } })

    // Buat batch baru
    const batch = await tx.tagihanBpdImportBatch.create({
      data: {
        fileName,
        fileSize,
        fileHash: parsed.fileHash,
        importedBy: actor.id,
        totalRows: parsed.totalRows,
      },
    })

    let upserted = 0
    let skipped = 0

    // Untuk setiap row di file: upsert. Kalau ada row MANUAL/AUTO_GENERATE
    // dengan (nis, tahun, bulan) yang sama → di-update jadi BPD.
    for (const row of parsed.rows) {
      try {
        await tx.tagihanBpdMaster.upsert({
          where: {
            nis_tahun_bulan: { nis: row.nis, tahun: row.tahun, bulan: row.bulan },
          },
          create: {
            importBatchId: batch.id,
            nis: row.nis,
            nama: row.nama,
            tahun: row.tahun,
            bulan: row.bulan,
            kelas: row.kelas,
            jurusan: row.jurusan,
            nominal: row.nominal,
            keterangan: row.keterangan,
            instansi: row.instansi,
            alamat: row.alamat,
            sumber: 'BPD',
          },
          update: {
            importBatchId: batch.id,
            nama: row.nama,
            kelas: row.kelas,
            jurusan: row.jurusan,
            nominal: row.nominal,
            keterangan: row.keterangan,
            instansi: row.instansi,
            alamat: row.alamat,
            sumber: 'BPD',
          },
        })
        upserted++
      } catch {
        skipped++
      }
    }

    return { importBatchId: batch.id, totalRows: parsed.totalRows, upserted, skipped }
  }, { timeout: 120_000 })

  return result
}

export async function getTagihanReview(): Promise<TagihanReviewResult> {
  // 1. Fetch master rows first — everything else is scoped to its NIS + period range.
  const [masterRows, lastBatch] = await Promise.all([
    prisma.tagihanBpdMaster.findMany({
      orderBy: [{ tahun: 'asc' }, { bulan: 'asc' }, { nis: 'asc' }],
    }),
    prisma.tagihanBpdImportBatch.findFirst({
      orderBy: { importedAt: 'desc' },
      select: { importedAt: true },
    }),
  ])

  // Early exit if no master rows — avoids scanning pembayaran/keringanan tables.
  if (masterRows.length === 0) {
    return {
      rows: [],
      counts: { tetap: 0, dihapus_rekonsiliasi: 0, dihapus_manual: 0 },
      lastImportAt: lastBatch?.importedAt.toISOString() ?? null,
    }
  }

  // Collect scope so pembayaran/keringanan queries filter by NIS-linked siswa
  // and periode range instead of full-table scan.
  const masterNisSet = new Set<string>()
  let minYear = Infinity
  let maxYear = -Infinity
  for (const m of masterRows) {
    masterNisSet.add(m.nis)
    if (m.tahun < minYear) minYear = m.tahun
    if (m.tahun > maxYear) maxYear = m.tahun
  }

  // 2. Resolve only the siswa referenced by master rows.
  const siswaRows = await prisma.siswa.findMany({
    where: { nis: { in: Array.from(masterNisSet) } },
    select: { id: true, nis: true },
  })
  const nisToSiswaId = new Map<string, string>()
  const siswaIds: string[] = []
  for (const s of siswaRows) {
    nisToSiswaId.set(s.nis, s.id)
    siswaIds.push(s.id)
  }

  // 3. Fetch pembayaran + keringanan only for in-scope siswa × year range.
  const [paidPembayarans, allKeringanans] = await Promise.all([
    siswaIds.length === 0
      ? Promise.resolve([] as Array<{ siswaId: string; periodYear: number; periodMonth: number; source: string; tanggalTransaksi: Date }>)
      : prisma.pembayaran.findMany({
          where: {
            statusBayar: 'TERBAYAR',
            siswaId: { in: siswaIds },
            periodYear: { gte: minYear, lte: maxYear },
          },
          select: {
            siswaId: true,
            periodYear: true,
            periodMonth: true,
            source: true,
            tanggalTransaksi: true,
          },
        }),
    siswaIds.length === 0
      ? Promise.resolve([] as Array<{ siswaId: string; periodYear: number; periodMonth: number; alasan: string | null; jenis: string }>)
      : prisma.keringanan.findMany({
          where: {
            siswaId: { in: siswaIds },
            periodYear: { gte: minYear, lte: maxYear },
          },
          select: { siswaId: true, periodYear: true, periodMonth: true, alasan: true, jenis: true },
        }),
  ])

  // Map: `${siswaId}:${year}:${month}` → { source, tanggalTransaksi }
  const rekonPaid = new Map<string, { source: string; tanggalTransaksi: Date }>()
  const manualPaid = new Map<string, { tanggalTransaksi: Date }>()
  for (const p of paidPembayarans) {
    const key = `${p.siswaId}:${p.periodYear}:${p.periodMonth}`
    if (p.source === 'IMPORT_EXCEL' || p.source === 'PASTE_SPREADSHEET') {
      rekonPaid.set(key, { source: p.source, tanggalTransaksi: p.tanggalTransaksi })
    } else if (p.source === 'MANUAL') {
      manualPaid.set(key, { tanggalTransaksi: p.tanggalTransaksi })
    }
  }

  // Map: `${siswaId}:${year}:${month}` → alasan
  const keringananMap = new Map<string, { alasan: string | null; jenis: string }>()
  for (const k of allKeringanans) {
    const key = `${k.siswaId}:${k.periodYear}:${k.periodMonth}`
    keringananMap.set(key, { alasan: k.alasan, jenis: k.jenis })
  }

  const rows: ReviewRow[] = []
  const counts = { tetap: 0, dihapus_rekonsiliasi: 0, dihapus_manual: 0 }

  for (const master of masterRows) {
    const siswaId = nisToSiswaId.get(master.nis)
    const baseRow = {
      nis: master.nis,
      nama: master.nama,
      tahun: master.tahun,
      bulan: master.bulan,
      kelas: master.kelas,
      jurusan: master.jurusan,
      nominal: Number(master.nominal),
      keterangan: master.keterangan,
      instansi: master.instansi,
      alamat: master.alamat,
      sumber: master.sumber as TagihanSumber,
    }

    if (siswaId) {
      const key = `${siswaId}:${master.tahun}:${master.bulan}`

      const rekon = rekonPaid.get(key)
      if (rekon) {
        const tgl = rekon.tanggalTransaksi.toISOString().slice(0, 10)
        rows.push({
          ...baseRow,
          status: 'dihapus_rekonsiliasi',
          alasan: `Terbayar via BPD ${tgl}`,
        })
        counts.dihapus_rekonsiliasi++
        continue
      }

      const keringanan = keringananMap.get(key)
      if (keringanan) {
        rows.push({
          ...baseRow,
          status: 'dihapus_manual',
          alasan: `Keringanan: ${keringanan.alasan ?? keringanan.jenis}`,
        })
        counts.dihapus_manual++
        continue
      }

      const manual = manualPaid.get(key)
      if (manual) {
        const tgl = manual.tanggalTransaksi.toISOString().slice(0, 10)
        rows.push({
          ...baseRow,
          status: 'dihapus_manual',
          alasan: `Pembayaran manual ${tgl}`,
        })
        counts.dihapus_manual++
        continue
      }
    }

    rows.push({ ...baseRow, status: 'tetap' })
    counts.tetap++
  }

  return {
    rows,
    counts,
    lastImportAt: lastBatch?.importedAt.toISOString() ?? null,
  }
}

export async function getLastImportBatch() {
  return prisma.tagihanBpdImportBatch.findFirst({
    orderBy: { importedAt: 'desc' },
    include: { user: { select: { nama: true } } },
  })
}

// ─── Manual add (ad-hoc per NIS) ──────────────────────────────────────────────

export interface AddManualTagihanInput {
  nis: string
  tahun: number
  bulan: number
  nominal: number
  keterangan?: string
}

export interface AddManualTagihanResult {
  created: boolean
  reason?: string
  nama?: string
}

/** Tambah 1 tagihan ad-hoc untuk NIS tertentu. Kelas/jurusan diambil dari
 *  enrollment aktif siswa (atau '-' kalau tidak ada). */
export async function addManualTagihan(
  input: AddManualTagihanInput,
  actor: { id: string },
): Promise<AddManualTagihanResult> {
  const siswa = await prisma.siswa.findUnique({
    where: { nis: input.nis },
    include: {
      enrollments: {
        include: {
          rombel: { select: { kode: true, grade: true } },
          tahunAjaran: { select: { isActive: true } },
        },
      },
    },
  })
  if (!siswa) return { created: false, reason: `Siswa NIS ${input.nis} tidak ditemukan.` }

  const existing = await prisma.tagihanBpdMaster.findUnique({
    where: { nis_tahun_bulan: { nis: input.nis, tahun: input.tahun, bulan: input.bulan } },
  })
  if (existing) return { created: false, reason: 'Tagihan untuk periode ini sudah ada di master.', nama: siswa.nama }

  const activeEnr = siswa.enrollments.find((e) => e.tahunAjaran?.isActive) ?? siswa.enrollments[0]
  const kelas = activeEnr?.rombel?.grade ? `${activeEnr.rombel.grade}.` : '-'
  const jurusan = activeEnr?.rombel?.kode
    ? activeEnr.rombel.kode.replace(/^(X|XI|XII)\./, '') || '-'
    : '-'

  const batch = await prisma.tagihanBpdImportBatch.create({
    data: {
      fileName: `Manual add - ${input.nis} ${input.tahun}-${String(input.bulan).padStart(2, '0')}`,
      fileSize: 0,
      fileHash: 'manual_' + Date.now().toString(36) + '_' + input.nis,
      importedBy: actor.id,
      totalRows: 1,
    },
  })

  await prisma.tagihanBpdMaster.create({
    data: {
      importBatchId: batch.id,
      nis: input.nis,
      nama: siswa.nama,
      tahun: input.tahun,
      bulan: input.bulan,
      kelas,
      jurusan,
      nominal: input.nominal,
      keterangan: input.keterangan?.trim() || '-',
      sumber: 'MANUAL',
    },
  })

  return { created: true, nama: siswa.nama }
}

// ─── Bulk generate dari tunggakan ─────────────────────────────────────────────

export interface BulkGenerateInput {
  /** Target periode tagihan. */
  tahun: number
  bulan: number
  /** Filter angkatan (opsional). Tanpa filter = semua siswa AKTIF. */
  angkatan?: number
}

export interface BulkGenerateResult {
  totalEligible: number
  alreadyInMaster: number
  paidViaRekon: number
  paidViaManual: number
  hasKeringanan100: number
  hasPelunasan: number
  created: number
}

/** Generate tagihan master untuk SEMUA siswa AKTIF yang punya tunggakan pada
 *  (tahun, bulan) tertentu — yaitu: tidak ada di master, tidak ada pembayaran
 *  TERBAYAR, tidak ada keringanan 100%, tidak ada pelunasan covering. */
export async function bulkGenerateFromTunggakan(
  input: BulkGenerateInput,
  actor: { id: string },
): Promise<BulkGenerateResult> {
  const { tahun, bulan, angkatan } = input

  // 1. Resolve siswa AKTIF + enrollment aktif
  const siswas = await prisma.siswa.findMany({
    where: {
      statusSiswa: 'AKTIF',
      ...(angkatan ? { angkatan } : {}),
      enrollments: { some: { tahunAjaran: { isActive: true } } },
    },
    include: {
      enrollments: {
        include: {
          rombel: { select: { kode: true, grade: true } },
          tahunAjaran: { select: { isActive: true, nominalSppDefault: true } },
        },
      },
    },
  })

  const siswaIds = siswas.map((s) => s.id)
  if (siswaIds.length === 0) {
    return {
      totalEligible: 0,
      alreadyInMaster: 0,
      paidViaRekon: 0,
      paidViaManual: 0,
      hasKeringanan100: 0,
      hasPelunasan: 0,
      created: 0,
    }
  }

  // 2. Cek apa saja yang sudah covered untuk (tahun, bulan) tsb
  const [existingMaster, pembayarans, keringananFull, pelunasans] = await Promise.all([
    prisma.tagihanBpdMaster.findMany({
      where: { tahun, bulan, nis: { in: siswas.map((s) => s.nis) } },
      select: { nis: true },
    }),
    prisma.pembayaran.findMany({
      where: {
        siswaId: { in: siswaIds },
        periodYear: tahun,
        periodMonth: bulan,
        statusBayar: 'TERBAYAR',
      },
      select: { siswaId: true, source: true },
    }),
    prisma.keringanan.findMany({
      where: {
        siswaId: { in: siswaIds },
        periodYear: tahun,
        periodMonth: bulan,
        persentase: 100,
      },
      select: { siswaId: true },
    }),
    prisma.pelunasan.findMany({
      where: { siswaId: { in: siswaIds } },
      select: { siswaId: true, periodeMulai: true, periodeAkhir: true },
    }),
  ])

  const existingMasterNis = new Set(existingMaster.map((m) => m.nis))
  const paidRekonSiswaIds = new Set<string>()
  const paidManualSiswaIds = new Set<string>()
  for (const p of pembayarans) {
    if (p.source === 'IMPORT_EXCEL' || p.source === 'PASTE_SPREADSHEET') {
      paidRekonSiswaIds.add(p.siswaId)
    } else {
      paidManualSiswaIds.add(p.siswaId)
    }
  }
  const keringanan100SiswaIds = new Set(keringananFull.map((k) => k.siswaId))

  const targetNum = tahun * 100 + bulan
  const pelunasanSiswaIds = new Set<string>()
  for (const pl of pelunasans) {
    const [sy, sm] = pl.periodeMulai.split('-').map(Number)
    const [ey, em] = pl.periodeAkhir.split('-').map(Number)
    if (!sy || !sm || !ey || !em) continue
    const startNum = sy * 100 + sm
    const endNum = ey * 100 + em
    if (targetNum >= startNum && targetNum <= endNum) {
      pelunasanSiswaIds.add(pl.siswaId)
    }
  }

  // 3. Filter: siswa yang BELUM ditagih DAN belum covered
  type Eligible = {
    nis: string
    nama: string
    kelas: string
    jurusan: string
    nominal: number
  }
  const eligible: Eligible[] = []
  for (const s of siswas) {
    if (existingMasterNis.has(s.nis)) continue
    if (paidRekonSiswaIds.has(s.id)) continue
    if (paidManualSiswaIds.has(s.id)) continue
    if (keringanan100SiswaIds.has(s.id)) continue
    if (pelunasanSiswaIds.has(s.id)) continue

    const activeEnr = s.enrollments.find((e) => e.tahunAjaran?.isActive) ?? s.enrollments[0]
    const nominal = Number(activeEnr?.tahunAjaran?.nominalSppDefault ?? 350000)
    const kelas = activeEnr?.rombel?.grade ? `${activeEnr.rombel.grade}.` : '-'
    const jurusan = activeEnr?.rombel?.kode
      ? activeEnr.rombel.kode.replace(/^(X|XI|XII)\./, '') || '-'
      : '-'
    eligible.push({ nis: s.nis, nama: s.nama, kelas, jurusan, nominal })
  }

  if (eligible.length === 0) {
    return {
      totalEligible: siswas.length,
      alreadyInMaster: existingMaster.length,
      paidViaRekon: paidRekonSiswaIds.size,
      paidViaManual: paidManualSiswaIds.size,
      hasKeringanan100: keringanan100SiswaIds.size,
      hasPelunasan: pelunasanSiswaIds.size,
      created: 0,
    }
  }

  // 4. Create batch + insert tagihan
  const batch = await prisma.tagihanBpdImportBatch.create({
    data: {
      fileName: `Bulk generate dari tunggakan ${tahun}-${String(bulan).padStart(2, '0')}${angkatan ? ` (angkatan ${angkatan})` : ''}`,
      fileSize: 0,
      fileHash: 'bulk_' + Date.now().toString(36) + '_' + tahun + bulan,
      importedBy: actor.id,
      totalRows: eligible.length,
    },
  })

  await prisma.tagihanBpdMaster.createMany({
    data: eligible.map((e) => ({
      importBatchId: batch.id,
      nis: e.nis,
      nama: e.nama,
      tahun,
      bulan,
      kelas: e.kelas,
      jurusan: e.jurusan,
      nominal: e.nominal,
      keterangan: '-',
      sumber: 'AUTO_GENERATE' as const,
    })),
    skipDuplicates: true,
  })

  return {
    totalEligible: siswas.length,
    alreadyInMaster: existingMaster.length,
    paidViaRekon: paidRekonSiswaIds.size,
    paidViaManual: paidManualSiswaIds.size,
    hasKeringanan100: keringanan100SiswaIds.size,
    hasPelunasan: pelunasanSiswaIds.size,
    created: eligible.length,
  }
}
