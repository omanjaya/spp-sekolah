import { NextResponse, type NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { z } from 'zod'

import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { pembayaranService } from '@/services/pembayaran.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des']

function monthLabel(m: number): string {
  return MONTH_LABELS[m - 1] ?? String(m)
}

const filterSchema = z.object({
  siswaId: z.string().optional(),
  periodYear: z.coerce.number().int().min(2000).max(2100).optional(),
  periodMonth: z.coerce.number().int().min(1).max(12).optional(),
  statusBayar: z.enum(['TERBAYAR', 'DIBATALKAN']).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  angkatan: z.coerce.number().int().optional(),
  rombelId: z.string().optional(),
  tahunAjaranId: z.string().optional(),
  q: z.string().optional(),
  source: z.enum(['IMPORT_EXCEL', 'PASTE_SPREADSHEET', 'MANUAL']).optional(),
})

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

export async function GET(req: NextRequest): Promise<Response> {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])

  const raw = Object.fromEntries(req.nextUrl.searchParams)
  const filter = filterSchema.parse(raw)

  // Fetch all matching pembayaran (no pagination)
  const items = await pembayaranService.listAll({
    page: 1,
    limit: 10000,
    siswaId: filter.siswaId,
    year: filter.periodYear,
    month: filter.periodMonth,
    status: filter.statusBayar,
    angkatan: filter.angkatan,
    rombelId: filter.rombelId,
    tahunAjaranId: filter.tahunAjaranId,
    q: filter.q,
    source: filter.source,
    sortBy: 'tanggalTransaksi',
    sortOrder: 'desc',
  })

  // Build workbook
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SMAN 1 Denpasar - Sistem Pembayaran SPP'
  wb.created = new Date()

  const ws = wb.addWorksheet('Data Pembayaran')

  // Header row
  ws.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'NIS', key: 'nis', width: 16 },
    { header: 'Nama Siswa', key: 'nama', width: 30 },
    { header: 'Periode', key: 'periode', width: 12 },
    { header: 'Jumlah', key: 'jumlah', width: 18 },
    { header: 'Biaya Adm', key: 'biayaAdm', width: 16 },
    { header: 'Tanggal Transaksi', key: 'tanggal', width: 20 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Source', key: 'source', width: 20 },
    { header: 'No Bukti', key: 'noBukti', width: 22 },
    { header: 'Catatan', key: 'catatan', width: 40 },
  ]

  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' },
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 20

  // Data rows
  items.forEach((p, idx) => {
    const periode = `${monthLabel(p.periodMonth)} ${p.periodYear}`
    const tanggal = new Date(p.tanggalTransaksi).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

    const row = ws.addRow({
      no: idx + 1,
      nis: p.siswa?.nis ?? '—',
      nama: p.siswa?.nama ?? '—',
      periode,
      jumlah: p.amount,
      biayaAdm: p.biayaAdm,
      tanggal,
      status: p.statusBayar,
      source: p.source,
      noBukti: p.noBukti ?? '',
      catatan: p.catatan ?? '',
    })

    // Zebra rows
    if (idx % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      }
    }

    // Number format for amount columns
    row.getCell('jumlah').numFmt = '#,##0'
    row.getCell('biayaAdm').numFmt = '#,##0'

    // Color status
    const statusCell = row.getCell('status')
    if (p.statusBayar === 'DIBATALKAN') {
      statusCell.font = { color: { argb: 'FFDC2626' } }
    } else {
      statusCell.font = { color: { argb: 'FF16A34A' } }
    }
  })

  // Summary row
  ws.addRow([])
  const totalRow = ws.addRow({
    no: '',
    nis: '',
    nama: 'TOTAL',
    periode: '',
    jumlah: items.reduce((acc, p) => acc + p.amount, 0),
    biayaAdm: items.reduce((acc, p) => acc + p.biayaAdm, 0),
  })
  totalRow.font = { bold: true }
  totalRow.getCell('jumlah').numFmt = '#,##0'
  totalRow.getCell('biayaAdm').numFmt = '#,##0'

  // Freeze header
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  // Auto filter
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 11 },
  }

  const buffer = await wb.xlsx.writeBuffer()
  const stamp = new Date().toISOString().slice(0, 10)
  const fileName = `Pembayaran_${stamp}.xlsx`

  const body = new Uint8Array(buffer as ArrayBuffer)

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(body.byteLength),
    },
  })
}
