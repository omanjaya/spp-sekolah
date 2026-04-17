import { prisma } from '@/lib/db'
import type { TagihanBpdParseResult } from '@/lib/excel/tagihan-bpd-parser'

export type ReviewStatus = 'tetap' | 'dihapus_rekonsiliasi' | 'dihapus_manual'

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
  // Delete all existing master rows (full replace strategy)
  // We use a transaction to atomically swap the batch
  const result = await prisma.$transaction(async (tx) => {
    // Delete previous master data
    await tx.tagihanBpdMaster.deleteMany()

    // Create new import batch
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

    // Bulk insert rows
    const insertData = parsed.rows.map((row) => ({
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
    }))

    if (insertData.length > 0) {
      const inserted = await tx.tagihanBpdMaster.createMany({
        data: insertData,
        skipDuplicates: true,
      })
      upserted = inserted.count
      skipped = parsed.rows.length - upserted
    }

    return { importBatchId: batch.id, totalRows: parsed.totalRows, upserted, skipped }
  })

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
