import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import ExcelJS from 'exceljs'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  tahunAjaranId: z.string().optional(),
  grade: z.enum(['X', 'XI', 'XII']).optional(),
})

const INSTANSI = 'SMAN_1_DENPASAR'
const ALAMAT = 'Jl Kamboja No 4'
const NOMINAL_FALLBACK = 350000

export interface TagihanRow {
  _key: string
  id: string
  nama: string
  jum_tagihan: string
  instansi: string
  Alamat: string
  Kelas: string
  Jurusan: string
  Tahun: number
  Bulan: number
  DanaMasyarakat: number
  Keterangan: string
}

const slotKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

async function buildTagihanRows(
  tahunAjaranId?: string,
  gradeFilter?: string,
): Promise<{ rows: TagihanRow[]; taKode: string }> {
  const ta = tahunAjaranId
    ? await prisma.tahunAjaran.findUnique({ where: { id: tahunAjaranId } })
    : await prisma.tahunAjaran.findFirst({ where: { isActive: true } })

  if (!ta) throw new Error('Tahun ajaran tidak ditemukan.')

  const NOMINAL = ta.nominalSppDefault ? Number(ta.nominalSppDefault) : NOMINAL_FALLBACK

  const enrollments = await prisma.enrollment.findMany({
    where: {
      tahunAjaranId: ta.id,
      siswa: { statusSiswa: 'AKTIF' },
      ...(gradeFilter ? { rombel: { grade: gradeFilter as 'X' | 'XI' | 'XII' } } : {}),
    },
    include: {
      siswa: { select: { id: true, nis: true, nama: true, angkatan: true } },
      rombel: { select: { kode: true, grade: true, nomor: true } },
    },
  })

  const siswaIds = enrollments.map((e) => e.siswa.id)

  const [payments, keringanans, pelunasans] = await Promise.all([
    prisma.pembayaran.findMany({
      where: { siswaId: { in: siswaIds }, statusBayar: 'TERBAYAR' },
      select: { siswaId: true, periodYear: true, periodMonth: true },
    }),
    prisma.keringanan.findMany({
      where: { siswaId: { in: siswaIds } },
      select: { siswaId: true, periodYear: true, periodMonth: true },
    }),
    prisma.pelunasan.findMany({
      where: { siswaId: { in: siswaIds } },
      select: { siswaId: true, periodeMulai: true, periodeAkhir: true },
    }),
  ])

  const paidSet = new Map<string, Set<string>>()
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

  const rows: TagihanRow[] = []

  for (const enr of enrollments) {
    const angk = enr.siswa.angkatan
    const paid = paidSet.get(enr.siswa.id) ?? new Set()
    const jurusan = enr.rombel.kode.replace(/^(X{1,3}|XII|XI|X)\./, '')

    for (let grade = 0; grade < 3; grade++) {
      const gradeLabel = ['X.', 'XI.', 'XII.'][grade]!
      for (let i = 0; i < 12; i++) {
        const month = i < 6 ? 7 + i : i - 5
        const year = i < 6 ? angk + grade : angk + grade + 1
        const key = slotKey(year, month)

        if (paid.has(key)) continue

        const rowKey = `${enr.siswa.nis}-${year}-${month}`
        rows.push({
          _key: rowKey,
          id: enr.siswa.nis,
          nama: enr.siswa.nama,
          jum_tagihan: `${NOMINAL}.00`,
          instansi: INSTANSI,
          Alamat: ALAMAT,
          Kelas: gradeLabel,
          Jurusan: jurusan,
          Tahun: year,
          Bulan: month,
          DanaMasyarakat: NOMINAL,
          Keterangan: '-',
        })
      }
    }
  }

  rows.sort((a, b) =>
    a.id !== b.id ? a.id.localeCompare(b.id)
    : a.Tahun !== b.Tahun ? a.Tahun - b.Tahun
    : a.Bulan - b.Bulan,
  )

  return { rows, taKode: ta.kode }
}

/**
 * GET  — return tagihan data as JSON for the editable table
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])
  const params = querySchema.parse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  )
  const { rows, taKode } = await buildTagihanRows(params.tahunAjaranId, params.grade)
  return { data: { rows, taKode }, meta: { total: rows.length } }
})

/**
 * POST — export edited tagihan rows to xlsx
 */
const exportBodySchema = z.object({
  rows: z.array(z.object({
    id: z.string(),
    nama: z.string(),
    jum_tagihan: z.string(),
    instansi: z.string(),
    Alamat: z.string(),
    Kelas: z.string(),
    Jurusan: z.union([z.string(), z.number()]),
    Tahun: z.number(),
    Bulan: z.number(),
    DanaMasyarakat: z.number(),
    Keterangan: z.string(),
  })),
})

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const { rows } = exportBodySchema.parse(await req.json())

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
    ws.addRow(r)
  }

  const buf = await wb.xlsx.writeBuffer()
  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = `Tagihan_SMAN_1_DENPASAR_belum_bayar_${dateStr}.xlsx`

  return new NextResponse(buf as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
})
