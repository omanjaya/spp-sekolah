import ExcelJS from 'exceljs'
import { NextResponse, type NextRequest } from 'next/server'

import { requireAuth } from '@/lib/api-handler'
import { pembayaranFilterSchema } from '@/lib/validators/pembayaran.schema'
import { pembayaranService } from '@/services/pembayaran.service'
import { auditLogRepo } from '@/repositories/audit-log.repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${dd}/${mm}/${yy} ${h}:${mi}:${s}`
}

export async function GET(req: NextRequest): Promise<Response> {
  const actor = await requireAuth()
  const params = pembayaranFilterSchema.parse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  )
  // ignore page/limit for export — export all matching rows
  const { limit: _l, page: _p, ...rest } = params
  void _l; void _p
  const rows = await pembayaranService.listAll({ ...rest, limit: 100_000, page: 1 } as typeof params)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistem Pembayaran SPP SMAN 1 Denpasar'
  wb.created = new Date()

  const ws = wb.addWorksheet('Rekonsiliasi', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws.columns = [
    { header: 'Instansi', key: 'instansi', width: 20 },
    { header: 'No. Tagihan', key: 'nis', width: 12 },
    { header: 'Nama', key: 'nama', width: 40 },
    { header: 'Angkatan', key: 'angkatan', width: 10 },
    { header: 'Tagihan', key: 'amount', width: 14 },
    { header: 'Biaya Adm.', key: 'biayaAdm', width: 12 },
    { header: 'Alamat', key: 'alamat', width: 24 },
    { header: 'Kelas', key: 'kelas', width: 8 },
    { header: 'Rombel', key: 'rombel', width: 12 },
    { header: 'Tahun', key: 'tahun', width: 8 },
    { header: 'Bulan', key: 'bulan', width: 8 },
    { header: 'Periode', key: 'periode', width: 16 },
    { header: 'Tanggal Transaksi', key: 'tgl', width: 22 },
    { header: 'Status Bayar', key: 'status', width: 14 },
    { header: 'Kode Cabang', key: 'cabang', width: 12 },
    { header: 'User', key: 'teller', width: 14 },
    { header: 'No. Bukti', key: 'noBukti', width: 18 },
    { header: 'Sumber', key: 'source', width: 10 },
    { header: 'Catatan', key: 'catatan', width: 30 },
  ]

  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }

  for (const r of rows) {
    ws.addRow({
      instansi: 'SMAN_1_DENPASAR',
      nis: r.siswa?.nis ?? '',
      nama: r.siswa?.nama ?? '',
      angkatan: r.siswa?.angkatan ?? '',
      amount: Number(r.amount),
      biayaAdm: Number(r.biayaAdm),
      alamat: r.siswa?.alamat ?? '',
      kelas: r.rombel?.grade ?? '',
      rombel: r.rombel?.kode ?? '',
      tahun: r.periodYear,
      bulan: r.periodMonth,
      periode: `${MONTHS_ID[r.periodMonth - 1] ?? ''} ${r.periodYear}`,
      tgl: fmtDate(new Date(r.tanggalTransaksi)),
      status: r.statusBayar === 'TERBAYAR' ? 'Terbayar' : 'Dibatalkan',
      cabang: r.kodeCabang ?? '',
      teller: r.tellerUser ?? '',
      noBukti: r.noBukti ?? '',
      source:
        r.source === 'IMPORT_EXCEL'
          ? 'Excel'
          : r.source === 'PASTE_SPREADSHEET'
            ? 'Paste'
            : 'Manual',
      catatan: r.catatan ?? '',
    })
  }

  // Number format for currency columns
  ws.getColumn('amount').numFmt = '#,##0'
  ws.getColumn('biayaAdm').numFmt = '#,##0'

  // Total row
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  const totalRow = ws.addRow({
    nama: `Total (${rows.length} transaksi)`,
    amount: total,
  })
  totalRow.font = { bold: true }
  totalRow.getCell('amount').numFmt = '#,##0'

  const buf = await wb.xlsx.writeBuffer()

  // Audit
  await auditLogRepo
    .create({
      user: { connect: { id: actor.userId } },
      action: 'EXPORT_REKONSILIASI_EXCEL',
      entity: 'Pembayaran',
      metadata: { rowCount: rows.length, filter: JSON.parse(JSON.stringify(rest)) },
    })
    .catch(() => {})

  const filename = `rekonsiliasi-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buf as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
