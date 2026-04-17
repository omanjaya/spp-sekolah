import ExcelJS from 'exceljs'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { prisma } from '@/lib/db'
import { auditLogRepo } from '@/repositories/audit-log.repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  tahunAjaranId: z.string().optional(),
  angkatan: z.coerce.number().int().min(2000).max(2100).optional(),
  format: z.enum(['xlsx', 'txt']).default('xlsx'),
})

/**
 * Header sesuai template asik.bpdbali Upload Tagihan:
 * id, nama, jum_tagihan, instansi, Alamat, Kelas, Jurusan, Tahun, Bulan, Dana Masyarakat, Keterangan
 *
 * Hanya export periode yang BELUM TERBAYAR (tidak ada Pembayaran/Keringanan/Pelunasan).
 */

const INSTANSI = 'SMAN_1_DENPASAR'
const ALAMAT = 'Jl Kamboja No 4'
const NOMINAL = 350000

export async function GET(req: NextRequest): Promise<Response> {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const params = querySchema.parse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  )

  // Get target TA
  const ta = params.tahunAjaranId
    ? await prisma.tahunAjaran.findUnique({ where: { id: params.tahunAjaranId } })
    : await prisma.tahunAjaran.findFirst({ where: { isActive: true } })

  if (!ta) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Tahun ajaran tidak ditemukan.' } },
      { status: 404 },
    )
  }

  // Get all enrolled siswa for this TA (or filter by angkatan)
  const enrollments = await prisma.enrollment.findMany({
    where: {
      tahunAjaranId: ta.id,
      ...(params.angkatan ? { siswa: { angkatan: params.angkatan } } : {}),
      siswa: { statusSiswa: 'AKTIF' },
    },
    include: {
      siswa: { select: { id: true, nis: true, nama: true, angkatan: true } },
      rombel: { select: { kode: true, grade: true, nomor: true } },
    },
  })

  // For each siswa, determine their full SPP window (36 months)
  // Then find which periods are NOT yet paid
  const siswaIds = enrollments.map((e) => e.siswa.id)

  // Fetch all paid periods (Pembayaran + Keringanan)
  const [payments, keringanans] = await Promise.all([
    prisma.pembayaran.findMany({
      where: { siswaId: { in: siswaIds }, statusBayar: 'TERBAYAR' },
      select: { siswaId: true, periodYear: true, periodMonth: true },
    }),
    prisma.keringanan.findMany({
      where: { siswaId: { in: siswaIds } },
      select: { siswaId: true, periodYear: true, periodMonth: true },
    }),
  ])

  // Fetch pelunasan ranges
  const pelunasans = await prisma.pelunasan.findMany({
    where: { siswaId: { in: siswaIds } },
    select: { siswaId: true, periodeMulai: true, periodeAkhir: true },
  })

  // Build paid-set per siswa
  const paidSet = new Map<string, Set<string>>()
  const slotKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

  for (const p of payments) {
    const s = paidSet.get(p.siswaId) ?? new Set()
    s.add(slotKey(p.periodYear, p.periodMonth))
    paidSet.set(p.siswaId, s)
  }
  for (const k of keringanans) {
    const s = paidSet.get(k.siswaId) ?? new Set()
    s.add(slotKey(k.periodYear, k.periodMonth))
    paidSet.set(k.siswaId, s)
  }
  for (const pl of pelunasans) {
    const s = paidSet.get(pl.siswaId) ?? new Set()
    const [y1, m1] = pl.periodeMulai.split('-').map(Number)
    const [y2, m2] = pl.periodeAkhir.split('-').map(Number)
    let y = y1!, m = m1!
    while (y < y2! || (y === y2! && m <= m2!)) {
      s.add(slotKey(y, m))
      m++
      if (m > 12) { m = 1; y++ }
    }
    paidSet.set(pl.siswaId, s)
  }

  // Generate SPP window per siswa (36 months based on angkatan)
  interface TagihanRow {
    id: string       // NIS
    nama: string
    jum_tagihan: string
    instansi: string
    Alamat: string
    Kelas: string
    Jurusan: string | number
    Tahun: number
    Bulan: number
    'Dana Masyarakat': number
    Keterangan: string
  }

  const rows: TagihanRow[] = []

  for (const enr of enrollments) {
    const angk = enr.siswa.angkatan
    const paid = paidSet.get(enr.siswa.id) ?? new Set()

    // SPP window: Jul(angk) → Jun(angk+3)
    for (let grade = 0; grade < 3; grade++) {
      const gradeLabel = ['X.', 'XI.', 'XII.'][grade]!
      for (let i = 0; i < 12; i++) {
        const month = i < 6 ? 7 + i : i - 5  // Jul..Dec, Jan..Jun
        const year = i < 6 ? angk + grade : angk + grade + 1
        const key = slotKey(year, month)

        if (paid.has(key)) continue // sudah bayar, skip

        // Jurusan: extract from rombel kode (e.g., "XI.6" → "6", "X.MIPA1" → "MIPA1")
        const jurusan = enr.rombel.kode.replace(/^(X{1,3}|XII|XI|X)\./, '')

        rows.push({
          id: enr.siswa.nis,
          nama: enr.siswa.nama,
          jum_tagihan: `${NOMINAL}.00`,
          instansi: INSTANSI,
          Alamat: ALAMAT,
          Kelas: gradeLabel,
          Jurusan: jurusan,
          Tahun: year,
          Bulan: month,
          'Dana Masyarakat': NOMINAL,
          Keterangan: '-',
        })
      }
    }
  }

  // Sort: by NIS, then year, then month
  rows.sort((a, b) =>
    a.id !== b.id ? a.id.localeCompare(b.id)
    : a.Tahun !== b.Tahun ? a.Tahun - b.Tahun
    : a.Bulan - b.Bulan
  )

  // Audit
  await auditLogRepo
    .create({
      user: { connect: { id: actor.userId } },
      action: 'EXPORT_TAGIHAN_MASTER',
      entity: 'Tagihan',
      metadata: {
        format: params.format,
        tahunAjaran: ta.kode,
        angkatan: params.angkatan ?? 'semua',
        totalRows: rows.length,
        totalSiswa: new Set(rows.map((r) => r.id)).size,
      },
    })
    .catch(() => {})

  const dateStr = new Date().toISOString().slice(0, 10)

  if (params.format === 'txt') {
    // Tab-delimited TXT
    const header = 'id\tnama\tjum_tagihan\tinstansi\tAlamat\tKelas\tJurusan\tTahun\tBulan\tDana Masyarakat\tKeterangan'
    const lines = rows.map((r) =>
      `${r.id}\t${r.nama}\t${r.jum_tagihan}\t${r.instansi}\t${r.Alamat}\t${r.Kelas}\t${r.Jurusan}\t${r.Tahun}\t${r.Bulan}\t${r['Dana Masyarakat']}\t${r.Keterangan}`
    )
    const content = [header, ...lines].join('\n')
    const filename = `Tagihan_${INSTANSI}_belum_bayar_${dateStr}.txt`

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // Excel format
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistem Pembayaran SPP SMAN 1 Denpasar'
  const ws = wb.addWorksheet('Tagihan Belum Bayar', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws.columns = [
    { header: 'id', key: 'id', width: 12 },
    { header: 'nama', key: 'nama', width: 40 },
    { header: 'jum_tagihan', key: 'jum_tagihan', width: 14 },
    { header: 'instansi', key: 'instansi', width: 22 },
    { header: 'Alamat', key: 'Alamat', width: 22 },
    { header: 'Kelas', key: 'Kelas', width: 8 },
    { header: 'Jurusan', key: 'Jurusan', width: 10 },
    { header: 'Tahun', key: 'Tahun', width: 8 },
    { header: 'Bulan', key: 'Bulan', width: 8 },
    { header: 'Dana Masyarakat', key: 'DanaMasyarakat', width: 16 },
    { header: 'Keterangan', key: 'Keterangan', width: 14 },
  ]

  ws.getRow(1).font = { bold: true }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } }

  for (const r of rows) {
    ws.addRow({
      id: r.id,
      nama: r.nama,
      jum_tagihan: r.jum_tagihan,
      instansi: r.instansi,
      Alamat: r.Alamat,
      Kelas: r.Kelas,
      Jurusan: r.Jurusan,
      Tahun: r.Tahun,
      Bulan: r.Bulan,
      DanaMasyarakat: r['Dana Masyarakat'],
      Keterangan: r.Keterangan,
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  const filename = `Tagihan_${INSTANSI}_belum_bayar_${dateStr}.xlsx`

  return new NextResponse(buf as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
