import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse, type NextRequest } from 'next/server'

import { requireAuth } from '@/lib/api-handler'
import { prisma } from '@/lib/db'
import { pembayaranFilterSchema } from '@/lib/validators/pembayaran.schema'
import { pembayaranService } from '@/services/pembayaran.service'
import { auditLogRepo } from '@/repositories/audit-log.repo'
import { RekonsiliasiPdfDocument } from '@/lib/pdf/rekonsiliasi-document'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

async function getSetting(key: string): Promise<string | null> {
  try {
    const s = await prisma.setting.findUnique({ where: { key } })
    const v = s?.value
    if (v === null || v === undefined) return null
    return typeof v === 'string' ? v : String(v)
  } catch {
    return null
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const actor = await requireAuth()
  const params = pembayaranFilterSchema.parse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  )
  const { limit: _l, page: _p, ...rest } = params
  void _l; void _p
  const rowsRaw = await pembayaranService.listAll({ ...rest, limit: 100_000, page: 1 } as typeof params)

  // Sort: NIS asc → tahun ajaran asc → bulan urut tahun ajaran (Juli=0 … Juni=11)
  const monthOrder = (m: number) => (m >= 7 ? m - 7 : m + 5)
  const taStart = (y: number, m: number) => (m >= 7 ? y : y - 1)
  const rows = [...rowsRaw].sort((a, b) => {
    const nisCmp = (a.siswa?.nis ?? '').localeCompare(b.siswa?.nis ?? '')
    if (nisCmp !== 0) return nisCmp
    const taCmp = taStart(a.periodYear, a.periodMonth) - taStart(b.periodYear, b.periodMonth)
    if (taCmp !== 0) return taCmp
    return monthOrder(a.periodMonth) - monthOrder(b.periodMonth)
  })

  const [schoolName, schoolAddress] = await Promise.all([
    getSetting('school.name'),
    getSetting('school.address'),
  ])

  // Build human-readable filter summary
  const filters: Array<{ label: string; value: string }> = []
  if (rest.q) filters.push({ label: 'Pencarian', value: rest.q })
  if (rest.angkatan) filters.push({ label: 'Angkatan', value: String(rest.angkatan) })
  if (rest.year) filters.push({ label: 'Tahun', value: String(rest.year) })
  if (rest.month) {
    const m = Number(rest.month)
    filters.push({ label: 'Bulan', value: MONTHS_ID[m - 1] ?? String(m) })
  }
  if (rest.kodeCabang) filters.push({ label: 'Cabang', value: rest.kodeCabang })
  if (rest.tellerUser) filters.push({ label: 'Teller', value: rest.tellerUser })
  if (rest.status) {
    filters.push({
      label: 'Status',
      value: rest.status === 'TERBAYAR' ? 'Terbayar' : 'Dibatalkan',
    })
  }

  const totalAmount = rows.reduce((s, r) => s + Number(r.amount), 0)

  const buf = await renderToBuffer(
    <RekonsiliasiPdfDocument
      schoolName={schoolName ?? 'SMAN 1 Denpasar'}
      schoolAddress={schoolAddress}
      generatedAt={new Date()}
      filters={filters}
      rows={rows}
      totalAmount={totalAmount}
    />,
  )

  await auditLogRepo
    .create({
      user: { connect: { id: actor.userId } },
      action: 'EXPORT_REKONSILIASI_PDF',
      entity: 'Pembayaran',
      metadata: {
        rowCount: rows.length,
        totalAmount,
        filter: JSON.parse(JSON.stringify(rest)),
      },
    })
    .catch(() => {})

  const filename = `rekonsiliasi-${new Date().toISOString().slice(0, 10)}.pdf`

  return new NextResponse(buf as unknown as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
