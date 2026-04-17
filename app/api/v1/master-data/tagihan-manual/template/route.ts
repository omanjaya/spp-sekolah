import ExcelJS from 'exceljs'
import { NextResponse } from 'next/server'

import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistem Pembayaran SPP SMAN 1 Denpasar'
  wb.created = new Date()

  const ws = wb.addWorksheet('Pembayaran Manual')

  ws.columns = [
    { header: 'NIS', key: 'NIS', width: 14 },
    { header: 'Tahun_Dari', key: 'Tahun_Dari', width: 12 },
    { header: 'Bulan_Dari', key: 'Bulan_Dari', width: 12 },
    { header: 'Tahun_Sampai', key: 'Tahun_Sampai', width: 14 },
    { header: 'Bulan_Sampai', key: 'Bulan_Sampai', width: 14 },
    { header: 'Keterangan', key: 'Keterangan', width: 40 },
  ]

  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

  // Example data row
  ws.addRow({
    NIS: '22951',
    Tahun_Dari: 2024,
    Bulan_Dari: 7,
    Tahun_Sampai: 2025,
    Bulan_Sampai: 6,
    Keterangan: 'Pembayaran tunai / keringanan kurang mampu',
  })

  // Notes row
  const noteRow = ws.addRow({
    NIS: '← NIS siswa (wajib)',
    Tahun_Dari: '← tahun mulai (mis. 2024)',
    Bulan_Dari: '← bulan mulai 1-12',
    Tahun_Sampai: '← tahun akhir (mis. 2025)',
    Bulan_Sampai: '← bulan akhir 1-12',
    Keterangan: '← alasan / keterangan (wajib)',
  })
  noteRow.font = { italic: true, color: { argb: 'FF94A3B8' } }

  const buf = await wb.xlsx.writeBuffer()

  return new NextResponse(buf as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Template_PembayaranManual.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
