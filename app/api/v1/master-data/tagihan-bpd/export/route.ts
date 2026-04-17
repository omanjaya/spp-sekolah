import ExcelJS from 'exceljs'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { ValidationError } from '@/core/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ReviewRowSchema = z.object({
  nis: z.string(),
  nama: z.string(),
  tahun: z.number().int(),
  bulan: z.number().int().min(1).max(12),
  kelas: z.string(),
  jurusan: z.string(),
  nominal: z.number(),
  keterangan: z.string(),
  instansi: z.string(),
  alamat: z.string(),
  status: z.enum(['tetap', 'dihapus_rekonsiliasi', 'dihapus_manual']),
  alasan: z.string().optional(),
})

const BodySchema = z.object({
  rows: z.array(ReviewRowSchema),
})

export async function POST(req: NextRequest): Promise<Response> {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])

  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ValidationError('Body tidak valid JSON.')
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Data tidak valid.')
  }

  const tetapRows = parsed.data.rows.filter((r) => r.status === 'tetap')

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistem Pembayaran SPP SMAN 1 Denpasar'
  wb.created = new Date()

  const ws = wb.addWorksheet('Tagihan', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws.columns = [
    { header: 'id', key: 'id', width: 14 },
    { header: 'nama', key: 'nama', width: 40 },
    { header: 'jum_tagihan', key: 'jum_tagihan', width: 16 },
    { header: 'instansi', key: 'instansi', width: 20 },
    { header: 'Alamat', key: 'Alamat', width: 24 },
    { header: 'Kelas', key: 'Kelas', width: 8 },
    { header: 'Jurusan', key: 'Jurusan', width: 12 },
    { header: 'Tahun', key: 'Tahun', width: 8 },
    { header: 'Bulan', key: 'Bulan', width: 8 },
    { header: 'Dana Masyarakat', key: 'DanaMasyarakat', width: 18 },
    { header: 'Keterangan', key: 'Keterangan', width: 20 },
  ]

  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  }

  for (const row of tetapRows) {
    const bulanPadded = String(row.bulan).padStart(2, '0')
    ws.addRow({
      id: row.nis,
      nama: row.nama,
      jum_tagihan: `${row.nominal.toFixed(2)}`,
      instansi: row.instansi,
      Alamat: row.alamat,
      Kelas: row.kelas,
      Jurusan: row.jurusan,
      Tahun: row.tahun,
      Bulan: bulanPadded,
      DanaMasyarakat: row.nominal,
      Keterangan: row.keterangan,
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  const date = new Date().toISOString().slice(0, 10)
  const filename = `Tagihan_SMAN_1_DENPASAR_upload_${date}.xlsx`

  return new NextResponse(buf as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
